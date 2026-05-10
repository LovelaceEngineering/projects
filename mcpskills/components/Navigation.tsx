"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X, Zap } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { AuthButton } from "./AuthButton";

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "/servers", label: "MCP Servers" },
    { href: "/skills", label: "Skills" },
    { href: "/collections", label: "Collections" },
    { href: "/blog", label: "Blog" },
    { href: "/security", label: "Security" },
  ];
  return (
    <nav className="sticky top-0 z-50 border-b border-card-border bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <span className="bg-brand-600 text-white rounded-lg p-1">
              <Zap size={18} />
            </span>
            <span className="gradient-text">MCPSkills</span>
          </Link>
          <div className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <ThemeToggle />
            <AuthButton />
            <Link
              href="/submit"
              className="bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              + Submit
            </Link>
          </div>
          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              className="text-muted hover:text-foreground transition-colors"
              onClick={() => setOpen(!open)}
              aria-label="Toggle menu"
            >
              {open ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-card-border bg-background px-4 py-4 flex flex-col gap-3">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted hover:text-foreground transition-colors"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/submit"
            className="bg-brand-600 text-white text-sm px-4 py-2 rounded-lg text-center"
            onClick={() => setOpen(false)}
          >
            + Submit
          </Link>
        </div>
      )}
    </nav>
  );
}
