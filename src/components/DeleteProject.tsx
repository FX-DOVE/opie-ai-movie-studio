"use client";
import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Modal, Spinner } from "./ui";

/** Confirm dialog for deleting a project and everything it produced. */
export function DeleteProjectDialog({ project, open, onClose, onDeleted }: { project: { id: string; title: string; rendering?: boolean } | null; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!project) return null;
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Delete failed (${r.status})`);
      onDeleted();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Delete project?">
      <div className="space-y-4 text-sm">
        <p>Delete <b>“{project.title}”</b> for good? This removes its script, cast, storyboard, images, clips, voice audio, renders, exports and background jobs — on this server and in cloud storage. It can’t be undone.</p>
        {project.rendering && <p className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-200"><AlertTriangle className="h-4 w-4 shrink-0" />Something is still running on this project — it will be cancelled.</p>}
        <p className="text-ink-400">What Reel has learned about your taste stays in Settings → What Reel has learned.</p>
        {err && <p className="text-red-300">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost h-10" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn h-10 bg-red-500/90 font-medium text-white hover:bg-red-500" disabled={busy} onClick={go}>{busy ? <Spinner /> : <Trash2 className="h-4 w-4" />}Delete project</button>
        </div>
      </div>
    </Modal>
  );
}
