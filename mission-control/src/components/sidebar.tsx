"use client";

import { clsx } from "clsx";
import {
  LayoutDashboard,
  Wrench,
  Bot,
  ScrollText,
  Settings,
  ChevronLeft,
  Zap,
} from "lucide-react";
import type { View } from "@/app/page";

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({
  currentView,
  onNavigate,
  collapsed,
  onToggle,
}: SidebarProps) {
  return (
    <aside
      className={clsx(
        "flex flex-col border-r border-mc-border bg-mc-surface transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-3 border-b border-mc-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mc-accent-subtle">
          <Zap className="h-4 w-4 text-mc-accent" />
        </div>
        {!collapsed && (
          <div className="flex flex-col animate-fade-in">
            <span className="text-sm font-semibold text-mc-text">
              Mission Control
            </span>
            <span className="text-2xs text-mc-text-tertiary">Operator</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={clsx(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              currentView === id
                ? "bg-mc-accent-subtle text-mc-accent"
                : "text-mc-text-secondary hover:bg-mc-elevated hover:text-mc-text"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <span className="animate-slide-in">{label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-mc-border p-3">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-lg p-2 text-mc-text-tertiary transition-colors hover:bg-mc-elevated hover:text-mc-text-secondary"
        >
          <ChevronLeft
            className={clsx(
              "h-4 w-4 transition-transform duration-200",
              collapsed && "rotate-180"
            )}
          />
        </button>
      </div>
    </aside>
  );
}
