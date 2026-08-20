import http from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(webRoot);
const publicRoot = path.join(webRoot, "public");
const reportsRoot = path.join(projectRoot, "周报");
const host = "127.0.0.1";
const requestedPort = Number.parseInt(process.env.REPORT_PORT || "4178", 10);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function send(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

async function listReports() {
  const entries = await readdir(reportsRoot, { withFileTypes: true });
  const reports = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map(async (entry) => {
        const filePath = path.join(reportsRoot, entry.name);
        const [metadata, markdown] = await Promise.all([
          stat(filePath),
          readFile(filePath, "utf8"),
        ]);
        const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || entry.name.replace(/\.md$/, "");
        const publication = markdown.match(/^\*\*(大模型研究热点·\s*\d{4}\s*年第\s*\d+\s*周)\*\*$/m)?.[1]?.trim() || "";
        const date = entry.name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
        const summary = markdown.match(/^>\s*(?:\*\*子标题：\*\*|一句话判断：)?\s*(.+)$/m)?.[1]?.trim() || "";
        return {
          file: entry.name,
          title,
          publication,
          date,
          summary,
          modifiedAt: metadata.mtime.toISOString(),
        };
      }),
  );
  return reports.sort((a, b) => b.date.localeCompare(a.date) || b.modifiedAt.localeCompare(a.modifiedAt));
}

async function handleApi(requestUrl, response) {
  if (requestUrl.pathname === "/api/reports") {
    send(response, 200, JSON.stringify(await listReports()), contentTypes[".json"]);
    return true;
  }

  if (requestUrl.pathname.startsWith("/api/reports/")) {
    const filename = decodeURIComponent(requestUrl.pathname.slice("/api/reports/".length));
    if (path.basename(filename) !== filename || !filename.endsWith(".md")) {
      send(response, 400, "Invalid report name");
      return true;
    }
    try {
      const markdown = await readFile(path.join(reportsRoot, filename), "utf8");
      send(response, 200, markdown, "text/markdown; charset=utf-8");
    } catch (error) {
      send(response, error.code === "ENOENT" ? 404 : 500, "Report unavailable");
    }
    return true;
  }
  return false;
}

async function handleStatic(requestUrl, response) {
  const requestedPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const absolutePath = path.resolve(publicRoot, `.${requestedPath}`);
  if (!absolutePath.startsWith(`${publicRoot}${path.sep}`)) {
    send(response, 403, "Forbidden");
    return;
  }
  try {
    const file = await readFile(absolutePath);
    send(response, 200, file, contentTypes[path.extname(absolutePath)] || "application/octet-stream");
  } catch (error) {
    send(response, error.code === "ENOENT" ? 404 : 500, "Not found");
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${host}`);
    if (await handleApi(requestUrl, response)) return;
    await handleStatic(requestUrl, response);
  } catch (error) {
    console.error(error);
    send(response, 500, "Internal server error");
  }
});

function listen(port) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && port < requestedPort + 20) {
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, host, () => {
    const url = `http://${host}:${port}`;
    console.log(`大模型研究热点：${url}`);
    if (process.argv.includes("--open")) {
      import("node:child_process").then(({ spawn }) => {
        const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
        const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
        spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
      });
    }
  });
}

listen(requestedPort);
