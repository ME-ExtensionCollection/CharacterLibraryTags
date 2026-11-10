// Dev harness server: builds the extension, then serves the repo on
// http://localhost:5179/dev/harness.html with a mock Marinara API backed by
// dev/mock-library.mjs. Nothing here talks to a real Marinara install.
//
// Usage: node scripts/serve.mjs [port] [cardCount]
//   POST /__mock/reset?count=N   rebuilds the mock library (used by smoke tests)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { avatarSvg, createMockApi } from "../dev/mock-library.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 5179;
const COUNT = Number(process.argv[3]) || 3000;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

const build = () => execFileSync(process.execPath, [join(ROOT, "scripts/build.mjs")], { stdio: "inherit" });
build();

const api = createMockApi({ count: COUNT });
let deletesInFlight = 0;
let dropDeletes = new Set();
let deleteRequests = 0;
let maxDeletesInFlight = 0;

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

// A test that fails mid-run closes its page with requests in flight; keep serving.
createServer((req, res) => handle(req, res).catch((error) => {
  if (error.code !== "ECONNRESET") console.error(error);
  if (!res.headersSent && !res.destroyed) sendJson(res, 500, { error: String(error) });
})).listen(PORT, "127.0.0.1", () => console.log(`Harness: http://localhost:${PORT}/dev/harness.html (${COUNT} mock cards)`));

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/") {
    res.writeHead(302, { Location: "/dev/harness.html" });
    return res.end();
  }
  if (url.pathname === "/__mock/reset" && req.method === "POST") {
    api.reset({ count: Number(url.searchParams.get("count")) || COUNT, deleteLimit: Number(url.searchParams.get("deleteLimit")) || 0 });
    // ?dropDeletes=a,b: drop the connection on those delete requests (1-based),
    // after the delete went through, like a server that finished but never answered.
    dropDeletes = new Set((url.searchParams.get("dropDeletes") ?? "").split(",").filter(Boolean).map(Number));
    deleteRequests = 0;
    deletesInFlight = 0;
    maxDeletesInFlight = 0;
    return sendJson(res, 200, { count: api.rows.length });
  }
  if (url.pathname === "/__mock/stats") {
    return sendJson(res, 200, { deletes: api.stats.deletes, rateLimited: api.stats.rateLimited, maxDeletesInFlight });
  }
  if (url.pathname === "/__mock/requests") return sendJson(res, 200, api.stats.requests.splice(0));
  if (url.pathname.startsWith("/mock-avatar/")) {
    res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600" });
    return res.end(avatarSvg(decodeURIComponent(url.pathname.slice("/mock-avatar/".length).replace(/\.svg$/, ""))));
  }
  if (url.pathname.startsWith("/api/")) {
    // Small delay so loading states are visible and races show up. Deletes are
    // slow in Marinara (each scans every chat), so they are slow here too.
    const isDelete = req.method === "DELETE";
    if (isDelete) maxDeletesInFlight = Math.max(maxDeletesInFlight, ++deletesInFlight);
    await new Promise((resolve) => setTimeout(resolve, isDelete ? 500 : 40));
    if (isDelete) deletesInFlight -= 1;
    const body = req.method === "GET" ? null : await readBody(req);
    const result = api.handle(req.method, url, body, req.headers);
    if (isDelete && dropDeletes.has(++deleteRequests)) return req.socket.destroy();
    if (!result) return sendJson(res, 404, { error: "Mock route not found" });
    return sendJson(res, result[0], result[1]);
  }
  // Rebuild on every harness load so edits show up after a refresh.
  if (url.pathname === "/dev/harness.html") {
    try {
      build();
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end(String(error));
    }
  }
  const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}
