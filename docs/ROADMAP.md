# ReelForge Studio — roadmap & internal notes

## Next
- [ ] Per-user accounts and auth on the studio (today only `/admin` is protected — don't expose a public URL long-term without it).
- [ ] Live video engine presets (first→last-frame clips) beyond the current pluggable adapter.
- [ ] Let the agent drive Files/Terminal directly as tools (today it opens the Browser automatically and logs to Terminal).
- [ ] Persist background jobs (`src/lib/jobs.ts`) to disk so they survive a server restart.
- [ ] Move from the JSON DB (`data/db.json`) to SQLite for concurrent writers.
- [ ] A stable public host (the dev tunnel rotates its URL every 60 minutes).

## Known limits
- On a CPU-only local model, long tasks (full screenplay) take minutes. They run as detached jobs, so the UI can be left and resumed.
- The research desktop never types credentials. Sign-in walls are handed to the user via *Take control*.
- Persistent browser profile lives in `data/browser-profile` (git-ignored).

## History
- v1: pipeline (script → assets → storyboard → continuity → voice → edit).
- v2: provider chain, brainstorm studio, virtual desktop research agent, app-wide assistant.
- v3: take control, persistent browser logins, YouTube keyword/script tools (chat-only).
- v4: floating computer widget, mobile viewer, edge-to-edge landscape.
- v5: ReelForge Studio rebrand, cinematic redesign, Reel mascot, fullscreen mobile chat, sleeping/awake desktop with Files/Terminal/Browser, resilient networking (detached jobs, resumable streams, retries), no-zoom mobile inputs.
