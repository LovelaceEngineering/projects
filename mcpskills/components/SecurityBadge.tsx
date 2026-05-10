import { ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import type { SecurityScan } from "@/lib/security";

interface Props {
  scan: SecurityScan;
  variant?: "compact" | "full";
  slug: string;
  type: "server" | "skill";
}

export function SecurityBadge({ scan, variant = "compact", slug, type }: Props) {
  const isClean = scan.status === "clean";
  const isPending = scan.status === "pending";

  if (variant === "compact") {
    return (
      <Link
        href={`/${type === "server" ? "servers" : "skills"}/${slug}#security`}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border transition-colors ${
          isClean
            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
            : isPending
            ? "bg-badge-bg text-muted border-card-border"
            : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
        }`}
        title={isClean ? `Security scan: ${scan.score}/100 — ${scan.scannedAt}` : "Scan pending"}
      >
        {isClean ? <ShieldCheck size={11} /> : isPending ? <Clock size={11} /> : <ShieldAlert size={11} />}
        {isClean ? `${scan.score}/100` : "Pending"}
      </Link>
    );
  }

  // Full security report
  return (
    <div id="security" className="bg-card border border-card-border rounded-xl p-6 scroll-mt-20">
      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {isClean ? (
              <ShieldCheck size={20} className="text-emerald-500" />
            ) : (
              <ShieldAlert size={20} className="text-amber-500" />
            )}
            <h2 className="font-semibold text-foreground">Security Report</h2>
          </div>
          <p className="text-xs text-muted">
            Last scanned: {scan.scannedAt} ·{" "}
            <Link href="/security" className="text-brand-500 hover:underline">
              View methodology
            </Link>
          </p>
        </div>
        <div className={`text-center px-4 py-2 rounded-xl border ${
          isClean
            ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50"
            : "bg-badge-bg border-card-border"
        }`}>
          <div className={`text-2xl font-bold ${isClean ? "text-emerald-600 dark:text-emerald-400" : "text-muted"}`}>
            {scan.score}
          </div>
          <div className="text-xs text-muted">/ 100</div>
        </div>
      </div>

      <div className="space-y-2">
        {scan.checks.map((check) => (
          <div key={check.id} className="flex items-start gap-3 py-2 border-b border-card-border last:border-0">
            <div className="mt-0.5 shrink-0">
              {check.passed ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : (
                <XCircle size={16} className="text-red-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{check.name}</span>
              </div>
              <p className="text-xs text-muted mt-0.5">{check.detail ?? check.description}</p>
            </div>
          </div>
        ))}
      </div>

      {isClean && (
        <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-lg px-3 py-2">
          <ShieldCheck size={13} />
          All checks passed. This listing has been reviewed and cleared by the MCPSkills security team.
        </div>
      )}
    </div>
  );
}
