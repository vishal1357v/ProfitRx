async function testNeonHttp() {
  const host = 'ep-weathered-tree-at8vwwnb-pooler.c-9.us-east-1.aws.neon.tech';
  const connStr = 'postgresql://neondb_owner:npg_8sDJ7nqpfmYI@ep-weathered-tree-at8vwwnb-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require';

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
