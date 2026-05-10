"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopNav } from "@/components/top-nav";
import { Overview } from "@/components/overview";
import { ToolsView } from "@/components/tools-view";
import { AgentsView } from "@/components/agents-view";
import { LogsView } from "@/components/logs-view";
import { SettingsView } from "@/components/settings-view";

export type View = "overview" | "tools" | "agents" | "logs" | "settings";

export default function Home() {
  const [currentView, setCurrentView] = useState<View>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const renderView = () => {
    switch (currentView) {
      case "overview":
        return <Overview onNavigate={setCurrentView} />;
      case "tools":
        return <ToolsView />;
      case "agents":
        return <AgentsView />;
      case "logs":
        return <LogsView />;
      case "settings":
        return <SettingsView />;
      default:
        return <Overview onNavigate={setCurrentView} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-mc-bg">
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav currentView={currentView} />
        <main className="flex-1 overflow-y-auto p-6">{renderView()}</main>
      </div>
    </div>
  );
}
