// Minimal static server for dist/ that mimics Netlify: applies public/_headers, serves files,
// and falls back to index.html for client-side routes. Used by the end-to-end tests.
//
//   node scripts/serve.mjs [port]

import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".woff2": "font/woff2",
};

/** Parse Netlify's _headers format into [{ pattern: RegExp, headers: [name, value][] }]. */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      const pattern = new RegExp(`^${line.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      rules.push({ pattern, headers: [] });
    } else {
      const index = line.indexOf(":");
      rules.at(-1)?.headers.push([line.slice(0, index).trim(), line.slice(index + 1).trim()]);
    }
  }
  return rules;
}

export async function startServer(port = 0) {
  const rules = parseHeaders(await readFile(join(dist, "_headers"), "utf-8"));
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    let file = normalize(join(dist, pathname));
    if (!file.startsWith(dist)) {
      response.writeHead(400).end();
      return;
    }
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, "index.html");
      info = await stat(file).catch(() => null);
    }
    if (!info) {
      file = join(dist, "index.html");
    }
    for (const rule of rules) {
      if (rule.pattern.test(pathname)) for (const [name, value] of rule.headers) response.setHeader(name, value);
    }
    response.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startServer(Number(process.argv[2] ?? 4173));
  console.log(`Serving dist/ at http://127.0.0.1:${server.address().port}`);
}
