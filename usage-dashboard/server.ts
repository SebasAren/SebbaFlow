import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = parseInt(process.env.PORT || "4813");
const USAGE_PATH = join(homedir(), ".config/pi/usage.jsonl");
const STATIC_DIR = import.meta.dir;

function readUsageEntries(): object[] {
  try {
    const content = readFileSync(USAGE_PATH, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/api/usage") {
      const entries = readUsageEntries();
      return Response.json(entries);
    }

    // Serve static files from the dashboard directory
    let filePath = join(
      STATIC_DIR,
      url.pathname === "/" ? "dashboard.html" : url.pathname,
    );
    try {
      const file = Bun.file(filePath);
      return new Response(file);
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`usage-dashboard → http://localhost:${server.port}`);
