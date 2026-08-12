import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

async function testDirectPool() {
  const connectionString = "postgresql://neondb_owner:npg_8sDJ7nqpfmYI@ep-weathered-tree-at8vwwnb-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require";
  const pool = new Pool({ connectionString });
  console.log("Testing direct Neon Pool query...");
  const client = await pool.connect();
  const res = await client.query("SELECT count(*) FROM orders;");
  console.log("Direct Pool result:", res.rows);
  client.release();
  await pool.end();
}

testDirectPool().catch(console.error);
