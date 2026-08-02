import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST_DIRECTORY = path.resolve(fileURLToPath(new URL("../../dist/", import.meta.url)));
const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
});

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(DIST_DIRECTORY, relativePath);
  if (candidate !== DIST_DIRECTORY && !candidate.startsWith(`${DIST_DIRECTORY}${path.sep}`)) {
    return null;
  }
  return candidate;
}

export async function startProductionServer({ host = "127.0.0.1", port = 4173 } = {}) {
  await access(path.join(DIST_DIRECTORY, "index.html"));
  const server = createServer(async (request, response) => {
    try {
      let filename = resolveRequestPath(request.url ?? "/");
      if (!filename) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const metadata = await stat(filename);
      if (metadata.isDirectory()) filename = path.join(filename, "index.html");
      const headers = {
        "cache-control": "no-store",
        "content-type": CONTENT_TYPES[path.extname(filename).toLowerCase()] ?? "application/octet-stream",
      };
      response.writeHead(200, headers);
      if (request.method === "HEAD") response.end();
      else createReadStream(filename).pipe(response);
    } catch (error) {
      if (error?.code === "ENOENT") {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(500).end("Server error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return Object.freeze({
    close: () => new Promise((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    ))),
  });
}
