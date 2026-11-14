import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

export const metadata: Metadata = {
  title: "Sarkari Saathi — Your Personal AI Government Services Assistant",
  description:
    "A privacy-first AI assistant for Indian government paperwork. File RTIs, apply for schemes, fill forms, and find official information — all with sovereign PII protection.",
  applicationName: "Sarkari Saathi",
  authors: [{ name: "Sarkari Saathi" }],
  keywords: ["government services", "RTI", "schemes", "forms", "privacy", "AI assistant", "India"],
};

export const viewport: Viewport = {
  themeColor: "#0B1D3A",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="font-sans bg-white text-slate-900 antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
