"use client";

import {
  Activity,
  Wrench,
  Bot,
  Clock,
  TrendingUp,
  Zap,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Timer,
} from "lucide-react";
import type { View } from "@/app/page";

function StatCard({
  label,
  value,
  change,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  change?: string;
  icon: typeof Activity;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="group rounded-xl border border-mc-border bg-mc-surface p-5 transition-all hover:border-mc-border-hover">
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mc-accent-subtle">
          <Icon className="h-4 w-4 text-mc-accent" />
        </div>
        {change && (
          <span
            className={`flex items-center gap-0.5 text-xs font-medium ${
              trend === "up"
                ? "text-mc-success"
                : trend === "down"
                ? "text-mc-danger"
                : "text-mc-text-tertiary"
            }`}
          >
            {change}
            {trend === "up" && <TrendingUp className="h-3 w-3" />}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-2xl font-semibold text-mc-text">{value}</p>
        <p className="mt-1 text-sm text-mc-text-tertiary">{label}</p>
      </div>
    </div>
  );
}

const recentActivity = [
  {
    id: 1,
    action: "Tool deployed",
    target: "Weather Monitor",
    time: "2m ago",
    status: "success" as const,
  },
  {
    id: 2,
    action: "Agent triggered",
    target: "Daily Digest",
    time: "15m ago",
    status: "success" as const,
  },
  {
    id: 3,
    action: "Build failed",
    target: "Data Pipeline v2",
    time: "1h ago",
    status: "error" as const,
  },
  {
    id: 4,
    action: "Tool updated",
    target: "Trading Report",
    time: "3h ago",
    status: "success" as const,
  },
  {
    id: 5,
    action: "Agent scheduled",
    target: "Inbox Triage",
    time: "5h ago",
    status: "pending" as const,
  },
];

const statusIcon = {
  success: CheckCircle2,
  error: AlertCircle,
  pending: Timer,
};

const statusColor = {
  success: "text-mc-success",
  error: "text-mc-danger",
  pending: "text-mc-warning",
};

interface OverviewProps {
  onNavigate: (view: View) => void;
}

export function Overview({ onNavigate }: OverviewProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Tools"
          value="12"
          change="+3 this week"
          icon={Wrench}
          trend="up"
        />
        <StatCard
          label="Running Agents"
          value="4"
          change="2 scheduled"
          icon={Bot}
          trend="neutral"
        />
        <StatCard
          label="Executions Today"
          value="847"
          change="+12%"
          icon={Zap}
          trend="up"
        />
        <StatCard
          label="Avg Response"
          value="1.2s"
          change="-0.3s"
          icon={Clock}
          trend="up"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div className="col-span-2 rounded-xl border border-mc-border bg-mc-surface">
          <div className="flex items-center justify-between border-b border-mc-border px-5 py-4">
            <h2 className="text-sm font-semibold text-mc-text">
              Recent Activity
            </h2>
            <button
              onClick={() => onNavigate("logs")}
              className="flex items-center gap-1 text-xs text-mc-text-tertiary transition-colors hover:text-mc-accent"
            >
              View all
              <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
          <div className="divide-y divide-mc-border">
            {recentActivity.map((item) => {
              const StatusIcon = statusIcon[item.status];
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-mc-elevated/50"
                >
                  <StatusIcon
                    className={`h-4 w-4 shrink-0 ${statusColor[item.status]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-mc-text">
                      {item.action}{" "}
                      <span className="font-medium text-mc-accent">
                        {item.target}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-mc-text-tertiary">
                    {item.time}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-mc-border bg-mc-surface">
          <div className="border-b border-mc-border px-5 py-4">
            <h2 className="text-sm font-semibold text-mc-text">
              Quick Actions
            </h2>
          </div>
          <div className="space-y-2 p-4">
            {[
              { label: "Create New Tool", icon: Wrench, view: "tools" as View },
              { label: "Deploy Agent", icon: Bot, view: "agents" as View },
              {
                label: "View System Logs",
                icon: Activity,
                view: "logs" as View,
              },
              {
                label: "Configure Settings",
                icon: Clock,
                view: "settings" as View,
              },
            ].map(({ label, icon: Icon, view }) => (
              <button
                key={label}
                onClick={() => onNavigate(view)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-mc-text-secondary transition-colors hover:bg-mc-elevated hover:text-mc-text"
              >
                <Icon className="h-4 w-4 text-mc-text-tertiary" />
                {label}
                <ArrowUpRight className="ml-auto h-3 w-3 text-mc-text-tertiary" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* System status bar */}
      <div className="flex items-center gap-6 rounded-xl border border-mc-border bg-mc-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-mc-success animate-pulse" />
          <span className="text-xs font-medium text-mc-text-secondary">
            All systems operational
          </span>
        </div>
        <div className="h-4 w-px bg-mc-border" />
        <span className="text-xs text-mc-text-tertiary">
          Last deploy: 2m ago
        </span>
        <div className="h-4 w-px bg-mc-border" />
        <span className="text-xs text-mc-text-tertiary">
          Uptime: 99.97%
        </span>
      </div>
    </div>
  );
}
