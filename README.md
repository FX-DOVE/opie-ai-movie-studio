# ReelForge Studio

**ReelForge Studio is an AI film studio that takes a single idea to a finished film.** It writes, casts, storyboards, keeps faces and wardrobe consistent across every shot, voices the dialogue, and cuts the result into an MP4. It handles drama, documentary and product ads in realistic, 3D, cartoon or anime styles, for Shorts, TikTok, Reels or long-form YouTube.

Built for the Meta Global AI Developer Hackathon 2026.

![Landing](https://raw.githubusercontent.com/FX-DOVE/opie-ai-movie-studio/main/public/brand/still-lagos.webp)

## Features

- **Brainstorm room.** Chat with a writers' room agent. Ideas come back as cards (logline, hook, beats, cast), and one tap turns an idea into a screenplay.
- **Script → cast → board.** Characters, locations and props are extracted from the script, and each gets a reference sheet. A director agent breaks scenes into shots with start and end frames, chained for continuity.
- **Continuity supervisor.** A vision pass compares every frame with the production bible (faces, skin tone, hair, wardrobe, props, location) and fixes drift in one click.
- **Voice and edit.** Neural TTS reads every line. The timeline has music and subtitles. You can describe edits in plain words, and the editor re-cuts and re-renders.
- **Reel, the assistant.** A draggable robot mascot that is available on every page. On phones it opens a fullscreen messaging UI; on desktop it opens a large panel. Reel calls studio tools (create project, brainstorm, write, storyboard, render, research, YouTube keywords and scripts) and streams its progress.
- **Reel's computer.** A draggable, top-right desktop that sleeps when idle and wakes to three apps:
  - **Files**: project assets and renders.
  - **Terminal**: a sandboxed agent log and command view; nothing runs on the host.
  - **Browser**: real headless Chromium through Playwright.

  You can watch the agent work, then *Take control* to click and type yourself. The agent never types credentials.
- **Resilient on bad networks.** Long work runs as detached server jobs, and streams send heartbeats and resume after a drop. Failed requests show a friendly message with a Retry button.
- **Mobile first.** There is no zoom-on-focus, the layout follows the keyboard (`interactive-widget=resizes-content`, `dvh`) and respects safe areas, and nothing overflows horizontally from 360 px to 1440 px.

## Architecture

```
Next.js 15 (App Router, standalone) ─ Tailwind v4 ─ lucide-react
│
├─ src/app            pages: / (landing), /studio, /studio/[id], /admin (old /research redirects to /studio; research runs through Reel's chat)
│  └─ api/            projects, actions, brainstorm (NDJSON), agent (NDJSON), research, jobs, files, admin
├─ src/lib
│  ├─ providers/meta.ts   provider chain: Meta models first, OpenAI-compatible fallback, local demo
│  ├─ agent.ts            tool-calling assistant over studio actions
│  ├─ research.ts         Playwright desktop agent (vision loop / Meta computer use) + take-control
│  ├─ jobs.ts             detached jobs + buffered, resumable NDJSON streams
│  ├─ render.ts           ffmpeg timeline render, AI edit parsing, cut review
│  └─ crypto.ts, config.ts  encrypted admin key store
├─ src/components     studio UI, AgentChat + Mascot, DesktopWidget + DeskApps
└─ data/              JSON DB, media, browser profile (git-ignored)
```

### Meta tooling

| Meta capability | Used for |
|---|---|
| Text models (chat completions, JSON mode) | Brainstorm, screenplay writing, asset extraction, story bible, shot breakdown, continuity reasoning, cut review, edit parsing, and the assistant's tool calls |
| Image generation and editing | Reference sheets, storyboard start/end frames (conditioned on the references and the previous frame), one-click continuity fixes |
| Agentic computer use (Responses API) | The research desktop driving a real Chromium |

All model calls go through one server-side adapter (`src/lib/providers/meta.ts`). Under the hackathon rules (`META_ONLY=on`, the default) the chain is Meta-only: Muse Spark → Muse Wonder (Meta API) → Meta's open Muse Spark weights on Baseten, then a deterministic offline demo planner (no model). The old OpenAI-compatible fallback is kept in code but disabled. **Keys never reach the browser.**

## Setup

```bash
cp .env.example .env     # set APP_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm install
npx playwright install chromium   # or set CHROMIUM_PATH
npm run dev              # http://localhost:3000
```

Requires `ffmpeg` on PATH. To run with Docker: `docker compose up --build`.

### Environment

| Variable | Purpose |
|---|---|
| `APP_SECRET` | Encrypts stored keys and signs admin sessions (required) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `/admin` login (required; use a generated password) |
| `META_API_KEY`, `META_BASE_URL` | Meta model access (optional; this can also be set in `/admin`) |
| `META_ONLY` | `on` (default) = only Meta models run; non-Meta LLM fallbacks and third-party video models are disabled |
| `ELEVENLABS_API_KEY`, `YOUTUBE_API_KEY` | Premium voices and YouTube Data API (optional) |
| `DATA_DIR`, `CHROMIUM_PATH` | Storage location and browser binary |
| `DESK_URL`, `DESK_CDP_URL`, `DESK_AGENT` | Reel's computer service (default `http://127.0.0.1:7900`, CDP `:9333`); `DESK_AGENT=0` keeps the agent on its own headless browser |

Keys added in `/admin` are stored encrypted (AES-GCM with `APP_SECRET`) in `data/`. `.env` and `data/` are git-ignored.

## Reel's computer (real Linux desktop)

`desk/` is a small, dependency-free service (`desk/server.mjs`) that runs a real desktop: **Xvfb 1280×720 + Openbox + tint2 + PCManFM (desktop icons, file manager) + xterm + Chromium**. Desktop icons are Files, Terminal and Browser.

- **Streaming:** `ffmpeg -f x11grab` makes a 5 fps MJPEG feed. The app proxies `GET /api/desk/frame` and `/api/desk/status`, so everything goes through the app's single URL, including tunnels. No extra port or websocket is needed.
- **Input:** `POST /api/desk/input` runs `xdotool` (move, click, right-click, scroll, type, key).
- **Phone controls:** one **Take control / Done** button. Taking control pauses the agent; Done hands control back. There are two input modes, saved in the browser:
  - **Mouse mode** works like a trackpad: drag to move the cursor, tap to click, two-finger scroll, long-press to right-click.
  - **Touch mode:** tap where you touch, swipe to scroll, long-press to right-click.
- **Phone keyboard:** tapping a text field focuses a hidden input, so the native keyboard opens with no visible bar and no zoom. It closes again if the remote focus isn't a text field. Focus is checked through Chromium CDP, or the window class for xterm.
- **Agent:** the research tool connects to the **same Chromium** over CDP (`--remote-debugging-port=9333`), so you watch it work and can take over the same session.
- **Persistence:** home and the Chromium profile live in `DESK_HOME` (`data/desk-home`, or the `desk-home` volume).
- **Sleep:** with no viewer for `DESK_IDLE_MIN` minutes (default 10) the stack is frozen (SIGSTOP, zero CPU, windows kept) and the stream stops. "Tap to wake" resumes it.
- **Footprint:** about 350–700 MB RAM with Chromium open and well under one core when idle, so it fits a ~$10 VPS (1–2 vCPU, 2–4 GB). `docker-compose.yml` caps each service at 1 CPU / 1.5 GB.

Run locally without Docker: `apt install xvfb openbox tint2 pcmanfm xterm xdotool ffmpeg chromium`, then `DESK_CHROME=$(which chromium) node desk/server.mjs`. With Docker, `docker compose up --build` starts `desk` and the app, sharing one network namespace so CDP stays on localhost.

## Security notes

- Secrets live only in `.env` or the encrypted admin store. They are never committed or sent to the client.
- The browser agent never types passwords. Sign-ins are handed to you through *Take control*, and the session is kept in a local profile.
- The studio itself has no user auth yet (see [docs/ROADMAP.md](docs/ROADMAP.md)), so don't share a public URL widely.

## License

MIT


## Runtime models

Every AI model ReelForge calls at runtime is a Meta model.

| Part | What runs | Type |
|---|---|---|
| Director, script, agent, computer use, continuity review | Meta Muse Spark / Muse Wonder (Meta API, Baseten `muse-spark-open`) | Meta model |
| Images | Meta Muse Image | Meta model |
| Person segmentation (optional) | Meta SAM 3.1 | Meta model |
| Voiceover | Meta MMS-TTS `facebook/mms-tts-eng` (self-hosted, `services/mms-tts`) | Meta model |
| Dialogue-clarity check | Meta wav2vec2 `facebook/wav2vec2-base-960h` (self-hosted) | Meta model |
| Character voice variety | FFmpeg pitch/tempo shift + loudness normalisation | System feature |
| Voice fallback | espeak-ng (offline formant synthesiser) | System feature, not AI |
| Shot motion (video) | FFmpeg Ken Burns, parallax and crossfades over Muse Image stills | System feature, not AI |
| Editing, subtitles, mixing | FFmpeg | System feature |

Third-party voices (Edge, ElevenLabs, OpenAI-compatible) are disabled; the code stays behind `THIRD_PARTY_TTS=on`, which is off.
Third-party video models (LTX, MiniMax, Veo, fal, Replicate, OpenAI-compatible) and the OpenAI-compatible LLM fallback are disabled under the same rules; the code stays behind `META_ONLY=off`.
MMS-TTS weights are CC-BY-NC 4.0 (non-commercial use only).
