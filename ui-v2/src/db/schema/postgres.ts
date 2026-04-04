import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
    createdAt: timestamp("createdAt", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
  }),
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
