"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center bg-ink-950 p-6 text-center">
      <div className="max-w-sm">
        <img src="/brand/reel.webp" alt="" className="mx-auto h-16 w-16 rounded-full" />
        <h1 className="mt-5 text-lg font-semibold text-white">Something hiccuped</h1>
        <p className="mt-2 text-sm text-ink-400">Usually a dropped connection. Your projects are safe — any work already started keeps running.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn-outline h-11 px-5" onClick={() => reset()}>Try again</button>
          <button className="btn-brand h-11 px-5" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    </main>
  );
}
