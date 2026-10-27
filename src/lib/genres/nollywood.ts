import type { GenreSkill } from "./types";

export const nollywood: GenreSkill = {
  id: "nollywood", version: "1.0.0", label: "Nollywood family drama", short: "Secrets, family pressure and emotional reversals", music: "tension",
  structure: [
    "Hook: a confrontation, a secret or a phone call in the first seconds.",
    "The family situation: who holds power (mother-in-law, elder brother, rich uncle).",
    "The secret begins to leak through a small object (a ring, a receipt, a text).",
    "Accusation scene: voices rise, sides are taken.",
    "Twist: the person we suspected is innocent, or the victim is guilty.",
    "Confrontation in the family living room or compound.",
    "Cliffhanger or moral resolution with a final look.",
  ],
  archetypes: ["Long-suffering wife or daughter with quiet strength", "Charming husband or son with a secret", "Powerful matriarch", "Gossiping friend or house help who knows everything", "Wealthy outsider who disrupts the family"],
  dialogue: {
    rules: ["Emotional and direct; Nigerian English rhythms and light Pidgin where natural.", "Proverbs used sparingly, short.", "Confrontations alternate accusation and denial — one line each.", "Respect titles: Mama, Oga, Aunty, Sir."],
    examples: ["ADA: Chidi, whose ring is this?", "CHIDI: Ada, please. Not in front of Mama.", "MAMA NKEM: In this house, secrets don't sleep.", "ADA: Then let them wake up."],
  },
  shots: {
    lenses: "35mm for living rooms and compounds, 50–85mm close-ups for emotional beats.",
    moves: "Slow push-ins on revelations, static two-shots for confrontations, gentle handheld for arguments, reaction cutaways to family members.",
    coverage: ["Living-room master with everyone's position", "Matched singles for the confrontation", "Insert of the secret object", "Reaction close-ups of family members", "Exterior compound or gate establishing"],
    framing: { establish: "wide compound or living room, warm practicals", dialogue: "matched singles, eyelines across the room", reveal: "slow push-in to close-up", reaction: "close-up, 2 s, held", insert: "macro of the object in hand" },
  },
  romance: ["Tender moments in two-shots with warm light; looks before words.", "Use OTS pairs for heart-to-heart conversations."],
  lighting: "Warm tungsten practicals in homes, bright Lagos daylight outside, generator-light flicker at night.",
  grade: "Warm, rich skin tones, saturated ankara colours, gentle contrast.",
  sound: "Tense strings and talking drum accents, a soft piano for tenderness, stings on revelations.",
  pacing: { shotSec: [3, 6], notes: "Hold confrontations; let reactions land before the next line." },
  look: "Nollywood family drama film still, warm tungsten practicals, rich skin tones, vibrant ankara and traditional wardrobe, Lagos home or compound setting",
  motion: "gentle cinematic push-ins, natural emotional performance, stable framing, realistic gestures",
  failures: [
    { risk: "Patterned wardrobe (ankara, gele) changes pattern", counter: "Describe the pattern colours and motif exactly and keep the reference sheet attached." },
    { risk: "Family members' faces blending", counter: "Distinct ages, hairstyles and wardrobe for every family member; restate per shot." },
  ],
  checklist: ["Wardrobe patterns and gele identical", "Secret object consistent", "Family seating positions constant", "Time of day consistent"],
  keywords: ["nollywood", "nigerian", "lagos", "family drama", "mother-in-law", "village", "naija", "ankara"],
  example: `INT. FAMILY LIVING ROOM - NIGHT
ADA (28, braided hair, yellow ankara wrapper) holds a velvet ring box. CHIDI (32, white kaftan) freezes at the door. MAMA NKEM (60s, purple gele) watches from the sofa.

ADA
Chidi, whose ring is this?

CHIDI
Ada... let me explain.

Shot notes: 1 establish — wide living room, Ada frame-left, Chidi frame-right at the door, Mama centre on the sofa. 2 insert — the ring box in Ada's right hand. 3 dialogue — Ada single, eyeline frame-right. 4 dialogue — Chidi single, eyeline frame-left. 5 reaction — Mama Nkem close-up, 3 s.`,
};
