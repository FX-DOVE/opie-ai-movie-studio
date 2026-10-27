import type { GenreSkill } from "./types";

export const commando: GenreSkill = {
  id: "commando", version: "1.0.0", label: "One-man-army commando action", short: "A lone operator, a hostile compound, methodical escalation", music: "tension",
  structure: [
    "Hook: the operator's competence in one silent, precise action.",
    "The ask: someone the operator owes is taken; the clock starts.",
    "Gear-up montage: close inserts of tools being prepared — each one used later.",
    "Infiltration: stealth beats, each guard handled differently.",
    "Discovery: the alarm, the odds flip to hundreds versus one.",
    "Wounded and cornered: the operator improvises with the environment.",
    "Extraction: one last stand, then walking out as the compound burns behind.",
  ],
  archetypes: ["Retired operator of few words with a code", "The person they must rescue — gives the violence a reason", "Arrogant warlord or private-army commander", "Radio voice handler who knows the operator's past", "Young guard who hesitates — a moment of mercy"],
  dialogue: {
    rules: ["The operator speaks in single short sentences, often only after acting.", "Radio chatter carries exposition: call signs, numbers, distances (keep numbers simple and few).", "Villains talk too much; the operator interrupts with action.", "No speeches before a kill — silence is the style."],
    examples: ["ROOK: Two minutes. Stay down.", "HANDLER (V.O.): Rook, there are forty of them.", "ROOK: Then I'll need forty-one bullets.", "COMMANDER VARGA: You came alone? How sad."],
  },
  shots: {
    lenses: "35mm for stealth and movement, 50mm over-the-shoulder for aiming, wide 24mm for the compound, long lens 135mm for surveillance POV.",
    moves: "Slow, deliberate dolly and crane in stealth; locked-off silhouettes; handheld only once the alarm sounds; tracking behind the operator through corridors.",
    coverage: ["Surveillance POV wide of the compound", "Operator silhouette medium", "Gear and hand insert", "Guard single, unaware", "Over-the-shoulder aim", "Aftermath wide"],
    framing: { establish: "long-lens surveillance wide through foliage or binoculars", stealth: "low-key medium, operator in silhouette against a lit window", action: "medium-wide, operator and opponent separate and fully visible", impact: "tight, 1–2 s, no gore", gear: "macro insert of hands and tools", aftermath: "slow wide, smoke, operator walking toward camera" },
  },
  action: [
    "Stealth beats: approach → wait → act → hide body/clear lane. One beat per shot.",
    "Gunfights: establish cover positions first (wide), then alternate operator fire / enemy return, always same sides of frame.",
    "Hand-to-hand is short and brutal-looking but bloodless: grab, strike, takedown in three shots.",
    "Count enemies in each shot (e.g. 'two guards'); never an undefined crowd.",
    "The operator's injury (left arm graze) is introduced once and stays.",
  ],
  lighting: "Low-key night with moonlight blue and sodium-orange compound lights, hard single-source pools, muzzle flashes as the only fill in fights.",
  grade: "Desaturated olive and steel blue, crushed shadows, warm skin kept natural, orange fire accents.",
  sound: "Pulsing low synth and taiko-like drums, long silences in stealth, sharp transient hits, radio static textures.",
  pacing: { shotSec: [2, 6], notes: "Stealth holds longer (4–6 s) to build dread; once the alarm sounds, 2–3 s shots." },
  look: "gritty commando action film still, night compound lit by sodium lights and moonlight, operator in tactical gear in silhouette, haze, desaturated olive and steel-blue grade, hard single-source light",
  motion: "deliberate tactical movement, smooth tracking behind the operator, stable framing, realistic weight, one clear action per shot",
  failures: [
    { risk: "Guards multiply between shots", counter: "State the exact enemy count in frame and where they stand." },
    { risk: "Gear morphing (rifle becomes pistol, vest colour shifts)", counter: "Lock gear as props: weapon type, colour, vest, sling side; restate each shot." },
    { risk: "Faces hidden in dark lose identity", counter: "Keep a rim light on the operator's face profile; mention the face scar or beard each time." },
    { risk: "Muzzle flash / fire everywhere", counter: "Limit fire to one source per shot; background stays readable." },
  ],
  checklist: ["Operator gear identical (weapon, vest, knife side)", "Injury on the same side and growing, never vanishing", "Enemy count and positions consistent", "Night lighting direction stays the same within a location", "Rescued person's wardrobe constant"],
  keywords: ["commando", "operator", "soldier", "rescue mission", "one man army", "special forces", "mercenary", "compound", "hostage"],
  example: `EXT. JUNGLE COMPOUND - NIGHT
ROOK (40s, close-cropped grey beard, black tactical vest, rifle slung on the right) crouches in ferns. Two GUARDS smoke under a sodium lamp.

HANDLER (V.O.)
Two at the gate. Forty inside.

Rook waits for the lamp to flicker, then moves.

ROOK
Now it's thirty-eight.

Shot notes: 1 establish — 135mm surveillance POV through ferns, two guards frame-right. 2 stealth — Rook silhouette medium, frame-left, rim light on beard (5 s). 3 gear — macro insert, gloved hand unclipping a knife on the left hip. 4 action — medium-wide, Rook moves L→R behind the guards, both guards fully visible. 5 aftermath — wide, empty gate, lamp swinging.`,
};
