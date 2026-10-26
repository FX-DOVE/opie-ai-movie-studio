import { FloatingAgent } from "@/components/AgentChat";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face" });

export const metadata: Metadata = {
  title: "Opie — AI Movie Studio powered by Meta Muse",
  description: "From idea to finished film: script, cast, storyboard, continuity, voice and edit — directed by Meta's Muse models.",
};
export const viewport: Viewport = { themeColor: "#07070a", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">{children}<FloatingAgent /></body>
    </html>
  );
}
