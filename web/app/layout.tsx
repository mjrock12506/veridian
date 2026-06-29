import type { Metadata } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { AuthProvider } from "@/components/auth/auth-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Sora — a clean, geometric display typeface for an enterprise-grade headline
// look (replaces the quirkier Space Grotesk that read as "broken" at large sizes).
const display = Sora({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Veridian — Predict and prevent bad orders",
  description:
    "Veridian predicts which e-commerce orders will go wrong — late deliveries, unhappy customers, returns — and tells you what to do before the cost is locked in.",
  metadataBase: new URL("https://veridian.local"),
  openGraph: {
    title: "Veridian — Order Intelligence Platform",
    description:
      "Predict and prevent late deliveries, unhappy customers, and returns before they happen.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${display.variable} ${mono.variable} min-h-screen`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
