import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
        {children}
      </body>
    </html>
  );
}
