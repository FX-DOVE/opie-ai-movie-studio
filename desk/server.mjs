// ReelForge desktop service: a real, light Linux desktop (Xvfb + Openbox + tint2 + PCManFM + xterm + Chromium)
// exposed over plain HTTP: GET /status, GET /frame (latest JPEG), POST /wake, /sleep, /input. No dependencies.
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.DESK_PORT || 7900), DISP = process.env.DESK_DISPLAY || ":7";
const W = 1280, H = 720, FPS = +(process.env.DESK_FPS || 5);
const HOME = process.env.DESK_HOME || path.join(process.cwd(), "data", "desk-home");
const CHROME = process.env.DESK_CHROME || "chromium";
const CDP = +(process.env.DESK_CDP_PORT || 9333);
const IDLE_MS = +(process.env.DESK_IDLE_MIN || 10) * 60000;
const env = { ...process.env, DISPLAY: DISP, HOME, XDG_CONFIG_HOME: path.join(HOME, ".config"), DESK_CHROME: CHROME, DESK_CDP_PORT: String(CDP) };

let state = "asleep", procs = [], ff = null, frame = null, seen = 0, control = false, err = "";
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sh = (cmd, args, o = {}) => new Promise((res) => execFile(cmd, args, { env, timeout: 8000, ...o }, (e, out) => res(e ? "" : String(out))));
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
  put(".config/openbox/rc.xml", fs.readFileSync(path.join(DIR, "rc.xml"), "utf8"));
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
  ff = spawn("ffmpeg", ["-loglevel", "error", "-f", "x11grab", "-draw_mouse", "1", "-framerate", String(FPS), "-video_size", `${W}x${H}`, "-i", DISP, "-q:v", "7", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { env, stdio: ["ignore", "pipe", "pipe"] });
  let buf = Buffer.alloc(0);
  ff.stdout.on("data", (d) => { buf = Buffer.concat([buf, d]); for (;;) { const s = buf.indexOf(Buffer.from([0xff, 0xd8])); const e = buf.indexOf(Buffer.from([0xff, 0xd9]), s + 2); if (s < 0 || e < 0) break; frame = buf.subarray(s, e + 2); buf = buf.subarray(e + 2); } if (buf.length > 4e6) buf = Buffer.alloc(0); });
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
    case "type": return xd("type", "--delay", 8, "--", String(o.text || "").slice(0, 2000));
    case "key": { const k = KEYS[o.key] || String(o.key || ""); if (!/^[\w+]+$/.test(k)) return; return xd("key", "--clearmodifiers", k); }
    case "open": { const f = { files: "1-files", terminal: "2-terminal", browser: "3-browser" }[o.app]; if (!f) return; const ex = fs.readFileSync(path.join(HOME, "Desktop", f + ".desktop"), "utf8").match(/^Exec=(.*)$/m)[1]; procs.push(spawn("sh", ["-c", ex], { env, cwd: HOME, stdio: "ignore", detached: true })); return; }
  }
}
/** what kind of window has focus — lets the phone decide whether to keep its keyboard up */
async function focus() {
  await new Promise((r) => setTimeout(r, 150));
  // the focused client window (X input focus, falling back to the EWMH active window) → its WM_CLASS
  let cls = "";
  for (const cmd of ["getwindowfocus", "getactivewindow"]) {
    const id = (await sh("xdotool", [cmd])).trim(); if (!id) continue;
    const m = (await sh("xprop", ["-id", id, "WM_CLASS"])).match(/=\s*(.*)$/m); if (m) { cls = m[1].toLowerCase(); break; }
  }
  return { cls, text: /xterm|terminal/.test(cls) };
}

setInterval(() => { if (state === "awake" && !control && Date.now() - seen > IDLE_MS) sleepNow(); }, 15000);

const body = (req) => new Promise((r) => { let s = ""; req.on("data", (d) => (s += d)); req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } }); });
http.createServer(async (req, res) => {
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
    if (u.pathname === "/browser") { if (state !== "awake") await wake(); await input({ t: "open", app: "browser" }); return json({ ok: true }); }
    json({ error: "not found" }, 404);
  } catch (e) { json({ error: e.message }, 500); }
}).listen(PORT, process.env.DESK_HOST || "127.0.0.1", () => log(`desk on :${PORT} display ${DISP} home ${HOME}`));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { shutdown(); process.exit(0); });
