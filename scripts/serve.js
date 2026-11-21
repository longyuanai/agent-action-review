import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const entry = { path: "../index.html", type: "text/html; charset=utf-8" };
const assets = new Map([
  ["/", entry],
  ["/index.html", entry],
  ["/src/styles.css", { path: "../src/styles.css", type: "text/css; charset=utf-8" }],
  ...["app", "review", "diff", "demo"].map(name => [
    `/src/${name}.js`,
    { path: `../src/${name}.js`, type: "text/javascript; charset=utf-8" },
  ]),
]);

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  const asset = assets.get((request.url ?? "/").split("?")[0]);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }

  try {
    const contents = await readFile(new URL(asset.path, import.meta.url));
    response.writeHead(200, {
      "Content-Type": asset.type,
      "Content-Length": contents.byteLength,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    }).end(request.method === "HEAD" ? undefined : contents);
  } catch {
    response.writeHead(500).end();
  }
});

server.listen(port, host, () => {
  console.log(`Agent Action Review is open at http://${host}:${server.address().port}/`);
});
