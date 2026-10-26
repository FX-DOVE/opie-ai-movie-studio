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
├─ src/app            pages: / (landing), /studio, /studio/[id], /research, /admin
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

All model calls go through one server-side adapter (`src/lib/providers/meta.ts`). When no Meta key is set, the same chain falls back to any OpenAI-compatible endpoint (including a local llama.cpp server) and then to a deterministic demo mode. **Keys never reach the browser.**

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
| `FALLBACK_*` / `XAI_API_KEY` | Any OpenAI-compatible fallback (optional) |
| `ELEVENLABS_API_KEY`, `YOUTUBE_API_KEY` | Premium voices and YouTube Data API (optional) |
| `DATA_DIR`, `CHROMIUM_PATH` | Storage location and browser binary |

Keys added in `/admin` are stored encrypted (AES-GCM with `APP_SECRET`) in `data/`. `.env` and `data/` are git-ignored.

## Security notes

- Secrets live only in `.env` or the encrypted admin store. They are never committed or sent to the client.
- The browser agent never types passwords. Sign-ins are handed to you through *Take control*, and the session is kept in a local profile.
- The studio itself has no user auth yet (see [docs/ROADMAP.md](docs/ROADMAP.md)), so don't share a public URL widely.

## License

MIT
