import type { GenreSkill } from "./types";

export const kdramaRomcom: GenreSkill = {
  id: "kdrama_romcom", version: "1.0.0", label: "Korean romantic comedy drama", short: "Light, playful school or office romance with longing looks and comic misunderstandings", music: "ambient",
  structure: [
    "Meet-awkward: a clumsy collision, a mistaken identity or a spilled drink.",
    "Forced proximity: same team, same desk, a fake-dating deal or a shared umbrella.",
    "Bickering with sparks: rules the leads set for each other.",
    "The almost-moment: an accidental closeness, interrupted.",
    "Misunderstanding or secret (a past connection, a rival, a family objection).",
    "Grand gesture or honest confession in a meaningful place (rooftop, bus stop, first snow).",
    "Soft ending: a shy smile, hands almost touching, a callback to the first meeting.",
  ],
  archetypes: ["Hardworking, cheerful heroine with a stubborn streak", "Aloof, perfectionist lead who is secretly kind", "Warm second lead who loves quietly", "Comic best friend or roommate", "Strict boss, teacher or parent who becomes an ally"],
  dialogue: {
    rules: ["Playful, teasing exchanges; feelings are shown through what is NOT said.", "Leads use each other's name or a nickname at key moments.", "Inner thoughts may be voiced as narration in short lines.", "Confessions are simple and direct, not poetic speeches.", "Characters and places are original; English dialogue with natural, light Korean flavour only in names and settings."],
    examples: ["JIWOO: You moved my stapler again.", "DOHYUN: It was crooked. It was hurting my eyes.", "JIWOO: Then close your eyes, Manager Kang.", "DOHYUN: I can't. I'd miss you being wrong."],
  },
  shots: {
    lenses: "50mm and 85mm with soft backgrounds, 35mm for office or classroom geography; gentle diffusion.",
    moves: "Slow push-ins on longing looks, a slow-motion 'moment' when they first lock eyes, circling dolly for the almost-kiss, static frames for comedy.",
    coverage: ["Two-shot establishing the playful distance", "Matched OTS pair for every exchange", "Clean close-up singles for reactions", "Insert of the meaningful object (umbrella, scarf, sticky note)", "Wide romantic tableau (rooftop, rain, cherry blossoms, snow)"],
    framing: { establish: "pastel wide of the school/office/street", dialogue: "matched OTS pair at eye level, A frame-left looking right, B frame-right looking left", reaction: "clean close-up single, soft light, 2–3 s hold", comedy: "static medium two-shot, deadpan", moment: "slow push-in, 85mm, slow motion, background blur", tableau: "wide, symmetrical, weather element" },
  },
  romance: [
    "Every exchange: OTS A → OTS B → reaction close-up of the one who is silently affected.",
    "Hold reaction shots 2–3 s; the look is the line.",
    "The almost-moment is three beats: closeness (two-shot), eyes (alternating close-ups), interruption (wide, comic).",
    "Keep each lead on their side of frame through a scene (heroine frame-left, lead frame-right) so eyelines always match.",
    "Physical touch is gentle and specific: a wrist catch, an umbrella tilt, a fixed collar.",
  ],
  comedy: ["Comic timing via cutaways: a friend's shocked face, a colleague dropping a file.", "Exaggerated reactions are brief and cute, then back to sincerity.", "A running gag (the stapler, the wrong coffee order) pays off in the confession."],
  lighting: "Soft, high-key, diffused window light, warm practical lamps, glowing backlight halos, gentle evening city bokeh.",
  grade: "Pastel and airy: lifted blacks, creamy skin tones, soft pinks and mint, warm highlights.",
  sound: "Light acoustic guitar, piano and glockenspiel; a heartbeat-like soft drum on the moment; comic plucks for misunderstandings.",
  pacing: { shotSec: [2.5, 6], notes: "Dialogue cuts every 2.5–3.5 s; romantic holds up to 6 s; comedy cutaways 1.5–2 s." },
  look: "romantic comedy drama still, soft diffused light, pastel airy grade, creamy skin tones, shallow depth of field with city bokeh, stylish contemporary wardrobe, gentle warmth",
  motion: "gentle slow push-in or soft dolly, natural subtle expressions, small realistic gestures, hair and fabric moving softly, stable framing",
  failures: [
    { risk: "Faces of the two leads blend into each other", counter: "Distinct hair (heroine: shoulder-length with bangs; lead: short side-parted) and wardrobe colours; restate in every shot." },
    { risk: "Eyelines mismatch so they don't seem to look at each other", counter: "Specify 'looking frame-right toward Dohyun' and keep sides fixed per scene." },
    { risk: "Uncanny over-smooth skin", counter: "Ask for natural skin texture, subtle makeup." },
    { risk: "Props like umbrellas or cups duplicating", counter: "'exactly one umbrella, held in her left hand'." },
  ],
  checklist: ["Each lead stays on their side of frame within a scene", "Eyelines match across OTS pairs", "Hair, makeup and outfit identical within a day; outfit changes only between days", "Meaningful object consistent (colour, which hand)", "Weather (rain, snow) constant within the scene"],
  keywords: ["k-drama", "kdrama", "korean", "romcom", "rom-com", "romance", "office romance", "school romance", "seoul", "love story", "crush", "fake dating"],
  example: `INT. OFFICE PANTRY - EVENING
Rain on the window. KIM JIWOO (27, shoulder-length black hair with bangs, mustard cardigan) reaches for the last coffee pod. KANG DOHYUN (30, short side-parted hair, charcoal suit) reaches at the same time. Their hands touch.

JIWOO
I was here first.

DOHYUN
You were here loudly.

They both let go. The pod rolls away. Their colleague MINA watches from the doorway, frozen mid-sip.

Shot notes: 1 establish — wide pantry, Jiwoo frame-left, Dohyun frame-right, rain window behind. 2 moment — insert, hands touching on the pod, slow motion. 3 dialogue — OTS on Dohyun favouring Jiwoo, she looks frame-right. 4 dialogue — matched OTS favouring Dohyun, he looks frame-left. 5 reaction — Jiwoo close-up, 3 s hold. 6 comedy — Mina in the doorway, static medium, 2 s.`,
};
