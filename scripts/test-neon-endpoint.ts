async function testNeonHttp() {
  const connStr = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/neondb?sslmode=require';
  const hostMatch = connStr.match(/@([^/:]+)/);
  const host = hostMatch ? hostMatch[1] : 'localhost';

  console.log("Testing Neon HTTPS endpoint...");
  const t0 = Date.now();
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': connStr
    },
    body: JSON.stringify({ query: 'SELECT count(*) as session_count FROM sessions;' })
  });
  const data = await res.json();
  console.log(`Success in ${Date.now() - t0}ms!`, data);
}

testNeonHttp();
