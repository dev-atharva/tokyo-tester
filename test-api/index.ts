import { App } from "@tinyhttp/app";
import { json } from "milliparsec";
import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config();

const app = new App();
app.use(json());

const sql = postgres({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "testdb",
});

app.get("/health", async (req, res) => {
  try {
    await sql`SELECT 1`;
    res.status(200).json({ status: "healthy", database: "connected" });
  } catch (error: any) {
    res.status(503).json({ status: "unhealthy", error: error.message });
  }
});

app.post("/users", async (req, res) => {
  const { name, email, status } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: "email and name are required" });
  }

  try {
    const [user] =
      await sql`INSERT INTO users (name,email,status) VALUES (${name}, ${email}, ${status}) RETURNING id,name,email,status,created_at`;
    user!.created_at = user?.created_at.toISOString();
    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/users/:user_id", async (req, res) => {
  const userId = parseInt(req.params.user_id!, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  try {
    const [user] =
      await sql`SELECT id,name,email,status,created_at FROM users WHERE id = ${userId}`;
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.created_at = user.created_at.toISOString();
    res.status(200).json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/users", async (req, res) => {
  const { status } = req.query;

  try {
    let users;
    if (status) {
      users =
        await sql`SELECT id,name,email,status,created_at FROM users WHERE status = ${status}`;
    } else {
      users = sql`SELECT id,name,email,status,created_at FROM users`;
    }
    users.forEach((user: any) => {
      user.created_at = user.created_at.toISOString();
    });
    res.status(200).json(users);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.put("/users/:user_id", async (req, res) => {
  const userId = parseInt(req.params.user_id!, 10);
  const { status } = req.body;
  if (isNaN(userId)) {
    return res.status(400).json({ error: "Invalid userID" });
  }
  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }
  try {
    const [user] =
      await sql`UPDATE users SET status  = ${status} WHERE id = ${userId} RETURNING id,name,email,status,created_at`;
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    }

    user.created_at = user.created_at.toISOString();
    res.status(200).json(user);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/stats", async (req, res) => {
  try {
    const stats =
      await sql`SELECT status , COUNT(*) as count FROM users GROUP BY status`;
    res.status(200).json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

let PORT: number = 8081;
let inpPort: number | string | undefined = process.env.PORT;
if (inpPort) {
  inpPort = parseInt(inpPort, 10);
  if (typeof inpPort === "number") {
    PORT = inpPort;
  }
}
app.listen(PORT, () => {
  console.log(`Test application server listning on http://localhost:${PORT}`);
});
