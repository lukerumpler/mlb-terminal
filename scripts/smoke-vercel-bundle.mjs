import { createServer } from "node:http";
import handler from "../api/index.mjs";

const server = createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch(error => {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
try {
  const response = await fetch(
    `http://127.0.0.1:${port}/api/health`,
    { signal: AbortSignal.timeout(5_000) }
  );
  const body = await response.text();
  if (!response.ok || !body.includes('"ok":true')) {
    throw new Error(`Bundle health probe failed: ${response.status} ${body}`);
  }
  console.log(`Bundle health probe passed: ${response.status} ${body}`);
} finally {
  await new Promise(resolve => server.close(resolve));
}
