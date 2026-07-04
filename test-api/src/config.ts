import { parseRole } from "./domain";
import dotenv from "dotenv";

dotenv.config({ override: false });

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required for ${process.env.APP_ROLE}`);
  return value;
}

function port(name: string, fallback: string): number {
  const parsed = Number.parseInt(env(name, fallback), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a valid port`);
  return parsed;
}

export const role = parseRole(process.env.APP_ROLE);
export const httpPort = port("PORT", role === "legacy" ? "8081" : "8080");

export function paymentConfig() {
  return {
    postgres: {
      host: env("POSTGRES_HOST"), port: port("POSTGRES_PORT", "5432"),
      database: env("POSTGRES_DB", "payments"), user: env("POSTGRES_USER", "payments"),
      password: env("POSTGRES_PASSWORD", "payments"),
    },
    mysql: {
      host: env("MYSQL_HOST"), port: port("MYSQL_PORT", "3306"),
      database: env("MYSQL_DB", "merchants"), user: env("MYSQL_USER", "payments"),
      password: env("MYSQL_PASSWORD", "payments"),
    },
    maria: {
      host: env("MARIA_HOST"), port: port("MARIA_PORT", "3306"),
      database: env("MARIA_DB", "risk"), user: env("MARIA_USER", "payments"),
      password: env("MARIA_PASSWORD", "payments"),
    },
    redis: { host: env("REDIS_HOST"), port: port("REDIS_PORT", "6379") },
    memcached: { servers: env("MEMCACHED_SERVERS") },
    mongo: { uri: env("MONGODB_URI"), database: env("MONGODB_DATABASE", "payments_audit") },
    rabbit: { url: env("RABBITMQ_URL"), queue: env("RABBITMQ_QUEUE", "payment.settlement") },
    kafka: { brokers: env("KAFKA_BROKERS").split(","), topic: env("KAFKA_TOPIC", "payment.settled") },
  };
}
