/** Rules every genre shares: spatial continuity and clear, voice-friendly dialogue. */
export const SPATIAL_RULES = [
  "180° rule: pick the axis between the two main subjects in each scene and keep the camera on one side; cross it only on a visible move (dolly across, character walks across) or a neutral head-on shot.",
  "Screen direction: a character moving or looking left→right keeps that direction across cuts until a shot shows them turn. Note it in each shot's `screen` field (e.g. \"Ada L→R, faces right\").",
  "Eyelines: in singles and OTS shots, eyelines match — A looks frame-right, B looks frame-left, at the same height unless one is standing.",
  "Matched-action cuts: when cutting mid-action, the end frame of shot N and the start frame of shot N+1 show the same pose, prop position and lighting.",
  "Establish geography first (wide or master), then cover; re-establish with a wide after any big move or new arrival.",
];

export const DIALOGUE_RULES = [
  "One speaker per line and per shot. Never put two characters' lines in one shot; no overlapping speech.",
  "Short, natural lines: 4–14 words, at most two sentences. Split longer speeches across shots (single → reaction → single).",
  "Write how people talk: contractions, fragments, interruptions written as a new line on the next shot — not stage directions inside the line.",
  "No parentheticals, emoji, sound effects or camera words inside dialogue text; put them in the action/description.",
  "Spell names and invented words the way they should be pronounced; avoid strings of numbers, acronyms and tongue-twisters the voice engine will mangle.",
  "Leave a reaction or silent beat after every important line so the cut can breathe.",
];

export const COMMON_FAILURES = [
  { risk: "Face drift between shots", counter: "Name the character and restate the locked face/hair/wardrobe from the bible in every shot prompt; keep the same reference sheet attached." },
  { risk: "Prop teleporting or duplicating", counter: "State where each hero prop is (which hand, which table) at the start and end of the shot; 'exactly one' of each prop." },
  { risk: "Extra or missing people", counter: "Give an exact headcount: 'exactly two people in frame: Ada and Chidi; background empty' (or 'background extras soft and out of focus')." },
  { risk: "Warped text and signs", counter: "Avoid readable text in frame unless it is a locked prop; keep signs out of focus." },
];
