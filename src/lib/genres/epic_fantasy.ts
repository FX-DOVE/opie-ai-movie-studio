import type { GenreSkill } from "./types";

export const epicFantasy: GenreSkill = {
  id: "epic_fantasy", version: "1.0.0", label: "Epic fantasy", short: "Medieval kingdoms, political intrigue and grand battles", music: "tension",
  structure: [
    "A world in one image: a castle, a banner, a law, a crown.",
    "The fracture: a death, a broken oath or a prophecy that threatens the throne.",
    "Factions: each house wants something; the hero is caught between them.",
    "Council scene: words as weapons — an alliance made and a betrayal seeded.",
    "Journey or siege preparation with a moment of wonder (a creature, a ruin, magic with a cost).",
    "The betrayal lands; a grand battle with clear banners and lines.",
    "A new order: a crown changes hands, or a cost is paid that will haunt the next chapter.",
  ],
  archetypes: ["Heir unsure of the right to rule", "Cunning advisor whose loyalty is unclear", "Battle-scarred knight bound by an oath", "Ambitious rival house leader", "Outsider with forbidden knowledge or magic"],
  dialogue: {
    rules: ["Slightly formal, timeless English — no modern slang, but no fake archaic 'thee/thou' either.", "Power is in short lines: threats and bargains are under twelve words.", "Every council line has a hidden motive; subtext over exposition.", "Invent names, houses and places; never borrow from existing fantasy works."],
    examples: ["QUEEN ISOLDE: Kneel, Lord Varn. Or be remembered standing.", "LORD VARN: My house has knelt for forty years.", "ARDEN: The river gate will hold till dawn.", "MAESTER OREN: Everything holds until it doesn't."],
  },
  shots: {
    lenses: "Ultra-wide 16–21mm for landscapes and castles, 35mm for halls, 75–100mm for council close-ups; occasional low angles for power.",
    moves: "Sweeping aerial reveals of castles and armies, slow push-ins in council, steady tracking along battle lines, a high wide 'god's-eye' view of the battlefield map.",
    coverage: ["Aerial establishing of the castle/landscape", "Council wide showing who sits where (power geography)", "Singles of each faction leader", "Insert of the symbol (crown, seal, sword, map)", "Battle map wide with banners", "Hero close-up in the chaos"],
    framing: { establish: "aerial extreme wide, castle or valley, tiny riders", council: "symmetrical wide, throne centre, factions left and right", dialogue: "close-up, low-key candle light, eyes sharp", battle: "high wide: our banners frame-left, enemy frame-right", impact: "medium, clash of shields, 2 s", wonder: "slow crane up, awe, soft light" },
  },
  action: [
    "Battles have readable geography: two lines, two banner colours, a clear objective (gate, bridge, hill).",
    "Cut battles as: lines meet (wide) → hero duel (medium) → turn of the tide (wide) → cost (close).",
    "Duels are 3–5 exchanges, one per shot, with swords staying in the same hands.",
    "Cavalry and armies move in one consistent direction per side.",
    "Magic has a visible cost (bleeding nose, frost on skin) and one clear effect per shot.",
  ],
  lighting: "Candle and torch light in halls, cold misty daylight outdoors, dramatic sunbeams through stained glass or clouds.",
  grade: "Rich, painterly: deep greens, steel greys, golden firelight, muted blues; high dynamic range.",
  sound: "Orchestral strings and choir, war drums for battle, a solo voice or cello for intrigue and grief.",
  pacing: { shotSec: [3, 7], notes: "Council and intrigue breathe (4–7 s); battles accelerate to 2–3 s but return to a wide every few shots." },
  look: "epic medieval fantasy film still, painterly cinematic light, candlelit stone halls or misty highlands, rich greens and golds, ornate but practical armour and gowns, vast scale",
  motion: "majestic slow camera, sweeping aerials or measured push-ins, banners and capes moving in the wind, realistic weight of armour",
  failures: [
    { risk: "Armour and crests drift", counter: "Lock each house's colours and crest as props; restate them per shot." },
    { risk: "Armies merge into an indistinct mass", counter: "Two banner colours, two sides of frame, foreground heroes named; distant soldiers soft focus." },
    { risk: "Creature anatomy changes", counter: "Lock the creature with a reference sheet: limb count, wing shape, colour." },
    { risk: "Swords swapping hands or multiplying", counter: "'Arden's longsword in his right hand, exactly one sword'." },
  ],
  checklist: ["House colours and crests constant", "Crown/seal/sword in the same hands", "Seating/power geography in council fixed", "Battle sides and banners constant", "Injuries and blood-free wounds persist", "Time of day consistent with candle vs daylight"],
  keywords: ["fantasy", "kingdom", "throne", "dragon", "medieval", "queen", "king", "castle", "knight", "sword", "magic", "empire"],
  example: `INT. THRONE HALL - NIGHT
Candlelight. QUEEN ISOLDE (50s, silver braided hair, deep green gown, thin iron crown) sits centre. LORD VARN (40s, black beard, red-and-gold house cloak) stands frame-right before her.

QUEEN ISOLDE
Your banners were seen at the river.

LORD VARN
My men were fishing, Your Grace.

QUEEN ISOLDE
With swords?

Shot notes: 1 establish — symmetrical wide, throne centre, Varn frame-right, guards frame-left. 2 dialogue — Isolde close-up, low-key candle, looking frame-right. 3 dialogue — Varn close-up, looking frame-left. 4 insert — Varn's hand tightening on his sword hilt. 5 reaction — advisor in the shadows frame-left, eyes moving (intrigue, 3 s).`,
};
