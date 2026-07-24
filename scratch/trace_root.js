import { writeFileSync } from 'fs';

async function traceRoot() {
  const url = 'https://greek-god-saas.vercel.app/?shop=greek-god-wvwt8ptt.myshopify.com&host=YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvZ3JlZWstZ29kLXd2d3Q4cHR0&embedded=1';
  let currentUrl = url;
  let steps = [];
  let visited = new Set();

  console.log(`Starting root trace for: ${url}`);

  while (currentUrl) {
    if (visited.has(currentUrl)) {
      console.log(`[LOOP DETECTED] Already visited: ${currentUrl}`);
      steps.push({
        url: currentUrl,
        error: 'Redirect loop detected'
      });
      break;
    }
    visited.add(currentUrl);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Sec-Fetch-Dest': 'iframe',
          'Referer': 'https://admin.shopify.com/',
        }
      });

      const status = response.status;
      const headers = Object.fromEntries(response.headers.entries());
      const location = response.headers.get('location');
      const csp = response.headers.get('content-security-policy');
      const cacheControl = response.headers.get('cache-control');

      console.log(`\n--- Step ${steps.length + 1} ---`);
      console.log(`URL: ${currentUrl}`);
      console.log(`Status: ${status}`);
      console.log(`Location: ${location}`);
      console.log(`Cache-Control: ${cacheControl}`);
      console.log(`CSP: ${csp}`);

      steps.push({
        url: currentUrl,
        status,
        location,
        cacheControl,
        csp,
        headers
      });

      if (status >= 300 && status < 400 && location) {
        const nextUrl = new URL(location, currentUrl).toString();
        currentUrl = nextUrl;
      } else {
        currentUrl = null;
      }
    } catch (err) {
      console.error(`Error fetching ${currentUrl}:`, err);
      steps.push({
        url: currentUrl,
        error: err.message
      });
      currentUrl = null;
    }
  }

  writeFileSync('C:/Users/xlr8j/.gemini/antigravity-ide/brain/2e7678dc-2202-4285-82e1-481d865ebe8a/scratch/trace_root_results.json', JSON.stringify(steps, null, 2));
  console.log('\nTrace complete! Results written to trace_root_results.json');
}

traceRoot();
