/** Session token helpers shared by the Node server and the edge middleware (Web Crypto only). */
import { jwtVerify } from "jose";
export const COOKIE = "rf_session";
export type SessionUser = { id: string; email: string; role: "admin" | "user"; name?: string };
let keyP: Promise<Uint8Array> | null = null;
export function sessionKey(): Promise<Uint8Array> {
  return (keyP ??= (async () => {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("jwt:" + (process.env.APP_SECRET || "opie-dev-insecure-secret")));
    return new TextEncoder().encode([...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join(""));
  })());
}
export async function verifyToken(t: string | undefined): Promise<SessionUser | null> {
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, await sessionKey());
    if (!payload.sub) return null;
    return { id: String(payload.uid || payload.sub), email: String(payload.sub), role: payload.role === "admin" ? "admin" : "user", name: payload.name ? String(payload.name) : undefined };
  } catch { return null; }
}
