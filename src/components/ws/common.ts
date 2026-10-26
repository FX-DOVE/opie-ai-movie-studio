import type { Project, Shot, ImageVersion } from "@/lib/types";
export type Act = (action: string, payload?: Record<string, unknown>, opts?: { quiet?: boolean; busyKey?: string }) => Promise<{ ok?: boolean; result?: unknown; error?: string } | null>;
export interface TabProps { p: Project; act: Act; busy: Set<string>; setP: (p: Project) => void; toast: (t: string, err?: boolean) => void; voices: { id: string; label: string }[] }
export const active = (list: ImageVersion[], id?: string) => list.find((v) => v.id === id);
export const shotsOf = (p: Project): Shot[] => p.scenes.flatMap((s) => s.shots);
export const ratio = (a: string) => a.replace(":", " / ");
