import type { ConsumeMessage } from "amqplib";
import type { PaymentRequest } from "./domain";
import { idempotencyResponse, isRetryAllowed, nextRetryCount, shouldSettle } from "./domain";
import { PaymentInfra } from "./payment-infra";

export type PaymentRecord = PaymentRequest & { status: string; duplicate?: boolean };

function memcacheGet(infra: PaymentInfra, key: string): Promise<string | null> {
  return new Promise((resolve, reject) =>
    infra.memcached.get(key, (error, value) => {
      if (error) reject(error);
      else resolve(value ? value.toString() : null);
    }),
  );
}

function memcacheSet(infra: PaymentInfra, key: string, value: string): Promise<void> {
  return new Promise((resolve, reject) =>
    infra.memcached.set(key, value, { expires: 300 }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}

export class PaymentService {
  constructor(readonly infra: PaymentInfra) {}

  async find(paymentId: string): Promise<PaymentRecord | null> {
    const rows = await this.infra.pg`
      SELECT payment_id, merchant_id, amount, currency, status
      FROM payments WHERE payment_id = ${paymentId}
    `;
    const row = rows[0];
    return row
      ? {
          paymentId: String(row.payment_id), merchantId: String(row.merchant_id),
          amount: Number(row.amount), currency: String(row.currency), status: String(row.status),
        }
      : null;
  }

  async create(input: PaymentRequest, idempotencyKey: string): Promise<PaymentRecord> {
    const existingPaymentId = await this.infra.redis.get(`idempotency:${idempotencyKey}`);
    const resolved = idempotencyResponse(existingPaymentId ? await this.find(existingPaymentId) : null);
    if (resolved.duplicate && resolved.value) return { ...resolved.value, duplicate: true };

    const merchantCacheKey = `merchant:${input.merchantId}`;
    let merchantStatus = await memcacheGet(this.infra, merchantCacheKey);
    if (!merchantStatus) {
      const [rows] = await this.infra.merchants.query(
        "SELECT status FROM merchants WHERE merchant_id = ?",
        [input.merchantId],
      );
      merchantStatus = String((rows as Array<{ status: string }>)[0]?.status ?? "");
      if (!merchantStatus) throw new Error("merchant not found");
      await memcacheSet(this.infra, merchantCacheKey, merchantStatus);
    }
    if (merchantStatus !== "active") throw new Error("merchant is not active");

    const [riskRows] = await this.infra.risk.query(
      "SELECT max_amount FROM risk_rules WHERE currency = ? AND enabled = 1",
      [input.currency],
    );
    const maximum = Number((riskRows as Array<{ max_amount: number }>)[0]?.max_amount ?? 0);
    if (!maximum || input.amount > maximum) throw new Error("payment rejected by risk rules");

    await this.infra.pg.begin(async (tx) => {
      const sql = tx as unknown as PaymentInfra["pg"];
      await sql`
        INSERT INTO payments (payment_id, merchant_id, amount, currency, status, idempotency_key)
        VALUES (${input.paymentId}, ${input.merchantId}, ${input.amount}, ${input.currency}, 'pending', ${idempotencyKey})
        ON CONFLICT (payment_id) DO NOTHING
      `;
      await sql`
        INSERT INTO ledger_entries (entry_key, payment_id, entry_type, amount)
        VALUES (${`${input.paymentId}:authorization`}, ${input.paymentId}, 'authorization', ${input.amount})
        ON CONFLICT (entry_key) DO NOTHING
      `;
    });
    await this.infra.redis
      .multi()
      .set(`idempotency:${idempotencyKey}`, input.paymentId)
      .set(`payment:${input.paymentId}:status`, "pending")
      .exec();
    await this.infra.audit.collection("payment_audit").insertOne({
      paymentId: input.paymentId, event: "payment.created", status: "pending", at: new Date(),
    });
    this.infra.rabbitChannel!.sendToQueue(
      this.infra.config.rabbit.queue,
      Buffer.from(JSON.stringify(input)),
      { persistent: true, contentType: "application/json", messageId: input.paymentId, headers: { "x-retry-count": 0 } },
    );
    return { ...input, status: "pending", duplicate: false };
  }

  async settle(message: ConsumeMessage): Promise<void> {
    const input = JSON.parse(message.content.toString()) as PaymentRequest;
    let transitioned = false;
    await this.infra.pg.begin(async (tx) => {
      const sql = tx as unknown as PaymentInfra["pg"];
      const rows = await sql`
        UPDATE payments SET status = 'settled', settled_at = NOW()
        WHERE payment_id = ${input.paymentId} AND status = 'pending'
        RETURNING status
      `;
      transitioned = rows.length === 1 && shouldSettle("pending");
      if (transitioned) {
        await sql`
          INSERT INTO ledger_entries (entry_key, payment_id, entry_type, amount)
          VALUES (${`${input.paymentId}:settlement`}, ${input.paymentId}, 'settlement', ${-input.amount})
          ON CONFLICT (entry_key) DO NOTHING
        `;
        await sql`
          INSERT INTO settlement_events (event_key, payment_id, published)
          VALUES (${`${input.paymentId}:settled`}, ${input.paymentId}, FALSE)
          ON CONFLICT (event_key) DO NOTHING
        `;
      }
    });
    if (!transitioned) return;

    await this.infra.audit.collection("payment_audit").updateOne(
      { paymentId: input.paymentId, event: "payment.settled" },
      { $setOnInsert: { paymentId: input.paymentId, event: "payment.settled", status: "settled", at: new Date() } },
      { upsert: true },
    );
    await this.infra.redis.set(`payment:${input.paymentId}:status`, "settled");
    const producer = await this.infra.producer();
    const event = JSON.stringify({ paymentId: input.paymentId, status: "settled", amount: input.amount, currency: input.currency });
    await producer.send({
      topic: this.infra.config.kafka.topic,
      messages: [{ key: input.paymentId, value: event, headers: { eventKey: `${input.paymentId}:settled` } }],
    });
    await this.infra.pg`
      UPDATE settlement_events SET published = TRUE
      WHERE event_key = ${`${input.paymentId}:settled`}
    `;
  }

  async handleSettlement(message: ConsumeMessage): Promise<void> {
    const channel = this.infra.rabbitChannel!;
    try {
      await this.settle(message);
      channel.ack(message);
    } catch (error) {
      const retryCount = nextRetryCount(message.properties.headers as Record<string, unknown> | undefined);
      console.error("settlement failed", { retryCount, error });
      if (isRetryAllowed(retryCount)) {
        channel.sendToQueue(this.infra.config.rabbit.queue, message.content, {
          persistent: true,
          contentType: message.properties.contentType,
          messageId: message.properties.messageId,
          headers: { ...message.properties.headers, "x-retry-count": retryCount },
        });
      } else {
        await this.infra.audit.collection("payment_audit").insertOne({
          paymentId: message.properties.messageId,
          event: "payment.settlement_failed",
          retryCount,
          error: error instanceof Error ? error.message : String(error),
          at: new Date(),
        });
      }
      channel.ack(message);
    }
  }
}
