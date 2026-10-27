import { FloatingAgent } from "@/components/AgentChat";
import { DesktopWidget } from "@/components/DesktopWidget";
import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display-face" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: { default: "ReelForge Studio — idea to finished film", template: "%s · ReelForge Studio" },
  description: "ReelForge Studio is an AI film studio: brainstorm, script, cast, storyboard, keep continuity, voice and cut — in one place.",
  applicationName: "ReelForge Studio",
  openGraph: { title: "ReelForge Studio", description: "Idea to finished film in one AI studio.", images: ["/brand/still-lagos.webp"] },
};
export const viewport: Viewport = { themeColor: "#0a0a0b", width: "device-width", initialScale: 1, maximumScale: 1, interactiveWidget: "resizes-content", viewportFit: "cover" };

// Runs before any app code: tag same-origin fetch/XHR so the tunnel never swaps a response for its HTML warning
// page, and install the service worker that does the same for scripts, images and navigations.
const TUNNEL = `(function(){try{var H="X-Pinggy-No-Screen",o=location.origin,f=window.fetch;
window.fetch=function(i,n){try{var u=typeof i==="string"?i:i instanceof URL?i.href:i.url;var U=new URL(u,location.href);if(U.origin===o){n=Object.assign({},n||{});var h=new Headers(n.headers||(i instanceof Request?i.headers:undefined));h.set(H,"1");n.headers=h;var P=U.pathname,api=P.indexOf("/api/")===0&&P.indexOf("/api/auth")!==0&&P.indexOf("/api/admin")!==0&&P.indexOf("/api/status")!==0}}catch(e){}
return f.call(this,i,n).then(function(r){try{if(api&&r.status===401&&location.pathname.indexOf("/login")!==0&&location.pathname.indexOf("/admin")!==0&&location.pathname!=="/"){location.href="/login?next="+encodeURIComponent(location.pathname+location.search)}}catch(e){}return r})};
var op=XMLHttpRequest.prototype.open,sd=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this.__rf=new URL(u,location.href).origin===o;return op.apply(this,arguments)};
XMLHttpRequest.prototype.send=function(){try{if(this.__rf)this.setRequestHeader(H,"1")}catch(e){}return sd.apply(this,arguments)};
if("serviceWorker"in navigator&&location.protocol==="https:")navigator.serviceWorker.register("/sw.js").catch(function(){})}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: TUNNEL }} /></head>
      <body className="min-h-dvh font-sans">{children}<FloatingAgent /><DesktopWidget /></body>
    </html>
  );
}
