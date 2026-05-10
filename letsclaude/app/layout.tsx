import type { Metadata } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });

export const metadata: Metadata = {
  title: "Let's Claude — Anthropic Platform Training & Consulting",
  description:
    "Enterprise training and consulting for the Anthropic platform. Master Claude Code, Agent SDK, and the Claude API.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${lora.variable} font-sans bg-claude-cream text-claude-dark`}>
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
