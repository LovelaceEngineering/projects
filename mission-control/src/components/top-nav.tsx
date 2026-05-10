"use client";

import { Search, Bell, Plus, Command } from "lucide-react";
import type { View } from "@/app/page";

const viewTitles: Record<View, string> = {
  overview: "Overview",
  tools: "Tools",
  agents: "Agents",
  logs: "Activity Log",
  settings: "Settings",
};

interface TopNavProps {
  currentView: View;
}

export function TopNav({ currentView }: TopNavProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-mc-border bg-mc-surface px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold text-mc-text">
          {viewTitles[currentView]}
        </h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Search */}
        <button className="flex items-center gap-2 rounded-lg border border-mc-border bg-mc-bg px-3 py-1.5 text-sm text-mc-text-tertiary transition-colors hover:border-mc-border-hover hover:text-mc-text-secondary">
          <Search className="h-3.5 w-3.5" />
          <span>Search...</span>
          <kbd className="ml-4 flex items-center gap-0.5 rounded border border-mc-border px-1.5 py-0.5 text-2xs font-medium text-mc-text-tertiary">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* Create new */}
        <button className="flex items-center gap-1.5 rounded-lg bg-mc-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-mc-accent-hover">
          <Plus className="h-3.5 w-3.5" />
          <span>New Tool</span>
        </button>

        {/* Notifications */}
        <button className="relative rounded-lg p-2 text-mc-text-tertiary transition-colors hover:bg-mc-elevated hover:text-mc-text-secondary">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-mc-accent" />
        </button>
      </div>
    </header>
  );
}
