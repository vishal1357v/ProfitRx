import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function testDirectPool() {
  const connectionString = process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/neondb?sslmode=require";
  const pool = new Pool({ connectionString });
  console.log("Testing direct Neon Pool query...");
  const client = await pool.connect();
  const res = await client.query("SELECT count(*) FROM orders;");
  console.log("Direct Pool result:", res.rows);
  client.release();
  await pool.end();
}

testDirectPool().catch(console.error);
