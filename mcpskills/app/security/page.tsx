import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Search, GitBranch, Package, FileCode, Globe, Eye, UserCheck, AlertTriangle, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Security & Trust — MCPSkills",
  description: "Every MCP server and OpenClaw Skill listed on MCPSkills is scanned for security vulnerabilities, malware, and phishing before publication.",
};

const checks = [
  {
    icon: <FileCode size={20} />,
    name: "Open Source Requirement",
    desc: "We only list open-source projects with publicly accessible source code. You — and we — can read every line before you install anything.",
  },
  {
    icon: <Eye size={20} />,
    name: "No Credential Harvesting",
    desc: "We perform static analysis scanning for patterns that collect, log, or transmit API keys, tokens, passwords, or other credentials without explicit user consent.",
  },
  {
    icon: <Globe size={20} />,
    name: "Network Call Audit",
    desc: "We verify that all outbound network calls go to declared, expected endpoints. Servers that phone home to undeclared hosts are rejected.",
  },
  {
    icon: <AlertTriangle size={20} />,
    name: "No Arbitrary Code Execution",
    desc: "We check for patterns that download and execute untrusted binaries, use eval() on external data, or spawn uncontrolled sub-processes.",
  },
  {
    icon: <Package size={20} />,
    name: "Dependency Vulnerability Scan",
    desc: "Direct and transitive dependencies are scanned against the National Vulnerability Database (NVD) and GitHub Advisory Database for known CVEs.",
  },
  {
    icon: <GitBranch size={20} />,
    name: "License Verification",
    desc: "Only OSI-approved licenses are accepted (MIT, Apache 2.0, BSD, MPL, etc.). Proprietary or non-standard licenses are flagged for manual review.",
  },
  {
    icon: <Search size={20} />,
    name: "Phishing & Impersonation Detection",
    desc: "We check for names, descriptions, or install commands that impersonate legitimate tools, popular brands, or the official Anthropic MCP servers.",
  },
  {
    icon: <UserCheck size={20} />,
    name: "Publisher Verification",
    desc: "We review the submitter's GitHub account history, activity, and reputation. Anonymous accounts with no track record are subject to enhanced manual review.",
  },
];

export default function SecurityPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      {/* Hero */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 mb-6">
          <ShieldCheck size={32} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Every listing is security scanned</h1>
        <p className="text-muted text-lg leading-relaxed max-w-2xl mx-auto">
          MCP servers run inside your AI assistant with access to your files, APIs, and data.
          That&apos;s a high-trust position. We take it seriously.
        </p>
      </div>

      {/* Trust banner */}
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-6 mb-10 flex items-start gap-4">
        <ShieldCheck size={24} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-emerald-900 dark:text-emerald-300 mb-1">
            No listing goes live without a security review
          </h2>
          <p className="text-sm text-emerald-800 dark:text-emerald-400 leading-relaxed">
            Every MCP server and OpenClaw Skill submitted to MCPSkills undergoes automated scanning
            followed by a manual review before it appears in the directory. Listings that fail any
            check are rejected or quarantined pending remediation.
          </p>
        </div>
      </div>

      {/* What we check */}
      <h2 className="text-xl font-bold mb-6">What we check</h2>
      <div className="space-y-4 mb-12">
        {checks.map((check) => (
          <div key={check.name} className="flex gap-4 bg-card border border-card-border rounded-xl p-5">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
              {check.icon}
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">{check.name}</h3>
              <p className="text-muted text-sm leading-relaxed">{check.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Scoring */}
      <div className="bg-card border border-card-border rounded-xl p-6 mb-10">
        <h2 className="font-semibold text-foreground mb-3">Security score</h2>
        <p className="text-muted text-sm leading-relaxed mb-4">
          Each listing receives a score from 0–100 based on the results of the 8 checks above,
          weighted by severity. A score of 90+ indicates a clean, well-maintained listing from a
          verified publisher. Scores below 70 are not published.
        </p>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          {[
            { range: "90–100", label: "Excellent", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50" },
            { range: "70–89",  label: "Good",      color: "text-brand-600 dark:text-brand-400",    bg: "bg-brand-50 dark:bg-brand-900/30 border-brand-200 dark:border-brand-800/50" },
            { range: "< 70",   label: "Rejected",  color: "text-red-600 dark:text-red-400",        bg: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50" },
          ].map((tier) => (
            <div key={tier.range} className={`border rounded-xl py-3 px-2 ${tier.bg}`}>
              <div className={`text-lg font-bold ${tier.color}`}>{tier.range}</div>
              <div className="text-xs text-muted mt-0.5">{tier.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Rescan & report */}
      <div className="bg-card border border-card-border rounded-xl p-6 mb-10">
        <h2 className="font-semibold text-foreground mb-2">Re-scanning & continuous monitoring</h2>
        <p className="text-muted text-sm leading-relaxed">
          Listings are re-scanned automatically when a new version is published on GitHub.
          We also run weekly re-scans of all active listings against updated CVE databases.
          If a listing is updated after publication and introduces a violation, it is suspended
          immediately until reviewed.
        </p>
      </div>

      {/* Report an issue */}
      <div className="border border-card-border rounded-xl p-6">
        <h2 className="font-semibold text-foreground mb-2">Found something suspicious?</h2>
        <p className="text-muted text-sm leading-relaxed mb-4">
          If you believe a listed server or skill is malicious, phishing, or violates our security
          policy — please report it. We investigate all reports within 24 hours and will remove
          the listing while under review.
        </p>
        <Link
          href="/submit?type=report"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Report a security issue <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
