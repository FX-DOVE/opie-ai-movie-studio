import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ user: await currentUser() }); }
