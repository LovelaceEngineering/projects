"use client";

import {
  Bot,
  MoreHorizontal,
  Play,
  Pause,
  Activity,
  Clock,
  CheckCircle2,
  Zap,
} from "lucide-react";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: "running" | "idle" | "scheduled";
  schedule: string;
  lastExecution: string;
  successRate: number;
}

const agents: Agent[] = [
  {
    id: "1",
    name: "Daily Digest Agent",
    description: "Compiles job search updates and sends WhatsApp digest every morning",
    status: "scheduled",
    schedule: "Daily at 08:00",
    lastExecution: "6h ago",
    successRate: 98,
  },
  {
    id: "2",
    name: "Trading Reporter",
    description: "Runs 3Commas and Coinbase analysis, posts to Discord every 3 hours",
    status: "running",
    schedule: "Every 3 hours",
    lastExecution: "12m ago",
    successRate: 95,
  },
  {
    id: "3",
    name: "Reddit Archiver",
    description: "Fetches saved Reddit posts and archives to Obsidian vault",
    status: "scheduled",
    schedule: "Daily at 09:00",
    lastExecution: "1h ago",
    successRate: 100,
  },
  {
    id: "4",
    name: "Bluesky Bot",
    description: "Monitors mentions and engages with relevant Bluesky posts",
    status: "idle",
    schedule: "Every 6 hours",
    lastExecution: "3h ago",
    successRate: 87,
  },
  {
    id: "5",
    name: "Inbox Triage",
    description: "Categorizes incoming emails and flags urgent items",
    status: "running",
    schedule: "Every 30 minutes",
    lastExecution: "5m ago",
    successRate: 92,
  },
];

const statusStyles = {
  running: {
    dot: "bg-mc-success animate-pulse",
    label: "Running",
    text: "text-mc-success",
  },
  idle: {
    dot: "bg-mc-text-tertiary",
    label: "Idle",
    text: "text-mc-text-tertiary",
  },
  scheduled: {
    dot: "bg-mc-accent",
    label: "Scheduled",
    text: "text-mc-accent",
  },
};

export function AgentsView() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      {/* Agent list */}
      <div className="rounded-xl border border-mc-border bg-mc-surface">
        <div className="flex items-center justify-between border-b border-mc-border px-5 py-4">
          <h2 className="text-sm font-semibold text-mc-text">Active Agents</h2>
          <span className="text-xs text-mc-text-tertiary">
            {agents.filter((a) => a.status === "running").length} running
          </span>
        </div>
        <div className="divide-y divide-mc-border">
          {agents.map((agent) => {
            const style = statusStyles[agent.status];
            return (
              <div
                key={agent.id}
                className="group flex items-center gap-5 px-5 py-4 transition-colors hover:bg-mc-elevated/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-mc-accent-subtle">
                  <Bot className="h-5 w-5 text-mc-accent" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-mc-text">
                      {agent.name}
                    </h3>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                      <span className={style.text}>{style.label}</span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-mc-text-tertiary truncate">
                    {agent.description}
                  </p>
                </div>

                <div className="hidden shrink-0 items-center gap-6 text-xs text-mc-text-tertiary sm:flex">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    {agent.schedule}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3" />
                    {agent.lastExecution}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" />
                    {agent.successRate}%
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button className="rounded p-1.5 text-mc-text-tertiary transition-colors hover:bg-mc-elevated hover:text-mc-text-secondary">
                    {agent.status === "running" ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button className="rounded p-1.5 text-mc-text-tertiary opacity-0 transition-all hover:bg-mc-elevated hover:text-mc-text-secondary group-hover:opacity-100">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-mc-border bg-mc-surface p-5">
          <div className="flex items-center gap-2 text-mc-text-tertiary">
            <Zap className="h-4 w-4" />
            <span className="text-xs font-medium">Total Executions</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-mc-text">3,847</p>
          <p className="mt-1 text-xs text-mc-text-tertiary">Last 30 days</p>
        </div>
        <div className="rounded-xl border border-mc-border bg-mc-surface p-5">
          <div className="flex items-center gap-2 text-mc-text-tertiary">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs font-medium">Success Rate</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-mc-success">96.2%</p>
          <p className="mt-1 text-xs text-mc-text-tertiary">Avg across all agents</p>
        </div>
        <div className="rounded-xl border border-mc-border bg-mc-surface p-5">
          <div className="flex items-center gap-2 text-mc-text-tertiary">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium">Avg Duration</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-mc-text">4.2s</p>
          <p className="mt-1 text-xs text-mc-text-tertiary">Per execution</p>
        </div>
      </div>
    </div>
  );
}
