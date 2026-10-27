import { NextResponse } from "next/server";
import { currentUser, type SessionUser } from "./auth";
import { db } from "./db";
import type { Project } from "./types";

export const unauthorized = () => NextResponse.json({ error: "Please sign in." }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "You don't have access to this project." }, { status: 403 });
export const canAccess = (u: SessionUser, p: Pick<Project, "ownerId">) => u.role === "admin" || p.ownerId === u.id;

/** Signed-in user, or a 401 response. */
export async function requireUser(): Promise<SessionUser | Response> { return (await currentUser()) || unauthorized(); }
/** Signed-in owner (or admin) of the project, or a 401/403/404 response. */
export async function requireProject(id: string): Promise<{ user: SessionUser; p: Project } | Response> {
  const user = await currentUser(); if (!user) return unauthorized();
  const p = db.getProject(id); if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canAccess(user, p)) return forbidden();
  return { user, p };
}
