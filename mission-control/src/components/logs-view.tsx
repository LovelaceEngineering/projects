"use client";

import { useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Timer,
  Info,
  Filter,
  Search,
} from "lucide-react";

interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  source: string;
  message: string;
}

const logs: LogEntry[] = [
  { id: "1", timestamp: "15:28:12", level: "success", source: "Trading Monitor", message: "Report posted to Discord successfully" },
  { id: "2", timestamp: "15:27:45", level: "info", source: "System", message: "Cron job trading-report triggered" },
  { id: "3", timestamp: "15:15:03", level: "warning", source: "Reddit Watcher", message: "Rate limit approaching (87/100 requests)" },
  { id: "4", timestamp: "14:52:19", level: "error", source: "Data Pipeline v2", message: "Connection timeout to upstream API after 30s" },
  { id: "5", timestamp: "14:52:01", level: "info", source: "Data Pipeline v2", message: "Starting ETL pipeline run #34" },
  { id: "6", timestamp: "14:30:00", level: "success", source: "Daily Digest", message: "WhatsApp digest sent to +31643XXXXX" },
  { id: "7", timestamp: "14:29:55", level: "info", source: "Daily Digest", message: "Compiled 3 stale applications, 5 new listings" },
  { id: "8", timestamp: "13:00:22", level: "success", source: "Bluesky Bot", message: "Engaged with 4 relevant posts" },
  { id: "9", timestamp: "12:58:10", level: "info", source: "Inbox Triage", message: "Processed 12 emails, flagged 2 urgent" },
  { id: "10", timestamp: "12:15:00", level: "success", source: "Trading Monitor", message: "Report posted to Discord successfully" },
];

const levelConfig = {
  info: { icon: Info, color: "text-mc-text-tertiary", bg: "bg-mc-text-tertiary/10" },
  success: { icon: CheckCircle2, color: "text-mc-success", bg: "bg-mc-success/10" },
  warning: { icon: AlertCircle, color: "text-mc-warning", bg: "bg-mc-warning/10" },
  error: { icon: AlertCircle, color: "text-mc-danger", bg: "bg-mc-danger/10" },
};

export function LogsView() {
  const [filter, setFilter] = useState<"all" | "info" | "success" | "warning" | "error">("all");
  const [search, setSearch] = useState("");

  const filtered = logs.filter((log) => {
    if (filter !== "all" && log.level !== filter) return false;
    if (search && !log.message.toLowerCase().includes(search.toLowerCase()) && !log.source.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mc-text-tertiary" />
          <input
            type="text"
            placeholder="Filter logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-mc-border bg-mc-bg py-1.5 pl-9 pr-3 text-sm text-mc-text placeholder:text-mc-text-tertiary focus:border-mc-accent focus:outline-none focus:ring-1 focus:ring-mc-accent/30"
          />
        </div>
        <div className="flex items-center rounded-lg border border-mc-border bg-mc-bg">
          {(["all", "error", "warning", "success", "info"] as const).map((f, i, arr) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-mc-elevated text-mc-text"
                  : "text-mc-text-tertiary hover:text-mc-text-secondary"
              } ${i === 0 ? "rounded-l-lg" : ""} ${i === arr.length - 1 ? "rounded-r-lg" : ""}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <div className="rounded-xl border border-mc-border bg-mc-surface overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-mc-border text-left">
              <th className="px-5 py-3 text-xs font-medium text-mc-text-tertiary w-8"></th>
              <th className="px-5 py-3 text-xs font-medium text-mc-text-tertiary">Time</th>
              <th className="px-5 py-3 text-xs font-medium text-mc-text-tertiary">Source</th>
              <th className="px-5 py-3 text-xs font-medium text-mc-text-tertiary">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mc-border">
            {filtered.map((log) => {
              const config = levelConfig[log.level];
              const Icon = config.icon;
              return (
                <tr
                  key={log.id}
                  className="transition-colors hover:bg-mc-elevated/50"
                >
                  <td className="px-5 py-3">
                    <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-mc-text-tertiary whitespace-nowrap">
                    {log.timestamp}
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-mc-elevated px-2 py-0.5 text-xs font-medium text-mc-text-secondary">
                      {log.source}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-mc-text-secondary">
                    {log.message}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
