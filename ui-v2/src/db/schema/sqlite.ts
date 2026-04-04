import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { DEFAULT_USER_ROLE } from "@/modules/auth/constants";

export const sqliteUsers = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  passwordHash: text("passwordHash"),
  role: text("role").notNull().default(DEFAULT_USER_ROLE),
  setupCompletedAt: integer("setupCompletedAt", { mode: "timestamp_ms" }),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const sqliteProjects = sqliteTable("project", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdBy: text("createdBy")
    .notNull()
    .references(() => sqliteUsers.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const sqliteProjectMembers = sqliteTable(
  "project_member",
  {
    projectId: text("projectId")
      .notNull()
      .references(() => sqliteProjects.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => sqliteUsers.id, { onDelete: "cascade" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
  }),
);

export const sqliteAccounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => sqliteUsers.id, { onDelete: "cascade" }),
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

export const sqliteSessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => sqliteUsers.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const sqliteVerificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);
