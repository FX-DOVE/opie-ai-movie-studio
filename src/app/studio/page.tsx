import { redirect } from "next/navigation";
/** The projects list moved to /dashboard; keep old links (and ?new=1) working. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams(Object.entries(await searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v == null ? [] : [[k, v]])));
  redirect(`/dashboard${q.size ? `?${q}` : ""}`);
}
