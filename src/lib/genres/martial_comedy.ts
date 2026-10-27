import type { GenreSkill } from "./types";

export const martialComedy: GenreSkill = {
  id: "martial_comedy", version: "1.0.0", label: "Martial-arts action comedy", short: "Hong Kong-style stunt choreography, playful fights, everyday props as weapons", music: "upbeat",
  structure: [
    "Hook: an ordinary place (market, kitchen, workshop) turns into a fight in seconds.",
    "Meet the underdog who avoids fighting — and is secretly brilliant at it.",
    "Comic escalation: each fight is harder and sillier than the last; the hero improvises with props.",
    "Training or lesson beat: the hero learns the trick needed for the finale (a stance, a prop, a rhythm).",
    "Setback: the hero loses a fight and a friend is taken or a shop is wrecked.",
    "Finale: a long, clearly staged fight in a playful location, solved with the lesson plus a prop gag.",
    "Comic button: a bow, an apology, a broken item paid for.",
  ],
  archetypes: ["Humble hero with a day job (noodle cook, bike courier, tailor)", "Strict but funny master or auntie", "Over-confident rival who becomes a friend", "Gang boss with a ridiculous vanity", "Bewildered bystander whose reactions sell the jokes"],
  dialogue: {
    rules: ["Banter is quick and polite in the middle of chaos — apologising while fighting is the joke.", "Set up a phrase early and pay it off in the finale.", "Masters speak in short, practical instructions, not proverbs.", "Let reaction shots do half the comedy; lines stay under ten words."],
    examples: ["LI WEI: Sorry! Sorry. That table was very old.", "AUNTIE FONG: Feet first. Then fists. Then apology.", "BOSS KANG: Nobody touches the jacket.", "LI WEI: Then you shouldn't have worn it to a fight."],
  },
  shots: {
    lenses: "Mostly 24–35mm so full bodies and props read; 50mm for comic reactions; avoid long lenses in fights.",
    moves: "Locked-off wides that let a full exchange play, quick whip-pans to the next attacker, short dolly-ins on reactions; repeat key impacts from two angles for comedy.",
    coverage: ["Wide master holding the full exchange (both fighters head to toe)", "Medium two-shot for prop business", "Insert of the prop (ladder, chopsticks, bench)", "Bystander reaction close-up", "Hero 'oops' reaction to camera-side"],
    framing: { establish: "wide, all fighters and the playful setting visible", action: "full-body wide or medium-wide, both fighters fully in frame, feet visible", impact: "medium, repeated from a second angle, 1–2 s", comedy: "static medium, bystander in background reacting", dialogue: "two-shot or quick singles, eye level", reaction: "tight close-up, 1–2 s, deadpan" },
  },
  action: [
    "Choreograph in phrases of 3–5 moves: block, counter, prop gag, retreat. Each shot shows one phrase or one move.",
    "Every phrase has a rhythm: strike-strike-pause (joke)-strike. The pause is a reaction shot.",
    "Props drive the gags: a bench becomes a shield, a coat a whip, a ladder a cage. Name the prop and where it starts.",
    "Keep the hero frame-left and attackers frame-right through each phrase; reverse only after a visible spin or move.",
    "Fighters never blur together: always two (or a stated number of) separate full bodies with clear space between them.",
    "Stunts are playful, never brutal: no blood, falls land on soft things (sacks, awnings, laundry).",
  ],
  comedy: ["Rule of three: the same gag twice, then a twist on the third.", "Hold on the reaction one beat longer than feels comfortable.", "Physical comedy reads in wide shots — don't cut in for a pratfall.", "Pain is cartoonish and brief; the hero shakes a stung hand, then carries on."],
  lighting: "Bright, warm practicals: market bulbs, neon signs at night, sunlit courtyards; clean even light so fast moves stay readable.",
  grade: "Warm, saturated reds and golds, slightly lifted shadows, vivid neon accents at night.",
  sound: "Playful percussion and plucked strings, hits synced to impacts, comic stings on gags, music stops dead for a punchline.",
  pacing: { shotSec: [1.5, 4], notes: "Fights hold a wide for a 3–4 s phrase, then quick 1.5–2 s inserts and reactions. Dialogue scenes stay brisk." },
  look: "colourful martial-arts comedy film still, wide lens, full bodies in dynamic stances, warm practical lights, vivid reds and golds, clear readable action, playful tone",
  motion: "choreographed martial-arts movement, both fighters fully in frame, crisp clear strikes and blocks, natural speed, stable wide camera, no motion smear",
  failures: [
    { risk: "Extra limbs or merged bodies when fighters overlap", counter: "Keep a visible gap between fighters; describe each person's pose separately with left/right limbs; 'exactly two people, four arms total'." },
    { risk: "Face swaps between hero and rival mid-spin", counter: "Give the fighters contrasting wardrobe colours and hair; avoid full 360° spins within one shot." },
    { risk: "Prop teleporting (bench in the left hand, then the right)", counter: "State prop position at start and end of each shot; continue it into the next shot's start." },
    { risk: "Crowd chaos", counter: "Bystanders stay in the background, out of the fight lane, a fixed number named." },
    { risk: "Slow-mo or floaty fighting", counter: "Ask for natural speed and weight; feet planted; impacts with clear stop." },
  ],
  checklist: ["Fighters' wardrobe colours distinct and constant", "Prop in the stated hand and position at cut points", "Hero frame-left / attackers frame-right per phrase", "No blood or real injury", "Bystander count stays the same", "Broken items stay broken in later shots"],
  keywords: ["kung fu", "martial", "wushu", "fight comedy", "stunt", "dojo", "master", "shaolin", "karate", "hong kong"],
  example: `INT. NOODLE SHOP - NIGHT
LI WEI (20s, short black hair, white apron over a red T-shirt) wipes a counter. Three THUGS in grey tracksuits enter frame-right.

THUG 1
We're here for the money.

LI WEI
We only take orders after six.

Thug 1 swings. Li Wei blocks with a soup ladle — clang — then traps the arm in a hanging towel.

Shot notes: 1 establish — wide, Li Wei frame-left behind counter, thugs frame-right in doorway. 2 dialogue — two-shot across the counter. 3 action — full-body wide, swing R→L, ladle block (one move, 2 s). 4 impact — medium insert, ladle clang, repeated from a second angle. 5 reaction — a customer frame-background slurps noodles, unbothered (comedy, 2 s).`,
};
