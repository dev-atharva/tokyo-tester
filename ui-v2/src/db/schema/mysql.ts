import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  int,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { DEFAULT_USER_ROLE } from "@/modules/auth/constants";

export const mysqlUsers = mysqlTable("user", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  passwordHash: text("passwordHash"),
  role: varchar("role", { length: 64 }).notNull().default(DEFAULT_USER_ROLE),
  setupCompletedAt: timestamp("setupCompletedAt", { mode: "date" }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const mysqlProjects = mysqlTable(
  "project",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    kind: varchar("kind", { length: 32, enum: ["personal", "team"] })
      .notNull()
      .default("team"),
    createdBy: varchar("createdBy", { length: 255 })
      .notNull()
      .references(() => mysqlUsers.id, { onDelete: "cascade" }),
    personalOwnerKey: varchar("personalOwnerKey", {
      length: 255,
    }).generatedAlwaysAs(
      sql`CASE WHEN kind = 'personal' THEN createdBy ELSE NULL END`,
      { mode: "virtual" },
    ),
    createdAt: timestamp("createdAt", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updatedAt", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("project_created_by_idx").on(table.createdBy),
    uniqueIndex("project_personal_owner_idx").on(table.personalOwnerKey),
  ],
);

export const mysqlProjectMembers = mysqlTable(
  "project_member",
  {
    projectId: varchar("projectId", { length: 255 })
      .notNull()
      .references(() => mysqlProjects.id, { onDelete: "cascade" }),
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => mysqlUsers.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32, enum: ["owner", "editor", "runner"] })
      .notNull()
      .default("editor"),
    createdAt: timestamp("createdAt", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_member_user_idx").on(table.userId),
    index("project_member_role_idx").on(table.projectId, table.role),
  ],
);

export const mysqlAgentTokens = mysqlTable("agent_token", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  tokenHash: varchar("tokenHash", { length: 255 }).notNull().unique(),
  userId: varchar("userId", { length: 255 })
    .notNull()
    .references(() => mysqlUsers.id, { onDelete: "cascade" }),
  projectId: varchar("projectId", { length: 255 })
    .notNull()
    .references(() => mysqlProjects.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const mysqlAccounts = mysqlTable(
  "account",
  {
    userId: varchar("userId", { length: 255 })
      .notNull()
      .references(() => mysqlUsers.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 255 }).notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 255 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: int("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ],
);

export const mysqlSessions = mysqlTable("session", {
  sessionToken: varchar("sessionToken", { length: 255 }).primaryKey(),
  userId: varchar("userId", { length: 255 })
    .notNull()
    .references(() => mysqlUsers.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const mysqlVerificationTokens = mysqlTable(
  "verificationToken",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);
