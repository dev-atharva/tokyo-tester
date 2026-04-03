import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/db";
import {
  countUsers,
  getUserById,
  verifyPasswordLogin,
} from "@/modules/auth/server/service";

function getAdapter(): Adapter {
  const database = getDb();

  if (database.type === "postgres") {
    return DrizzleAdapter(database.db, {
      usersTable: database.tables.users,
      accountsTable: database.tables.accounts,
      sessionsTable: database.tables.sessions,
      verificationTokensTable: database.tables.verificationTokens,
    }) as Adapter;
  }

  return DrizzleAdapter(database.db, {
    usersTable: database.tables.users,
    accountsTable: database.tables.accounts,
    sessionsTable: database.tables.sessions,
    verificationTokensTable: database.tables.verificationTokens,
  }) as Adapter;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.AUTH_TRUST_HOST !== "false",
  adapter: getAdapter(),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const configuredUsers = await countUsers();
        if (configuredUsers === 0) {
          return null;
        }

        const email =
          typeof credentials.email === "string" ? credentials.email : "";
        const password =
          typeof credentials.password === "string" ? credentials.password : "";

        const user = await verifyPasswordLogin(email, password);
        if (!user) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sub = user.id;
      }

      if (!token.role && token.sub) {
        const dbUser = await getUserById(token.sub);
        token.role = dbUser?.role ?? "normal";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role =
          typeof token.role === "string" ? token.role : "normal";
      }

      return session;
    },
  },
});
