// ReelForge desktop service: a real, light Linux desktop (Xvfb + Openbox + tint2 + PCManFM + xterm + Chromium)
// exposed over plain HTTP: GET /status, GET /frame (latest JPEG), POST /wake, /sleep, /input. No dependencies.
import http from "node:http";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.DESK_PORT || 7900), DISP = process.env.DESK_DISPLAY || ":7";
const W = 1280, H = 720, FPS = +(process.env.DESK_FPS || 10), QV = +(process.env.DESK_QV || 9);
const HOME = process.env.DESK_HOME || path.join(process.cwd(), "data", "desk-home");
const CHROME = process.env.DESK_CHROME || "chromium";
const CDP = +(process.env.DESK_CDP_PORT || 9333);
const IDLE_MS = +(process.env.DESK_IDLE_MIN || 10) * 60000;
const env = { ...process.env, DISPLAY: DISP, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), DESK_CHROME: CHROME, DESK_CDP_PORT: String(CDP) };

let state = "asleep", procs = [], ff = null, frame = null, seen = 0, control = false, err = "";
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sh = (cmd, args, o = {}) => new Promise((res) => execFile(cmd, args, { env, timeout: 8000, ...o }, (e, out) => res(e ? "" : String(out))));
const scaleJpeg = (buf, w, q) => new Promise((ok, bad) => {
  const p = spawn("ffmpeg", ["-loglevel", "error", "-f", "mjpeg", "-i", "pipe:0", "-vf", `scale=${w}:-2:flags=area`, "-q:v", String(q), "-frames:v", "1", "-f", "mjpeg", "pipe:1"], { stdio: ["pipe", "pipe", "ignore"] });
  const out = []; p.stdout.on("data", (d) => out.push(d)); p.on("error", bad);
  p.on("close", (c) => (c === 0 && out.length ? ok(Buffer.concat(out)) : bad(new Error("scale failed " + c))));
  setTimeout(() => p.kill("SIGKILL"), 5000); p.stdin.end(buf);
});
const bg = (cmd, args) => { const p = spawn(cmd, args, { env, cwd: HOME, stdio: "ignore", detached: true }); p.on("error", (e) => log(cmd, e.message)); procs.push(p); return p; };

function setupHome() {
  // first-boot config: wallpaper, single-click desktop icons, launchers. Never overwrites user changes.
  const put = (f, s, mode) => { const p = path.join(HOME, f); if (fs.existsSync(p)) return; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); if (mode) fs.chmodSync(p, mode); };
  const wall = path.join(DIR, "wallpaper.jpg");
  put(".config/pcmanfm/default/desktop-items-0.conf", `[*]\nwallpaper_mode=crop\nwallpaper=${wall}\ndesktop_bg=#111111\ndesktop_fg=#ffffff\ndesktop_shadow=#000000\ndesktop_font=DejaVu Sans 11\nshow_wm_menu=0\nshow_documents=0\nshow_trash=0\nshow_mounts=0\n`);
  put(".config/libfm/libfm.conf", `[config]\nsingle_click=1\nquick_exec=1\n[ui]\nbig_icon_size=64\n`);
  const de = (n, name, exec, icon) => put(`Desktop/${n}.desktop`, `[Desktop Entry]\nType=Application\nName=${name}\nExec=${exec}\nIcon=${icon}\nTerminal=false\n`, 0o755);
  de("1-files", "Files", "pcmanfm --new-win " + HOME, path.join(DIR, "icons/files.png"));
  de("2-terminal", "Terminal", "xterm -fa 'DejaVu Sans Mono' -fs 12 -bg '#0b0b0d' -fg '#e5e5e5' -geometry 100x30", path.join(DIR, "icons/terminal.png"));
  de("3-browser", "Browser", path.join(DIR, "browser.sh"), path.join(DIR, "icons/browser.png"));
  { const p = path.join(HOME, ".config/openbox/rc.xml"); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, fs.readFileSync(path.join(DIR, "rc.xml"), "utf8")); } // ours: always refresh
  put(".config/tint2/tint2rc", fs.readFileSync(path.join(DIR, "tint2rc"), "utf8") + ["1-files", "2-terminal", "3-browser"].map((f) => `launcher_item_app = ${path.join(HOME, "Desktop", f + ".desktop")}\n`).join(""));
  for (const d of ["Documents", "Downloads", "Projects"]) fs.mkdirSync(path.join(HOME, d), { recursive: true });
}

async function wake() {
  if (state === "awake" || state === "starting") return;
  state = "starting"; err = ""; log("waking");
  try {
    if (procs.length) { for (const p of procs) try { process.kill(-p.pid, "SIGCONT"); } catch {} }
    else {
      fs.mkdirSync(HOME, { recursive: true }); setupHome();
      try { fs.rmSync(`/tmp/.X11-unix/X${DISP.slice(1)}`); fs.rmSync(`/tmp/.X${DISP.slice(1)}-lock`); } catch {}
      bg("Xvfb", [DISP, "-screen", "0", `${W}x${H}x24`, "-nolisten", "tcp", "-dpi", "96"]);
      for (let i = 0; i < 50 && !fs.existsSync(`/tmp/.X11-unix/X${DISP.slice(1)}`); i++) await new Promise((r) => setTimeout(r, 100));
      bg("openbox", ["--config-file", path.join(HOME, ".config/openbox/rc.xml")]);
      bg("tint2", ["-c", path.join(HOME, ".config/tint2/tint2rc")]);
      bg("pcmanfm", ["--desktop"]);
    }
    startStream(); state = "awake"; seen = Date.now();
  } catch (e) { err = e.message; state = "error"; }
}
function sleepNow() {
  if (state === "asleep") return; log("sleeping");
  stopStream(); control = false;
  // freeze (SIGSTOP) rather than kill: open windows survive, CPU drops to zero
  for (const p of procs) try { process.kill(-p.pid, "SIGSTOP"); } catch {}
  state = "asleep"; frame = null;
}
function shutdown() { stopStream(); for (const p of procs) try { process.kill(-p.pid, "SIGKILL"); } catch {} procs = []; }

function startStream() {
  if (ff) return;
  ff = spawn("ffmpeg", ["-loglevel", "error", "-f", "x11grab", "-draw_mouse", "0", "-framerate", String(FPS), "-video_size", `${W}x${H}`, "-i", DISP, "-q:v", String(QV), "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buf = Buffer.alloc(0);
  ff.stdout.on("data", (d) => { buf = Buffer.concat([buf, d]); for (;;) { const s = buf.indexOf(Buffer.from([0xff, 0xd8])); const e = buf.indexOf(Buffer.from([0xff, 0xd9]), s + 2); if (s < 0 || e < 0) break; frame = buf.subarray(s, e + 2); buf = buf.subarray(e + 2); push(frame); } if (buf.length > 4e6) buf = Buffer.alloc(0); });
  ff.stderr.on("data", (d) => log("ffmpeg", String(d).trim()));
  ff.on("exit", () => { ff = null; if (state === "awake") setTimeout(startStream, 1000); });
}
function stopStream() { const f = ff; ff = null; f?.kill("SIGKILL"); }

const X = (v) => Math.round(Math.max(0, Math.min(1, +v || 0)) * (W - 1)), Y = (v) => Math.round(Math.max(0, Math.min(1, +v || 0)) * (H - 1));
const KEYS = { Enter: "Return", Backspace: "BackSpace", Tab: "Tab", Escape: "Escape", Delete: "Delete", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right", Home: "Home", End: "End", PageUp: "Prior", PageDown: "Next" };
async function input(o) {
  const xd = (...a) => sh("xdotool", a.map(String));
  const b = o.button === "right" ? 3 : o.button === "middle" ? 2 : 1;
  switch (o.t) {
    case "move": return xd("mousemove", X(o.x), Y(o.y));
    case "click": return xd("mousemove", X(o.x), Y(o.y), "click", "--repeat", o.double ? 2 : 1, b);
    case "down": return xd("mousemove", X(o.x), Y(o.y), "mousedown", b);
    case "up": return xd("mousemove", X(o.x), Y(o.y), "mouseup", b);
    case "scroll": { const n = Math.min(15, Math.max(1, Math.round(Math.abs(+o.dy || 0) / 60))); if (o.x != null) await xd("mousemove", X(o.x), Y(o.y)); return xd("click", "--repeat", n, "--delay", 15, +o.dy > 0 ? 5 : 4); }
    case "drag": { const pts = (o.path || []).slice(0, 40); if (!pts.length) return; await xd("mousemove", X(pts[0].x), Y(pts[0].y), "mousedown", b); for (const q of pts.slice(1)) await xd("mousemove", X(q.x), Y(q.y)); return xd("mouseup", b); }
    case "hscroll": { const n = Math.min(15, Math.max(1, Math.round(Math.abs(+o.dx || 0) / 60))); if (o.x != null) await xd("mousemove", X(o.x), Y(o.y)); return xd("click", "--repeat", n, "--delay", 15, +o.dx > 0 ? 7 : 6); }
    case "type": return xd("type", "--delay", 8, "--", String(o.text || "").slice(0, 2000));
    case "key": { const k = KEYS[o.key] || String(o.key || ""); if (!/^[\w+]+$/.test(k)) return; return xd("key", "--clearmodifiers", k); }
    case "open": { const f = { files: "1-files", terminal: "2-terminal", browser: "3-browser" }[o.app]; if (!f) return; const ex = fs.readFileSync(path.join(HOME, "Desktop", f + ".desktop"), "utf8").match(/^Exec=(.*)$/m)[1]; procs.push(spawn("sh", ["-c", ex], { env, cwd: HOME, stdio: "ignore", detached: true })); return; }
  }
}
/** what kind of window has focus — lets the phone decide whether to keep its keyboard up */
async function focus() {
  await new Promise((r) => setTimeout(r, 80));
  // the focused client window (X input focus, falling back to the EWMH active window) → its WM_CLASS
  let cls = "";
  for (const cmd of ["getwindowfocus", "getactivewindow"]) {
    const id = (await sh("xdotool", [cmd])).trim(); if (!id) continue;
    const m = (await sh("xprop", ["-id", id, "WM_CLASS"])).match(/=\s*(.*)$/m); if (m) { cls = m[1].toLowerCase(); break; }
  }
  return { cls, text: /xterm|terminal/.test(cls) };
}


// ---- WebSocket stream (RFC 6455, no deps): server pushes changed JPEG frames; client sends input as JSON ----
const clients = new Set();
function wsSend(sock, op, data) {
  const n = data.length, h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
  try { sock.write(h); sock.write(data); } catch {}
}
const wsJson = (c, o) => wsSend(c.sock, 1, Buffer.from(JSON.stringify(o)));
function push(f) {
  if (!clients.size) return;
  const h = crypto.createHash("md5").update(f).digest("hex");
  for (const c of clients) {
    if (c.last === h) continue;                       // unchanged screen → send nothing
    if (c.sock.writableLength > 192 * 1024) { c.drop++; continue; } // slow link → skip frames (adaptive)
    c.last = h; seen = Date.now(); wsSend(c.sock, 2, f);
  }
}
// serial input queue per client; consecutive moves collapse to the latest one
async function pump(c) {
  if (c.busy) return; c.busy = true;
  while (c.q.length) {
    let o = c.q.shift(); while (o.t === "move" && c.q[0]?.t === "move") o = c.q.shift();
    try {
      seen = Date.now(); if (state !== "awake") await wake();
      await input(o);
      if (o.id && (o.t === "click" || o.t === "up")) wsJson(c, { t: "ack", id: o.id, ...(await focus()) });
    } catch (e) { log("ws input", e.message); }
  }
  c.busy = false;
}
function upgrade(req, sock) {
  const key = req.headers["sec-websocket-key"];
  if (!key || !/\/ws$/.test(new URL(req.url, "http://x").pathname)) return sock.destroy();
  const acc = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { sock, q: [], busy: false, last: "", drop: 0 }; clients.add(c); seen = Date.now();
  if (state !== "awake") wake().catch(() => {}); else if (frame) push(frame);
  wsJson(c, { t: "status", state, control });
  let buf = Buffer.alloc(0);
  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      if (buf.length < 2) break;
      const op = buf[0] & 15, masked = buf[1] & 128; let n = buf[1] & 127, o = 2;
      if (n === 126) { if (buf.length < 4) break; n = buf.readUInt16BE(2); o = 4; } else if (n === 127) { if (buf.length < 10) break; n = Number(buf.readBigUInt64BE(2)); o = 10; }
      const m = masked ? buf.subarray(o, o + 4) : null; if (masked) o += 4;
      if (buf.length < o + n) break;
      const p = Buffer.from(buf.subarray(o, o + n)); if (m) for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3];
      buf = buf.subarray(o + n);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { wsSend(sock, 10, p); continue; }
      if (op === 1) { try { const j = JSON.parse(String(p)); if (j.t === "ping") wsJson(c, { t: "pong", ts: j.ts }); else if (j.t) { c.q.push(j); pump(c); } } catch {} }
    }
  });
  const bye = () => clients.delete(c); sock.on("close", bye); sock.on("error", bye);
}

setInterval(() => { if (clients.size) seen = Date.now(); if (state === "awake" && !control && Date.now() - seen > IDLE_MS) sleepNow(); }, 15000);

const body = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
const server = http.createServer(async (req, res) => {
  const json = (o, c = 200) => { res.writeHead(c, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); };
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/status") return json({ state, control, err, w: W, h: H, cdp: CDP });
    if (u.pathname === "/frame") { seen = Date.now(); if (!frame) { res.writeHead(204); return res.end(); } res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "Content-Length": frame.length }); return res.end(frame); }
    if (req.method !== "POST") return json({ error: "not found" }, 404);
    const o = await body(req); seen = Date.now();
    if (u.pathname === "/wake") { await wake(); return json({ state }); }
    if (u.pathname === "/sleep") { sleepNow(); return json({ state }); }
    if (u.pathname === "/control") { control = !!o.on; return json({ control }); }
    if (u.pathname === "/input") { if (state !== "awake") await wake(); await input(o); return json({ ok: true, ...(o.t === "click" || o.t === "up" ? await focus() : {}) }); }
    if (u.pathname === "/shot") { // a fresh frame after the screen settles (for computer-use agents)
      if (state !== "awake") await wake(); if (!ff) startStream();
      const t0 = Date.now(), old = frame; const wait = +(o.settle ?? 350);
      while (Date.now() - t0 < 4000 && (!frame || frame === old || Date.now() - t0 < wait)) await new Promise((r) => setTimeout(r, 50));
      if (!frame) return json({ error: "no frame" }, 503);
      // optional downscale/recompress for model input (fewer image tokens): {w: 1024, q: 2..31}
      let img = frame; const tw = Math.round(+o.w || 0);
      if ((tw >= 320 && tw < W) || o.q) img = await scaleJpeg(frame, tw >= 320 && tw < W ? tw : W, Math.max(2, Math.min(31, +o.q || QV))).catch(() => frame);
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store", "Content-Length": img.length }); return res.end(img);
    }
    if (u.pathname === "/browser") { if (state !== "awake") await wake(); await input({ t: "open", app: "browser" }); return json({ ok: true }); }
    json({ error: "not found" }, 404);
  } catch (e) { json({ error: e.message }, 500); }
});
server.on("upgrade", upgrade);
server.listen(PORT, process.env.DESK_HOST || "127.0.0.1", () => log(`desk on :${PORT} display ${DISP} home ${HOME}`));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { shutdown(); process.exit(0); });
