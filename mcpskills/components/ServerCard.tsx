import Link from "next/link";
import { Star, Shield } from "lucide-react";
import type { MCPServer } from "@/data/servers";
import { SecurityBadge } from "@/components/SecurityBadge";
import { getServerScan } from "@/lib/security";
import { CATEGORIES } from "@/data/servers";

export default function ServerCard({ server }: { server: MCPServer }) {
  const cat = CATEGORIES[server.category];
  return (
    <Link href={`/servers/${server.slug}`} className="block">
      <div className="card-hover h-full bg-card border border-card-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs bg-badge-bg text-muted px-2 py-0.5 rounded-full">
                {cat.icon} {cat.label}
              </span>
              {server.verified && (
                <span className="text-xs bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Shield size={10} /> Verified
                </span>
              )}
            </div>
            <h3 className="font-semibold text-foreground truncate">{server.name}</h3>
          </div>
          <div className="flex items-center gap-1 text-muted text-xs shrink-0">
            <Star size={12} className="text-yellow-500" />
            <span>{(server.stars / 1000).toFixed(1)}k</span>
          </div>
        </div>

        <p className="text-muted text-sm leading-relaxed line-clamp-2 flex-1">
          {server.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            by <span className="text-foreground font-medium">{server.author}</span>
          </span>
          <span className="text-xs bg-badge-bg text-muted px-2 py-0.5 rounded-full">
            {server.language}
          </span>
        </div>
        <SecurityBadge scan={getServerScan(server.slug)} variant="compact" slug={server.slug} type="server" />
      </div>
    </Link>
  );
}
