import amqp, { type Channel, type ChannelModel } from "amqplib";
import Redis from "ioredis";
import { Kafka, type Admin, type Producer } from "kafkajs";
import memjs, { type Client as MemcachedClient } from "memjs";
import { MongoClient, type Db } from "mongodb";
import mysql, { type Pool } from "mysql2/promise";
import postgres, { type Sql } from "postgres";
import { paymentConfig } from "./config";
import { retry } from "./retry";

export class PaymentInfra {
  readonly config = paymentConfig();
  readonly pg: Sql;
  readonly merchants: Pool;
  readonly risk: Pool;
  readonly redis: Redis;
  readonly memcached: MemcachedClient;
  readonly mongoClient: MongoClient;
  readonly audit: Db;
  readonly kafka: Kafka;
  rabbit?: ChannelModel;
  rabbitChannel?: Channel;
  kafkaAdmin?: Admin;
  kafkaProducer?: Producer;

  constructor() {
    this.pg = postgres(this.config.postgres);
    this.merchants = mysql.createPool({ ...this.config.mysql, connectionLimit: 4 });
    this.risk = mysql.createPool({ ...this.config.maria, connectionLimit: 4 });
    this.redis = new Redis(this.config.redis);
    this.memcached = memjs.Client.create(this.config.memcached.servers);
    this.mongoClient = new MongoClient(this.config.mongo.uri);
    this.audit = this.mongoClient.db(this.config.mongo.database);
    this.kafka = new Kafka({ clientId: `tokyo-${process.env.APP_ROLE}`, brokers: this.config.kafka.brokers });
  }

  async connect(): Promise<void> {
    await retry("payment dependencies", async () => {
      await this.pg`SELECT 1`;
      await this.merchants.query("SELECT 1");
      await this.risk.query("SELECT 1");
      await this.redis.ping();
      await new Promise<void>((resolve, reject) =>
        this.memcached.get("__health__", (error) => (error ? reject(error) : resolve())),
      );
      await this.mongoClient.connect();
      await this.audit.command({ ping: 1 });
      this.rabbit ??= await amqp.connect(this.config.rabbit.url);
      this.rabbitChannel ??= await this.rabbit.createChannel();
      await this.rabbitChannel.assertQueue(this.config.rabbit.queue, { durable: true });
      this.kafkaAdmin ??= this.kafka.admin();
      await this.kafkaAdmin.connect();
      await this.kafkaAdmin.createTopics({ topics: [{ topic: this.config.kafka.topic, numPartitions: 1, replicationFactor: 1 }], waitForLeaders: true });
    });
  }

  async producer(): Promise<Producer> {
    if (!this.kafkaProducer) {
      this.kafkaProducer = this.kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
      await this.kafkaProducer.connect();
    }
    return this.kafkaProducer;
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.kafkaProducer?.disconnect(), this.kafkaAdmin?.disconnect(), this.rabbitChannel?.close(),
      this.rabbit?.close(), this.mongoClient.close(), this.redis.quit(), this.merchants.end(),
      this.risk.end(), this.pg.end(),
    ].filter(Boolean) as Promise<unknown>[]);
    this.memcached.quit();
  }
}
