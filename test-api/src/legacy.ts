import type { App } from "@tinyhttp/app";
import postgres from "postgres";

export async function configureLegacy(app: App) {
  const sql = postgres({
    host: process.env.DB_HOST || "localhost",
    port: Number.parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "testdb",
  });
  await sql`SELECT 1`;
  app.get("/health", async (_req, res) => res.status(200).json({ status: "healthy", database: "connected" }));
  app.post("/users", async (req, res) => {
    const { name, email, status } = req.body;
    if (!email || !name) return res.status(400).json({ error: "email and name are required" });
    try {
      const [user] = await sql`INSERT INTO users (name,email,status) VALUES (${name}, ${email}, ${status}) RETURNING id,name,email,status,created_at`;
      res.status(200).json({ ...user, created_at: user?.created_at.toISOString() });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  app.get("/users/:user_id", async (req, res) => {
    const userId = Number.parseInt(req.params.user_id!, 10);
    if (Number.isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });
    const [user] = await sql`SELECT id,name,email,status,created_at FROM users WHERE id = ${userId}`;
    return user
      ? res.status(200).json({ ...user, created_at: user.created_at.toISOString() })
      : res.status(404).json({ error: "User not found" });
  });
  app.get("/users", async (req, res) => {
    const status = req.query.status;
    const users = status
      ? await sql`SELECT id,name,email,status,created_at FROM users WHERE status = ${status}`
      : await sql`SELECT id,name,email,status,created_at FROM users`;
    res.status(200).json(users.map((user) => ({ ...user, created_at: user.created_at.toISOString() })));
  });
  app.put("/users/:user_id", async (req, res) => {
    const userId = Number.parseInt(req.params.user_id!, 10);
    if (Number.isNaN(userId)) return res.status(400).json({ error: "Invalid userID" });
    if (!req.body.status) return res.status(400).json({ error: "status is required" });
    const [user] = await sql`UPDATE users SET status = ${req.body.status} WHERE id = ${userId} RETURNING id,name,email,status,created_at`;
    return user
      ? res.status(200).json({ ...user, created_at: user.created_at.toISOString() })
      : res.status(404).json({ error: "user not found" });
  });
  app.get("/stats", async (_req, res) => {
    const stats = await sql`SELECT status, COUNT(*) AS count FROM users GROUP BY status`;
    res.status(200).json({ stats });
  });
  return () => sql.end();
}
