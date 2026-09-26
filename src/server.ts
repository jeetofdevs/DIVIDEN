import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Entry point untuk hosting (Railway, Render, VPS):
 * - menyajikan website dari folder `web/` di PORT, dengan endpoint `/health`;
 * - menjalankan bot distribusi di proses yang sama.
 * Kalau konfigurasi bot belum lengkap, website tetap hidup dan `/health`
 * menampilkan apa yang kurang, jadi deploy tidak crash-loop.
 */

const WEB_ROOT = resolve(fileURLToPath(new URL("../web", import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const bot: { status: "starting" | "running" | "disabled" | "crashed"; detail?: string; since: string } = {
  status: "starting",
  since: new Date().toISOString(),
};
const setBot = (status: typeof bot.status, detail?: string) => {
  bot.status = status;
  bot.detail = detail;
  bot.since = new Date().toISOString();
};

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);

  if (path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, bot }));
    return;
  }

  const file = normalize(join(WEB_ROOT, path.endsWith("/") ? `${path}index.html` : path));
  if (!file.startsWith(WEB_ROOT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error("not a file");
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
  });
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`Website: http://0.0.0.0:${PORT}  (health: /health)`));

async function startBot() {
  if (["0", "false", "no"].includes((process.env.BOT_ENABLED ?? "true").toLowerCase())) {
    setBot("disabled", "BOT_ENABLED=false");
    console.log("Bot dimatikan (BOT_ENABLED=false). Hanya website yang berjalan.");
    return;
  }
  let runBot: (once?: boolean) => Promise<void>;
  try {
    ({ runBot } = await import("./index.js"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setBot("disabled", msg);
    console.error(`Bot tidak dijalankan: ${msg}`);
    console.error("Lengkapi Variables di Railway (lihat .env.example), lalu redeploy. Website tetap berjalan.");
    return;
  }
  setBot("running");
  try {
    await runBot();
  } catch (err) {
    setBot("crashed", err instanceof Error ? err.message : String(err));
    console.error("Bot berhenti:", err);
  }
}

void startBot();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} diterima, mematikan server`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
