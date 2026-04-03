CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER,
  "image" TEXT,
  "passwordHash" TEXT,
  "role" TEXT NOT NULL DEFAULT 'normal',
  "setupCompletedAt" INTEGER,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "createdAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  "updatedAt" INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS "account" (
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  PRIMARY KEY ("provider", "providerAccountId"),
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "session" (
  "sessionToken" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" INTEGER NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "verificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" INTEGER NOT NULL,
  PRIMARY KEY ("identifier", "token")
);

CREATE INDEX IF NOT EXISTS "user_email_idx" ON "user"("email");
