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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">{children}<FloatingAgent /><DesktopWidget /></body>
    </html>
  );
}
