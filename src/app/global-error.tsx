"use client";
export default function GlobalError() {
  return (
    <html lang="en"><body style={{ margin: 0, background: "#0a0a0b", color: "#ededea", fontFamily: "system-ui, sans-serif" }}>
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div style={{ maxWidth: 340 }}>
          <h1 style={{ fontSize: 18 }}>ReelForge needs a reload</h1>
          <p style={{ fontSize: 14, color: "#8b8b90" }}>The connection dropped while the app was loading. Your work is safe.</p>
          <button onClick={() => location.reload()} style={{ marginTop: 16, height: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#e9a83c", color: "#0a0a0b", fontWeight: 600, fontSize: 16 }}>Reload</button>
        </div>
      </main>
    </body></html>
  );
}
