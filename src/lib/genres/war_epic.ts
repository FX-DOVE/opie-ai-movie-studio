import type { GenreSkill } from "./types";

export const warEpic: GenreSkill = {
  id: "war_epic", version: "1.0.0", label: "War epic", short: "Brotherhood, sacrifice and the scale of battle seen through one unit", music: "tension",
  structure: [
    "Before: a quiet moment of the unit — letters, jokes, a photo.",
    "Orders: an impossible objective with a clear map (a bridge, a hill, a beach).",
    "First contact: chaos experienced from one soldier's point of view.",
    "Cost: a friend falls; the unit fractures.",
    "Lull: night in a ruin, a confession, a choice to go on.",
    "The push: a grand, legible battle with a clear line of advance.",
    "After: silence, the objective held, a ritual for the dead.",
  ],
  archetypes: ["Young recruit through whose eyes we see the war", "Weary sergeant who protects the unit", "Joker who keeps morale (often lost at the midpoint)", "Medic who refuses to stop", "Officer whose orders cost lives — not a cartoon villain"],
  dialogue: {
    rules: ["Soldiers speak in short, overlapping-in-spirit lines — but written one at a time.", "Humour is dry and dark; tenderness is understated.", "Orders are clear and spatial: 'left flank', 'the wall', 'on me'.", "Avoid real units, battles or historical figures; invent names and places."],
    examples: ["SGT. HALE: Eyes on the wall. Nobody runs.", "PIKE: I wasn't running. I was walking fast.", "NOAH: Is it always this loud?", "SGT. HALE: Only when it matters."],
  },
  shots: {
    lenses: "Ultra-wide 18mm for battle scale, 35mm handheld at soldier height for immersion, 100mm for faces in the chaos.",
    moves: "Long tracking shots following one soldier across the battlefield, crane-ups to reveal scale, handheld shake inside trenches, static wide tableaux for aftermath.",
    coverage: ["Battle geography master (where our side, the enemy and the objective are)", "Soldier-height tracking", "Sergeant command close-up", "Explosion/impact wide (behind subjects)", "Recruit POV", "Aftermath tableau"],
    framing: { establish: "extreme wide map shot: our line frame-left, objective frame-right", advance: "tracking medium behind soldiers moving L→R", impact: "wide, blast behind the subjects, debris", dialogue: "tight close-ups, faces dirty and lit by fire", grief: "static medium, long hold", aftermath: "wide tableau, smoke, silence" },
  },
  action: [
    "Always keep the direction of advance: our side moves L→R toward the objective in every battle shot.",
    "Break battles into waves: advance → pinned → flank → breakthrough. Each wave 2–4 shots.",
    "Show cause and effect: a shell lands (wide), the soldier reacts (close), the unit regroups (medium).",
    "Bloodless and non-graphic: impact is dust, sound and reaction, not wounds.",
    "Name the unit's count at each wave so losses read.",
  ],
  lighting: "Overcast diffuse daylight, smoke-filtered sun shafts, firelight at night, flares in the sky.",
  grade: "Bleach-bypass feel: desaturated, high contrast, earth tones, cold blue nights, muted skin.",
  sound: "Low strings and choir swells for scale; music drops for close combat, leaving ringing silence; a solo instrument for grief.",
  pacing: { shotSec: [2, 7], notes: "Battle shots 2–3 s inside waves, long holds (6–7 s) for grief and aftermath." },
  look: "epic war film still, smoke-filled battlefield, desaturated bleach-bypass grade, earth tones, soldiers in muddy period-neutral uniforms, shafts of light through smoke, vast scale",
  motion: "immersive handheld at soldier height or slow sweeping crane, realistic heavy movement through mud, clear direction of advance left to right",
  failures: [
    { risk: "Crowd chaos — soldiers merging or duplicating", counter: "Foreground: name the 2–3 heroes; background soldiers 'small, distant, soft focus'." },
    { risk: "Uniform and helmet drift", counter: "Lock the uniform as a prop sheet (colour, insignia shape, helmet) and restate it." },
    { risk: "Direction of advance flips", counter: "State 'our side moves left to right' in every battle prompt." },
    { risk: "Real-world insignia or flags", counter: "Use invented, simple insignia; no real flags or symbols." },
  ],
  checklist: ["Direction of advance constant (L→R)", "Unit headcount decreases, never resets", "Mud, dirt and bandages accumulate", "Weather and smoke level consistent per scene", "Invented insignia identical across shots"],
  keywords: ["war", "battle", "soldier", "army", "trench", "frontline", "platoon", "siege", "invasion"],
  example: `EXT. RUINED BRIDGE - DAWN
Fog. SGT. HALE (40s, square jaw, grey stubble, mud-brown greatcoat, dented helmet) leads five SOLDIERS along a wall, moving L→R. NOAH (19, freckles, oversized helmet) trails.

SGT. HALE
On me. Stay low.

A shell lands far behind them. Noah freezes.

PIKE
Keep walking, kid. It's just noise.

Shot notes: 1 establish — extreme wide, unit frame-left, bridge frame-right in fog. 2 advance — tracking medium behind the six soldiers L→R. 3 dialogue — Hale close-up, 100mm. 4 impact — wide, blast far behind subjects (2 s). 5 reaction — Noah close-up, frozen. 6 dialogue — Pike single, eyeline frame-left to Noah.`,
};
