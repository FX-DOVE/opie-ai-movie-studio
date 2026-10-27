const buckets = new Map<string, { n: number; t: number }>();
/** true when this key is over `max` hits in the window */
export function limited(key: string, max = 10, windowMs = 15 * 60_000) {
  const a = buckets.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > windowMs) { a.n = 0; a.t = Date.now(); }
  buckets.set(key, a);
  return a.n >= max;
}
export const hit = (key: string) => { const a = buckets.get(key); if (a) a.n++; };
export const reset = (key: string) => buckets.delete(key);
export const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
