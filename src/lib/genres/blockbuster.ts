import type { GenreSkill } from "./types";

export const blockbuster: GenreSkill = {
  id: "blockbuster", version: "1.0.0", label: "American action blockbuster", short: "Big stakes, clean heroics, set-piece spectacle", music: "tension",
  structure: [
    "Cold open set piece (first 3–5 s for shorts): the hero mid-action, the stakes visible.",
    "Ordinary world in one image, then the inciting threat arrives and is bigger than the hero.",
    "Refusal or cost: the hero loses something (a partner, a plan, a vehicle).",
    "Midpoint set piece: a chase or rescue that reverses who is winning.",
    "All is lost: the villain's plan works; the hero is cornered.",
    "Climax: the hero uses a skill or object planted in act one; one clear, legible final move.",
    "Button: a quip or quiet look; a hint of the next adventure.",
  ],
  archetypes: ["Reluctant hero with a specific skill (pilot, medic, engineer)", "Wisecracking partner who grounds the stakes", "Villain with a clear, visual plan and a personal grudge", "Mentor or commander who gives the impossible order", "Civilian the hero must protect — gives the action a face"],
  dialogue: {
    rules: ["Lines are lean and active; the hero speaks less than everyone else.", "One quip per set piece at most, landed after the danger, not during it.", "Exposition rides on urgency: give orders, not explanations.", "Villain lines are calm and specific; menace through detail, not volume."],
    examples: ["MARA: Thirty seconds. Then this whole floor goes dark.", "DEV: You said the roof was the easy part.", "MARA: I said it was the fast part.", "KESSLER: You're late, Captain. I started without you."],
  },
  shots: {
    lenses: "Wide 18–24mm for scale and stunts, 35mm for coverage, 85mm for hero close-ups; anamorphic feel for 2.39:1.",
    moves: "Low-angle push-ins on the hero, sweeping crane/drone reveals for scale, tracking shots alongside vehicles, a steady handheld only inside close fights; slow-motion for one hero beat per set piece.",
    coverage: ["Master wide that shows geography of the set piece", "Hero medium tracking with movement", "Villain or threat POV", "Insert of the key object (detonator, cable, keycard)", "Reaction close-up of the civilian or partner", "Hero close-up at the decision"],
    framing: { establish: "aerial or extreme wide, tiny figures against huge scale", action: "medium-wide, full body visible, clear direction of movement", impact: "tight, low angle, debris or sparks, 1–2 s", dialogue: "clean singles and OTS, 85mm, backlit", reveal: "slow push-in or crane up", hero: "low-angle medium, slow motion, backlight flare" },
  },
  action: [
    "Break every set piece into 3–6 beats of 2–4 s: setup → first obstacle → escalation → near failure → hero move → aftermath.",
    "One action per shot: a jump, a punch, a swerve. Never 'they fight' — say who does what to whom, from which side.",
    "Keep the threat on one side of frame (e.g. enemy enters frame-left) for the whole sequence.",
    "Vehicles: always state direction of travel and lane; chases cut on matched direction.",
    "Explosions happen behind or beside the hero, never on top of them; the hero's silhouette stays readable.",
  ],
  lighting: "High-contrast key with strong backlight and rim, practical sparks/flares, golden-hour or blue-hour exteriors, hard sunlight on rooftops.",
  grade: "Teal shadows, warm skin, punchy contrast, clean blacks; saturated orange highlights in fire and sunsets.",
  sound: "Driving percussion and low brass under action, music drops out a beat before the hero's decisive move, big hit on impact, then silence → quip.",
  pacing: { shotSec: [2, 5], notes: "Fast in set pieces (2–3 s), slower for character beats (4–6 s). Every 20–30 s of a short needs a new escalation." },
  look: "big-budget action film still, anamorphic widescreen feel, dramatic backlight and rim light, atmospheric haze and sparks, teal-and-orange grade, sharp hero focus",
  motion: "confident cinematic camera: smooth tracking and push-ins, stable framing, realistic physics, one clear action, motion blur only on fast movement",
  failures: [
    { risk: "Extra limbs or merged bodies in fights", counter: "Describe exact poses: 'Mara's right fist strikes the guard's shoulder; both bodies fully separate; two arms each'." },
    { risk: "Hero's face swaps mid-action", counter: "Keep the hero's face visible and lit in every action frame; restate face and wardrobe; avoid fast spins in one shot." },
    { risk: "Gun/weapon morphing", counter: "Name the weapon once with colour and size and keep it in the same hand; avoid close-ups of firing mechanisms." },
    { risk: "Debris chaos hides the action", counter: "Keep the subject on a clean background; debris and fire only in the background plane." },
  ],
  checklist: ["Hero wardrobe damage (dirt, tears) accumulates and never resets", "Weapon/gadget in the same hand and colour across shots", "Direction of travel consistent in chases", "Time of day and weather constant inside a scene", "Wounds and bandages stay on the same side"],
  keywords: ["blockbuster", "action", "heist", "explosion", "chase", "agent", "spy", "superhero", "mission", "bomb", "hollywood"],
  example: `EXT. ROOFTOP HELIPAD - NIGHT
Rain. MARA VOSS (30s, cropped black hair, olive flight jacket with a torn sleeve) sprints L→R toward a helicopter lifting off.

MARA
Dev, hold it on the pad!

DEV (V.O.)
It's not a parking spot, Mara.

Mara leaps. Her hand catches the skid.

Shot notes: 1 establish — aerial wide, helicopter frame-right, Mara frame-left. 2 action — medium tracking L→R, full body. 3 dialogue — Mara close-up, 85mm, rain backlit. 4 impact — tight low angle on the hand catching the skid (2 s). 5 reaction — Dev in the cockpit glancing back frame-left.`,
};
