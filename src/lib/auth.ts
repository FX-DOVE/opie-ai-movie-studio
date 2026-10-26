import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "opie_admin";
function secret() {
  return new TextEncoder().encode(crypto.createHash("sha256").update("jwt:" + (process.env.APP_SECRET || "opie-dev-insecure-secret")).digest("hex"));
}
let hashCache: string | null = null;
function adminHash() {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  if (!hashCache) hashCache = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "change-me-now", 10);
  return hashCache;
}
export async function checkCredentials(email: string, password: string) {
  const want = (process.env.ADMIN_EMAIL || "admin@opie.local").toLowerCase();
  const okEmail = email.trim().toLowerCase() === want;
  const okPw = await bcrypt.compare(password, adminHash());
  return okEmail && okPw;
}
export async function createSession(email: string) {
  const token = await new SignJWT({ sub: email, role: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 60 * 60 * 12 });
}
export async function clearSession() { (await cookies()).delete(COOKIE); }
export async function isAdmin() {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return false;
  try { await jwtVerify(t, secret()); return true; } catch { return false; }
}
