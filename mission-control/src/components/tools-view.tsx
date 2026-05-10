"use client";

import { useState } from "react";
import {
  Wrench,
  Play,
  Pause,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

interface Tool {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "error";
  lastRun: string;
  executions: number;
  category: string;
}

const tools: Tool[] = [
  {
    id: "1",
    name: "Trading Monitor",
    description: "3-hour automated trading reports to Discord",
    status: "active",
    lastRun: "12m ago",
    executions: 2847,
    category: "Automation",
  },
  {
    id: "2",
    name: "Daily Digest",
    description: "Job search updates via WhatsApp",
    status: "active",
    lastRun: "6h ago",
    executions: 89,
    category: "Notifications",
  },
  {
    id: "3",
    name: "Reddit Watcher",
    description: "Track and archive saved Reddit posts",
    status: "active",
    lastRun: "1h ago",
    executions: 412,
    category: "Automation",
  },
  {
    id: "4",
    name: "Weather Alert",
    description: "Location-based weather notifications",
    status: "paused",
    lastRun: "2d ago",
    executions: 156,
    category: "Notifications",
  },
  {
    id: "5",
    name: "Data Pipeline v2",
    description: "ETL pipeline for analytics data",
    status: "error",
    lastRun: "1h ago",
    executions: 34,
    category: "Data",
  },
  {
    id: "6",
    name: "Bluesky Engagement",
    description: "Automated reply engagement on Bluesky",
    status: "active",
    lastRun: "3h ago",
    executions: 267,
    category: "Social",
  },
];

const statusConfig = {
  active: {
    icon: CheckCircle2,
    color: "text-mc-success",
    bg: "bg-mc-success/10",
    label: "Active",
  },
  paused: {
    icon: Clock,
    color: "text-mc-warning",
    bg: "bg-mc-warning/10",
    label: "Paused",
  },
  error: {
    icon: AlertCircle,
    color: "text-mc-danger",
    bg: "bg-mc-danger/10",
    label: "Error",
  },
};

export function ToolsView() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "error">(
    "all"
  );

  const filtered = tools.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mc-text-tertiary" />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-mc-border bg-mc-bg py-1.5 pl-9 pr-3 text-sm text-mc-text placeholder:text-mc-text-tertiary focus:border-mc-accent focus:outline-none focus:ring-1 focus:ring-mc-accent/30"
            />
          </div>
          <div className="flex items-center rounded-lg border border-mc-border bg-mc-bg">
            {(["all", "active", "paused", "error"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? "bg-mc-elevated text-mc-text"
                    : "text-mc-text-tertiary hover:text-mc-text-secondary"
                } ${f === "all" ? "rounded-l-lg" : ""} ${
                  f === "error" ? "rounded-r-lg" : ""
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <button className="flex items-center gap-1.5 rounded-lg bg-mc-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-mc-accent-hover">
          <Plus className="h-3.5 w-3.5" />
          New Tool
        </button>
      </div>

      {/* Tools grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tool) => {
          const status = statusConfig[tool.status];
          const StatusIcon = status.icon;
          return (
            <div
              key={tool.id}
              className="group rounded-xl border border-mc-border bg-mc-surface p-5 transition-all hover:border-mc-border-hover"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mc-accent-subtle">
                    <Wrench className="h-4 w-4 text-mc-accent" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-mc-text">
                      {tool.name}
                    </h3>
                    <span className="text-2xs text-mc-text-tertiary">
                      {tool.category}
                    </span>
                  </div>
                </div>
                <button className="rounded p-1 text-mc-text-tertiary opacity-0 transition-all hover:bg-mc-elevated hover:text-mc-text-secondary group-hover:opacity-100">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-sm text-mc-text-secondary">
                {tool.description}
              </p>

              <div className="mt-4 flex items-center justify-between">
                <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${status.bg} ${status.color}`}>
                  <StatusIcon className="h-3 w-3" />
                  {status.label}
                </div>
                <div className="flex items-center gap-3 text-xs text-mc-text-tertiary">
                  <span>{tool.executions.toLocaleString()} runs</span>
                  <span>{tool.lastRun}</span>
                </div>
              </div>

              <div className="mt-4 flex gap-2 border-t border-mc-border pt-4">
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-mc-border py-1.5 text-xs font-medium text-mc-text-secondary transition-colors hover:bg-mc-elevated hover:text-mc-text">
                  {tool.status === "active" ? (
                    <>
                      <Pause className="h-3 w-3" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" /> Start
                    </>
                  )}
                </button>
                <button className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-mc-border py-1.5 text-xs font-medium text-mc-text-secondary transition-colors hover:bg-mc-elevated hover:text-mc-text">
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
