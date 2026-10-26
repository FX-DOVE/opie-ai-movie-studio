/** Lightweight screenplay parser used for formatting, asset extraction and storyboard planning. */
export type Line = { type: "title" | "scene" | "action" | "character" | "paren" | "dialog" | "transition" | "blank"; text: string };
export interface ParsedScene { heading: string; items: { kind: "action" | "dialog"; speaker?: string; text: string }[] }

export function classify(script: string): Line[] {
  const raw = script.replace(/\r/g, "").split("\n");
  const out: Line[] = [];
  let prev: Line["type"] = "blank";
  for (const l of raw) {
    const t = l.trim();
    let type: Line["type"];
    if (!t) type = "blank";
    else if (/^title\s*:/i.test(t)) type = "title";
    else if (/^(INT\.|EXT\.|INT\/EXT|I\/E\.?|EST\.)/i.test(t) || /^scene\s+\d+/i.test(t)) type = "scene";
    else if (/^(CUT TO:|FADE (IN|OUT)[.:]?|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|FADE TO BLACK\.?)$/i.test(t) || /TO:$/.test(t)) type = "transition";
    else if (/^\(.*\)$/.test(t) && (prev === "character" || prev === "dialog")) type = "paren";
    else if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length < 40 && !/[.!?]$/.test(t.replace(/\(.*\)/, "").trim())) type = "character";
    else if (prev === "character" || prev === "paren" || prev === "dialog") type = "dialog";
    else type = "action";
    out.push({ type, text: t });
    prev = type;
  }
  return out;
}

export function parseScenes(script: string): { title: string; scenes: ParsedScene[] } {
  const lines = classify(script);
  let title = "";
  const scenes: ParsedScene[] = [];
  let cur: ParsedScene | null = null;
  let speaker = "";
  for (const l of lines) {
    if (l.type === "title") { title = l.text.replace(/^title\s*:\s*/i, ""); continue; }
    if (l.type === "scene") { cur = { heading: l.text.toUpperCase(), items: [] }; scenes.push(cur); continue; }
    if (!cur && (l.type === "action" || l.type === "character")) { cur = { heading: "SCENE 1", items: [] }; scenes.push(cur); }
    if (!cur) continue;
    if (l.type === "character") speaker = l.text.replace(/\s*\(.*\)\s*$/, "").trim();
    else if (l.type === "dialog") {
      const last = cur.items[cur.items.length - 1];
      if (last && last.kind === "dialog" && last.speaker === speaker) last.text += " " + l.text;
      else cur.items.push({ kind: "dialog", speaker, text: l.text });
    } else if (l.type === "action") {
      const last = cur.items[cur.items.length - 1];
      if (last && last.kind === "action" && last.text.length < 160) last.text += " " + l.text;
      else cur.items.push({ kind: "action", text: l.text });
    }
  }
  return { title, scenes };
}

export const NARRATOR_RE = /^(NARRATOR|VOICE ?OVER|V\.?O\.?|ANNOUNCER)/i;
