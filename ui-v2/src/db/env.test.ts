import { afterEach, describe, expect, test } from "bun:test";
import { getDatabaseConfig } from "./env";

const originalType = process.env.DB_TYPE;
const originalURL = process.env.DATABASE_URL;

afterEach(() => {
  if (originalType === undefined) delete process.env.DB_TYPE;
  else process.env.DB_TYPE = originalType;
  if (originalURL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalURL;
});

describe("database environment", () => {
  test("defaults to MySQL", () => {
    delete process.env.DB_TYPE;
    process.env.DATABASE_URL = "mysql://tokyo:password@localhost/tokyo_ui";

    expect(getDatabaseConfig()).toEqual({
      type: "mysql",
      databaseUrl: process.env.DATABASE_URL,
    });
  });

  test("rejects removed database backends", () => {
    process.env.DB_TYPE = "sqlite";
    expect(() => getDatabaseConfig()).toThrow("expected mysql or postgres");
  });
});
