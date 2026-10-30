// Tiny render queue for HyperFrames: one render at a time, niced, hard timeout. The container's mem_limit (~1.2 GB) is the OOM cap;
// a killed Chrome returns an error so the app falls back to FFmpeg motion.
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const ROOT = process.env.DATA_DIR || "/data";
const GSAP = path.resolve("gsap.min.js");
let busy = false; const q = [];
function render({ dir, out, timeoutSec = 600 }) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    fs.copyFileSync(GSAP, path.join(dir, "gsap.min.js"));
    const p = spawn("nice", ["-n", "10", "npx", "--no-install", "hyperframes", "render", "--low-memory-mode", "-o", out], { cwd: dir, env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1", DO_NOT_TRACK: "1" } });
    let log = ""; const keep = (d) => { log = (log + d).slice(-4000); };
    p.stdout.on("data", keep); p.stderr.on("data", keep);
    const k = setTimeout(() => p.kill("SIGKILL"), timeoutSec * 1000);
    p.on("close", (code, sig) => { clearTimeout(k); const ok = code === 0 && fs.existsSync(out) && fs.statSync(out).size > 1000; resolve({ ok, ms: Date.now() - t0, code, signal: sig, error: ok ? undefined : (sig ? `killed (${sig}) — out of memory or timeout` : log.split("\n").filter((l) => /error|fail/i.test(l)).slice(-3).join(" ") || `exit ${code}`) }); });
  });
}
async function pump() { if (busy || !q.length) return; busy = true; const { job, done } = q.shift(); try { done(await render(job)); } catch (e) { done({ ok: false, error: String(e) }); } busy = false; pump(); }
const inside = (p) => { const r = path.resolve(p); return r.startsWith(path.resolve(ROOT) + path.sep) ? r : null; };
http.createServer((req, res) => {
  const send = (s, b) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
  if (req.method === "GET" && req.url === "/health") return send(200, { ok: true, busy, queued: q.length });
  if (req.method !== "POST" || req.url !== "/render") return send(404, { error: "not found" });
  let body = ""; req.on("data", (d) => { body += d; if (body.length > 1e5) req.destroy(); });
  req.on("end", () => {
    let b; try { b = JSON.parse(body); } catch { return send(400, { error: "bad json" }); }
    const dir = inside(b.dir || ""), out = inside(b.out || "");
    if (!dir || !out || !fs.existsSync(path.join(dir, "index.html"))) return send(400, { error: "dir/out must be under DATA_DIR with index.html" });
    q.push({ job: { dir, out, timeoutSec: Math.min(1800, Number(b.timeoutSec) || 600) }, done: (r) => send(r.ok ? 200 : 500, r) }); pump();
  });
}).listen(8100, () => console.log("hyperframes renderer on :8100"));
