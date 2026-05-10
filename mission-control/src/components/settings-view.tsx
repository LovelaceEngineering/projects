"use client";

import { useState } from "react";
import { Save, Globe, Bell, Shield, Database, Palette } from "lucide-react";

function SettingSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Globe;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-mc-border bg-mc-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mc-accent-subtle">
          <Icon className="h-4 w-4 text-mc-accent" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-mc-text">{title}</h3>
          <p className="mt-1 text-xs text-mc-text-tertiary">{description}</p>
          <div className="mt-5 space-y-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ToggleSetting({
  label,
  description,
  defaultOn = false,
}: {
  label: string;
  description: string;
  defaultOn?: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultOn);

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-mc-text">{label}</p>
        <p className="text-xs text-mc-text-tertiary">{description}</p>
      </div>
      <button
        onClick={() => setEnabled(!enabled)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          enabled ? "bg-mc-accent" : "bg-mc-border"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function InputSetting({
  label,
  placeholder,
  defaultValue = "",
}: {
  label: string;
  placeholder: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="text-sm text-mc-text">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="mt-1.5 w-full rounded-lg border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text placeholder:text-mc-text-tertiary focus:border-mc-accent focus:outline-none focus:ring-1 focus:ring-mc-accent/30"
      />
    </div>
  );
}

export function SettingsView() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 animate-fade-in">
      <SettingSection
        title="General"
        description="Basic configuration for your Mission Control instance"
        icon={Globe}
      >
        <InputSetting label="Instance Name" placeholder="Mission Control" defaultValue="Mission Control" />
        <InputSetting label="Webhook URL" placeholder="https://your-webhook.endpoint/api" />
      </SettingSection>

      <SettingSection
        title="Notifications"
        description="Configure how and when you receive alerts"
        icon={Bell}
      >
        <ToggleSetting label="Discord notifications" description="Post alerts to your Discord channel" defaultOn />
        <ToggleSetting label="WhatsApp digest" description="Send daily summary via WhatsApp" defaultOn />
        <ToggleSetting label="Email alerts" description="Receive critical alerts via email" />
      </SettingSection>

      <SettingSection
        title="Security"
        description="Access control and authentication settings"
        icon={Shield}
      >
        <ToggleSetting label="API key required" description="Require authentication for all API endpoints" defaultOn />
        <ToggleSetting label="Rate limiting" description="Limit requests to prevent abuse" defaultOn />
        <InputSetting label="Allowed origins" placeholder="https://yourdomain.com" />
      </SettingSection>

      <SettingSection
        title="Data"
        description="Storage and retention policies"
        icon={Database}
      >
        <ToggleSetting label="Log retention" description="Automatically clean logs older than 30 days" defaultOn />
        <ToggleSetting label="Execution history" description="Store detailed execution traces" defaultOn />
      </SettingSection>

      <div className="flex justify-end">
        <button className="flex items-center gap-2 rounded-lg bg-mc-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-mc-accent-hover">
          <Save className="h-4 w-4" />
          Save Changes
        </button>
      </div>
    </div>
  );
}
