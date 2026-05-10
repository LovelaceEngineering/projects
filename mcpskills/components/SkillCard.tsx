import Link from "next/link";
import { Star, Download, Shield } from "lucide-react";
import type { OCSkill } from "@/data/skills";
import { SKILL_CATEGORIES } from "@/data/skills";
import { SecurityBadge } from "@/components/SecurityBadge";
import { getSkillScan } from "@/lib/security";

export default function SkillCard({ skill }: { skill: OCSkill }) {
  const cat = SKILL_CATEGORIES[skill.category];
  return (
    <Link href={`/skills/${skill.slug}`} className="block">
      <div className="card-hover h-full bg-card border border-card-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/50 px-2 py-0.5 rounded-full">
                {cat.icon} {cat.label}
              </span>
              {skill.verified && (
                <span className="text-xs bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Shield size={10} /> Verified
                </span>
              )}
            </div>
            <h3 className="font-semibold text-foreground truncate">{skill.name}</h3>
          </div>
          <div className="flex flex-col items-end gap-1 text-xs text-muted shrink-0">
            <span className="flex items-center gap-1">
              <Star size={11} className="text-yellow-500" />
              {(skill.stars / 1000).toFixed(1)}k
            </span>
            <span className="flex items-center gap-1">
              <Download size={11} className="text-brand-400" />
              {(skill.installs / 1000).toFixed(0)}k
            </span>
          </div>
        </div>

        <p className="text-muted text-sm leading-relaxed line-clamp-2 flex-1">
          {skill.description}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">
            by <span className="text-foreground font-medium">{skill.author}</span>
          </span>
          <span className="text-xs bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/50 px-2 py-0.5 rounded-full">
            OpenClaw
          </span>
        </div>
        <SecurityBadge scan={getSkillScan(skill.slug)} variant="compact" slug={skill.slug} type="skill" />
      </div>
    </Link>
  );
}
