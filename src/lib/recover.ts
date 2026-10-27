import { db } from "./db";
import { recoverJobs } from "./jobs";
import "./actions"; // registers the job runner
import * as R from "./render";
import * as S from "./studio";
import { assignVoices, clearLinesFor } from "./voices";

type Out = { jobs: { resumed: string[]; interrupted: string[] }; renders: string[]; clips: number; reviews: number };
const g = globalThis as unknown as { __rfRecovered?: Promise<Out> };

/** Resume everything a restart interrupted: durable action jobs, renders, the video clip queue and automatic reviews. Runs once per process. */
export function recoverNow(): Promise<Out> {
  return (g.__rfRecovered ??= (async () => {
    // one-time: character voices now come from the bible's gender/age (earlier projects all defaulted to one voice)
    if (!db.getSetting("migr_voices_v2")) {
      for (const p of db.listProjects()) await db.update(p.id, (x) => { clearLinesFor(x, assignVoices(x)); }).catch(() => {});
      await db.setSetting("migr_voices_v2", new Date().toISOString());
    }
    const jobs = recoverJobs();
    const renders: string[] = []; let clips = 0, reviews = 0;
    for (const p of db.listProjects()) {
      if (["queued", "running"].includes(p.render.status)) {
        renders.push(p.id);
        await db.update(p.id, (x) => { x.render = { ...x.render, status: "queued", message: "Resuming after a server restart", attempts: (x.render.attempts || 0) + 1, updatedAt: new Date().toISOString() }; });
        if ((p.render.attempts || 0) < 3) void R.renderProject(p.id);
        else await db.update(p.id, (x) => { x.render = { ...x.render, status: "error", message: "Render was interrupted repeatedly — tap Render to try again." }; });
      }
      const shots = p.scenes.flatMap((s) => s.shots);
      const pending = shots.filter((s) => s.clipJob && ["queued", "running"].includes(s.clipJob.state)).map((s) => s.id);
      if (pending.length) { clips += pending.length; await R.queueClips(p.id, pending); }
      const stuck = shots.filter((s) => s.continuity?.state === "checking" || s.continuity?.state === "fixing").map((s) => s.id);
      if (stuck.length) { reviews += stuck.length; void S.autoContinuity(p.id, stuck).catch(() => {}); }
      for (const a of p.assets.filter((a) => a.refState === "checking" || a.refState === "fixing")) { reviews++; void S.reviewReference(p.id, a.id).catch(() => {}); }
      if (p.writing) await db.update(p.id, (x) => { x.writing = undefined; }); // the writeScript job (if any) was resumed above and sets it again
    }
    const out = { jobs, renders, clips, reviews };
    console.log("[recover]", JSON.stringify(out));
    return out;
  })());
}
// any API route that imports this module triggers recovery on first use (instrumentation also pings /api/recover at boot)
void Promise.resolve().then(() => recoverNow()).catch((e) => console.error("[recover]", e));
