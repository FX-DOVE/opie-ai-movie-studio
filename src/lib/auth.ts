import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { db } from "./db";
import { COOKIE, sessionKey, verifyToken, type SessionUser } from "./session";
export type { SessionUser };

export const ADMIN_ID = "admin";
let hashCache: string | null = null;
function adminHash() {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  if (!hashCache) hashCache = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "change-me-now", 10);
  return hashCache;
}
const adminEmail = () => (process.env.ADMIN_EMAIL || "admin@opie.local").toLowerCase();

/** Email + password → user (the env-configured admin, or a registered creator). */
export async function checkCredentials(email: string, password: string): Promise<SessionUser | null> {
  const e = email.trim().toLowerCase();
  if (!e || !password) return null;
  if (e === adminEmail()) return (await bcrypt.compare(password, adminHash())) ? { id: ADMIN_ID, email: e, role: "admin" } : null;
  const u = db.findUserByEmail(e);
  if (!u || !(await bcrypt.compare(password, u.hash))) return null;
  return { id: u.id, email: u.email, role: u.role === "admin" ? "admin" : "user", name: u.name };
}
export async function signUp(email: string, password: string, name?: string): Promise<SessionUser> {
  const e = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Enter a valid email address.");
  if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
  if (e === adminEmail() || db.findUserByEmail(e)) throw new Error("An account with this email already exists — sign in instead.");
  const u = { id: "u_" + nanoid(10), email: e, name: (name || "").trim().slice(0, 60) || undefined, hash: await bcrypt.hash(password, 10), role: "user" as const, createdAt: new Date().toISOString() };
  await db.saveUser(u);
  return { id: u.id, email: u.email, role: "user", name: u.name };
}
export async function createSession(u: SessionUser | string) {
  const user: SessionUser = typeof u === "string" ? { id: ADMIN_ID, email: u, role: "admin" } : u;
  const days = user.role === "admin" ? 1 : 30;
  const token = await new SignJWT({ sub: user.email, uid: user.id, role: user.role, name: user.name }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${days}d`).sign(await sessionKey());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * days });
}
export async function clearSession() { const c = await cookies(); c.delete(COOKIE); c.delete("opie_admin"); }
export async function currentUser(): Promise<SessionUser | null> { return verifyToken((await cookies()).get(COOKIE)?.value); }
export async function isAdmin() { return (await currentUser())?.role === "admin"; }
