import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { DEFAULT_USER_ROLE } from "@/modules/auth/constants";

export const pgUsers = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("passwordHash"),
  role: text("role").notNull().default(DEFAULT_USER_ROLE),
  setupCompletedAt: timestamp("setupCompletedAt", { mode: "date" }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const pgProjects = pgTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["personal", "team"] })
    .notNull()
    .default("team"),
  createdBy: text("createdBy")
    .notNull()
    .references(() => pgUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const pgProjectMembers = pgTable(
  "project_member",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => pgProjects.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "editor", "runner"] })
      .notNull()
      .default("editor"),
    createdAt: timestamp("createdAt", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
  }),
);

export const pgAgentTokens = pgTable("agent_token", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("tokenHash").notNull().unique(),
  userId: text("userId")
    .notNull()
    .references(() => pgUsers.id, { onDelete: "cascade" }),
  projectId: text("projectId")
    .notNull()
    .references(() => pgProjects.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  lastUsedAt: timestamp("lastUsedAt", { mode: "date" }),
  revokedAt: timestamp("revokedAt", { mode: "date" }),
  createdAt: timestamp("createdAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const pgRunIntents = pgTable(
  "workflow_run_intent",
  {
    id: text("id").primaryKey(),
    principalId: text("principalId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    projectId: text("projectId")
      .notNull()
      .references(() => pgProjects.id, { onDelete: "cascade" }),
    workflowId: text("workflowId").notNull(),
    operation: text("operation", { enum: ["bundle", "existing"] }).notNull(),
    state: text("state", {
      enum: [
        "awaiting-human",
        "submitting",
        "submitted",
        "cancelled",
        "expired",
      ],
    })
      .notNull()
      .default("awaiting-human"),
    requestHash: text("requestHash").notNull(),
    idempotencyKey: text("idempotencyKey").notNull(),
    payload: text("payload").notNull(),
    requiredSecretRefs: text("requiredSecretRefs").notNull(),
    selectionSummary: text("selectionSummary").notNull(),
    workflowRunId: text("workflowRunId"),
    claimId: text("claimId"),
    createdAt: timestamp("createdAt", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("workflow_run_intent_request_idx").on(
      table.principalId,
      table.projectId,
      table.operation,
      table.idempotencyKey,
    ),
    index("workflow_run_intent_human_idx").on(
      table.userId,
      table.projectId,
      table.id,
    ),
    index("workflow_run_intent_expiry_idx").on(table.state, table.expiresAt),
  ],
);

export const pgAccounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => pgUsers.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  }),
);

export const pgSessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => pgUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const pgVerificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);
