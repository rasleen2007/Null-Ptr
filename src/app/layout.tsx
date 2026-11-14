import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: "JARVIS — Personal AI Harness",
  description:
    "A modular, local-first personal AI operating system with multi-provider routing, persistent memory, tool execution, and explicit permissions.",
  applicationName: "JARVIS",
  authors: [{ name: "JARVIS AI Harness" }],
  keywords: ["AI harness", "agents", "Gemini", "Groq", "Ollama", "Next.js"],
};

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
