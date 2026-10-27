/** On server boot, resume background work interrupted by a restart (renders, clip queue, durable jobs). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const port = process.env.PORT || 3000;
  const ping = async (n: number): Promise<void> => {
    try { await fetch(`http://127.0.0.1:${port}/api/recover`, { method: "POST" }); }
    catch { if (n < 20) { await new Promise((r) => setTimeout(r, 1500)); return ping(n + 1); } }
  };
  setTimeout(() => void ping(0), 2000);
}
