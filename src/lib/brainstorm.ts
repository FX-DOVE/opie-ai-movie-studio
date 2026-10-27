import { db } from "./db";
import { maybeAutoResearch } from "./autoresearch";
import { chatP, chatStream, llmLive, parseJson, type Msg } from "./providers/meta";
import { FORMATS, MODES, STYLES, type ChatMsg, type Idea, type Project } from "./types";

const MODE_BRIEF: Record<string, string> = {
  drama: "You develop gripping short-form and long-form DRAMA (Nollywood-style family drama, romance, thriller, comedy). Think in conflict, secrets, reversals and cliffhangers. Characters need wants, wounds and visual signatures (face, skin tone, hair, wardrobe colours, accessories).",
  documentary: "You develop DOCUMENTARIES. Think in a central question, surprising facts, real-world stakes, a narrator voice, archive/b-roll ideas and a satisfying reveal. Never invent fake statistics — flag claims that need fact-checking.",
  ad: "You develop PRODUCT ADS. Think in the audience's pain point, a 1–2s scroll-stopping hook, the product hero moment, proof, and a crisp call to action. Keep every idea shootable and on-brand.",
};

export function systemPrompt(p: Project) {
  const f = FORMATS[p.format];
  const research = (p.research || []).slice(-3).map((r) => `• Research — ${r.goal}:\n${r.notes.slice(0, 2500)}`).join("\n\n");
  return `You are Reel, the ReelForge Studio assistant, the head of development at an AI movie studio — a sharp, warm, opinionated creative partner.
${MODE_BRIEF[p.mode]}
Project: "${p.title}". Mode: ${MODES[p.mode]}. Platform: ${f.label}, ${p.aspect}, max ${f.maxSec}s. Visual style: ${p.style === "custom" ? p.customStyle : STYLES[p.style]}.
${p.idea ? `Current working idea: ${p.idea}\n` : ""}${p.script ? `A script draft exists (${p.script.length} chars) beginning: ${p.script.slice(0, 400)}\n` : ""}${research ? `\nResearch the team gathered (use it, cite the patterns that matter):\n${research}\n` : ""}
How to answer:
- Do NOT write screenplay pages here (that happens in the Script tab) — pitch and develop ideas.
- Talk naturally in markdown: short paragraphs and bullets, concrete and visual, fitted to the platform length.
- When you pitch ideas (usually 2–3, or 1 when refining), end your reply with ONE fenced block exactly like:
\`\`\`ideas
{"ideas":[ {"title": <catchy title>, "logline": <one-sentence logline>, "hook": <what we see/hear in the first 2 seconds>, "beats": [<beat>, ...], "characters": [{"name": <name>, "description": <age, look, wardrobe, want>}] } ]}
\`\`\`
- Beats: 4–7 for shorts, 6–10 for long form. If the user is only chatting or asking a question, you may skip the block.
- End with one short question that moves the project forward.`;
}

const realIdea = (i: Idea) => !!i?.title && !!i?.logline && !/^[.<…\s]*$|^\.\.\.|one sentence|catchy title/i.test(`${i.title}`) && !/^one[- ]sentence/i.test(i.logline);
export function extractIdeas(text: string): { clean: string; ideas: Idea[] } {
  const m = text.match(/```ideas\s*([\s\S]*?)```/) || text.match(/```json\s*(\{\s*"ideas"[\s\S]*?)```/);
  if (!m) return { clean: text.trim(), ideas: [] };
  let ideas: Idea[] = [];
  try { ideas = (JSON.parse(m[1]).ideas || []).filter(realIdea); } catch { /* malformed */ }
  return { clean: text.replace(m[0], "").trim(), ideas };
}

function mockReply(p: Project, message: string): string {
  const topic = message.replace(/[?.!]+$/, "").slice(0, 80) || "a second chance";
  const ideas: Idea[] = p.mode === "ad"
    ? [{ title: "The 3pm Slump", logline: `A tired worker's day flips the moment ${topic} enters frame.`, hook: "Close-up: eyes closing at a desk, alarm sound", beats: ["Pain: the slump", "Product reveal in hero light", "Proof: before/after", "CTA with logo"], characters: [{ name: "Tolu", description: "28, office worker, navy shirt" }] }]
    : p.mode === "documentary"
    ? [{ title: `The Untold Story of ${topic}`, logline: `What most people get wrong about ${topic} — told through one person who lived it.`, hook: "The most surprising fact, on screen in 2 seconds", beats: ["Cold open fact", "Meet the witness", "How it started", "The turning point", "What it means today"], characters: [{ name: "Narrator", description: "calm, authoritative" }] }]
    : [{ title: "The Ring at Dinner", logline: `A secret about ${topic} surfaces at a family dinner and forces a choice.`, hook: "A ring box slides across the table — nobody breathes", beats: ["Dinner tension", "The reveal", "Accusation", "A twist from mum", "Cliffhanger"], characters: [{ name: "Ada", description: "24, braided hair, red ankara" }, { name: "Chidi", description: "27, silver watch, nervous" }] }];
  return `**Demo mode** — no AI key is configured, so this is a template. Add a Meta key (or a fallback like xAI) in **Admin → AI brain** for real brainstorming.\n\nHere's a starting direction for "${topic}":\n\n\`\`\`ideas\n${JSON.stringify({ ideas })}\n\`\`\`\nWant me to push it darker, funnier, or more emotional?`;
}

/** Streams the assistant reply; persists the user + assistant turns (with provider and parsed ideas). */
export function brainstormStream(p: Project, message: string, autoResearch = false): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const history: Msg[] = p.brainstorm.filter((m, i, arr) => m.kind !== "note" && !(m.role === "assistant" && (!m.provider || m.provider === "demo")) && !(m.role === "user" && arr[i + 1]?.role === "assistant" && (!arr[i + 1].provider || arr[i + 1].provider === "demo"))).slice(-16).map((m) => ({ role: m.role, content: m.content + (m.ideas?.length ? `\n[ideas pitched: ${m.ideas.map((i) => i.title).join("; ")}]` : "") }));
  const userAt = new Date().toISOString();
  return new ReadableStream({
    async start(ctrl) {
      let closed = false;
      const send = (o: unknown) => { if (!closed) try { ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n")); } catch { /* client gone */ } };
      // auto-research runs alongside the reply: once per concrete topic, on Reel's computer
      const auto = (autoResearch ? maybeAutoResearch({ message, projectId: p.id, scope: "p:" + p.id, context: `${p.mode} · ${p.title}${p.idea ? " · " + p.idea.slice(0, 160) : ""}` }).then((r) => { if (r) send({ type: "research", ...r }); return r; }) : Promise.resolve(null)).catch(() => null);
      const meta: { provider?: string; model?: string } = {};
      let full = "";
      try {
        if (llmLive()) {
          for await (const t of chatStream([{ role: "system", content: systemPrompt(p) }, ...history, { role: "user", content: message }], { temperature: 0.85, task: "director" }, meta)) {
            if (!full) send({ type: "provider", provider: meta.provider, model: meta.model });
            full += t; send({ type: "delta", text: t });
          }
        } else {
          meta.provider = "demo";
          send({ type: "provider", provider: "demo" });
          full = mockReply(p, message);
          for (const chunk of full.match(/[\s\S]{1,24}/g) || []) { send({ type: "delta", text: chunk }); await new Promise((r) => setTimeout(r, 12)); }
        }
        let { clean, ideas } = extractIdeas(full);
        // Weaker models sometimes skip the block — recover idea cards with a structured pass.
        if (!ideas.length && llmLive() && /title|logline|idea|\n\s*(1[.)]|-|\*)/i.test(full) && full.length > 300) {
          send({ type: "status", text: "Shaping idea cards…" });
          try {
            const r = await chatP([{ role: "system", content: 'Extract the story/ad ideas pitched in the text (or, if it is a scene, the idea behind it) into JSON {"ideas":[{"title":string,"logline":string (one sentence),"hook":string,"beats":[string],"characters":[{"name":string,"description":string}]}]}. Fill gaps sensibly from the text. If no ideas were pitched return {"ideas":[]}.' }, { role: "user", content: full.slice(0, 6000) }], { json: true, temperature: 0.1, task: "director" });
            ideas = (parseJson<{ ideas: Idea[] }>(r.text).ideas || []).filter(realIdea).slice(0, 4);
          } catch { /* keep text only */ }
        }
        clean = clean.trim();
        const msg: ChatMsg = { role: "assistant", content: clean, ideas, provider: meta.provider ? `${meta.provider}${meta.model ? ` · ${meta.model}` : ""}` : undefined, at: new Date().toISOString() };
        await db.update(p.id, (x) => { x.brainstorm.push({ role: "user", content: message, at: userAt }, msg); });
        await Promise.race([auto, new Promise((r) => setTimeout(r, 8000))]);
        send({ type: "done", message: msg });
      } catch (e) {
        send({ type: "error", error: (e as Error).message.slice(0, 500) });
      }
      closed = true; ctrl.close();
    },
  });
}
