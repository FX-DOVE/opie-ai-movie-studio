// Used by the reverse proxy (forward_auth) to gate the live desktop WebSocket.
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() { return (await currentUser()) ? new Response("ok") : new Response("unauthorized", { status: 401 }); }
