import type { GenreSkill } from "./types";

export const prisonBreak: GenreSkill = {
  id: "prison_break", version: "1.0.0", label: "Prison-break thriller", short: "Tense, methodical escape planning under constant watch", music: "tension",
  structure: [
    "The cage: the prison's routine shown as a rhythm (count, yard, lights out).",
    "The reason: the hero must get out by a date (an innocent conviction, a sick child, a witness).",
    "The plan: a diagram, a map or a hidden tattoo — each step planted visually.",
    "Assembling the crew: each inmate brings one skill and one risk.",
    "Complications: a cell search, a transfer, a guard who suspects.",
    "The night: the plan executes step by step; one step fails and is improvised.",
    "Outside: freedom shown in one image (open sky, a road) — and a final threat.",
  ],
  archetypes: ["Calm planner who sees patterns", "Hot-headed muscle the plan depends on", "Old-timer who knows the building's secrets", "Sharp guard or warden who is closing in", "Insider outside the walls (lawyer, sibling)"],
  dialogue: {
    rules: ["Whispered, coded and brief — cameras and guards are always near.", "The plan is explained with objects, not speeches (a spoon, a map, a schedule).", "Threats are quiet; nobody shouts unless the plan breaks.", "Each crew member has one verbal tic or catchphrase."],
    examples: ["ELIAS: Count's at nine. We go at nine-oh-four.", "BRUNO: Four minutes? I need four minutes to tie my shoes.", "OLD SAUL: This wall was built by tired men.", "WARDEN PRICE: You look rested, Elias. Planning something?"],
  },
  shots: {
    lenses: "Long lens 100–135mm through bars and fences for surveillance feel, 35mm in cells, wide 24mm for the yard and tunnels.",
    moves: "Slow lateral tracking along cell blocks, static CCTV-style high angles, creeping push-ins on the planner, handheld only in the escape.",
    coverage: ["High CCTV-angle wide of the block or yard", "Planner close-up observing", "POV of the detail being watched (guard's keys, clock)", "Plan insert (map, tool, schedule)", "Guard single, suspicious", "Escape route wide"],
    framing: { establish: "high-angle CCTV-style wide of the block", plan: "overhead insert of the map or tool", dialogue: "tight two-shot, faces close, whispering, bars in foreground", tension: "slow push-in on the planner, clock in frame", search: "handheld medium, guards in the cell", escape: "low, tight tunnel or corridor tracking" },
  },
  action: [
    "The escape is a checklist: each step is one shot that shows the step succeeding or failing (lock, vent, wall, fence).",
    "Cross-cut the escape with the guard's countdown (clock, patrol, CCTV monitor).",
    "Keep the escape route's direction consistent: always moving L→R toward freedom.",
    "Tools are planted earlier and reappear identically.",
    "Fights are scuffles in confined spaces: two people, clear grips, one action per shot.",
  ],
  lighting: "Hard fluorescent top light in cells, sodium-orange yard lights at night, slatted shadows from bars, torchlight in tunnels.",
  grade: "Sickly green-cyan institutional tones, cold steel, warm skin only near freedom; deep shadows.",
  sound: "Ticking pulse and low drones, metallic clangs, footsteps, music cuts to near silence when a guard approaches.",
  pacing: { shotSec: [2, 6], notes: "Slow and suffocating in routine (4–6 s), accelerating as the plan executes (2–3 s), with a long held breath before the final step." },
  look: "tense prison thriller film still, hard fluorescent top light, slatted shadows from bars, green-cyan institutional grade, worn orange or grey prison uniforms, claustrophobic framing",
  motion: "slow creeping camera, restrained movements, tense stillness, realistic confined-space motion, stable framing",
  failures: [
    { risk: "Prison uniforms all look alike, faces swap", counter: "Give each inmate a visible identifier (number patch, tattoo, haircut) and restate it." },
    { risk: "Bars and fences warp or multiply", counter: "Keep bars in the foreground soft, straight and evenly spaced." },
    { risk: "Tools teleport", counter: "Tool's hiding place and hand stated in each shot." },
    { risk: "Guards duplicating", counter: "Exact number of guards and their positions." },
  ],
  checklist: ["Inmate numbers, tattoos and haircuts constant", "Tools match their plant shots", "Escape direction consistent (L→R)", "Clock times progress, never go backwards", "Lighting state (lights out vs on) consistent with the schedule"],
  keywords: ["prison", "escape", "jail", "breakout", "inmate", "warden", "cell", "heist plan", "tunnel"],
  example: `INT. CELL BLOCK C - NIGHT
Lights out. ELIAS (30s, shaved head, tattoo of a compass on his left forearm, orange uniform #4471) watches the corridor clock through the bars. BRUNO (40s, broad, red beard, #3902) lies on the top bunk.

ELIAS
Guard turns at nine-oh-two.

BRUNO
And if he doesn't?

ELIAS
Then we stay here forever.

Shot notes: 1 establish — high CCTV-angle wide of block C, a single guard walking L→R. 2 tension — slow push-in on Elias, bars in soft foreground, clock visible. 3 dialogue — tight two-shot, whispering. 4 insert — POV of the corridor clock at 9:01. 5 reaction — Bruno's single, staring at the ceiling.`,
};
