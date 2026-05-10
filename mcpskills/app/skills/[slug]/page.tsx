import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Download, Shield, ArrowLeft, ExternalLink, Terminal } from "lucide-react";
import SkillCard from "@/components/SkillCard";
import { SaveToCollection } from "@/components/SaveToCollection";
import { SecurityBadge } from "@/components/SecurityBadge";
import { getSkillScan } from "@/lib/security";
import { SKILLS, SKILL_CATEGORIES, getSkillBySlug } from "@/data/skills";

interface Props { params: { slug: string } }

export function generateStaticParams() {
  return SKILLS.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const skill = getSkillBySlug(params.slug);
  if (!skill) return {};
  return {
    title: `${skill.name} OpenClaw Skill`,
    description: skill.description,
    openGraph: { title: `${skill.name} OpenClaw Skill — MCPSkills`, description: skill.description },
  };
}

export default function SkillPage({ params }: Props) {
  const skill = getSkillBySlug(params.slug);
  if (!skill) notFound();

  const cat = SKILL_CATEGORIES[skill.category];
  const related = SKILLS.filter((s) => s.category === skill.category && s.slug !== skill.slug).slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/skills" className="inline-flex items-center gap-2 text-muted hover:text-foreground text-sm mb-8 transition-colors">
        <ArrowLeft size={16} /> Back to skills
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="flex items-start gap-4 mb-6">
            <div className="bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              {cat.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Link href={`/skills?category=${skill.category}`} className="text-xs bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/50 px-2 py-0.5 rounded-full hover:text-foreground transition-colors">
                  {cat.label}
                </Link>
                <span className="text-xs bg-card border border-card-border text-muted px-2 py-0.5 rounded-full">OpenClaw Skill</span>
                {skill.verified && (
                  <span className="text-xs bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Shield size={10} /> Verified
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{skill.name}</h1>
              <p className="text-muted mt-1">by {skill.author}</p>
              <div className="mt-3">
                <SaveToCollection itemSlug={skill.slug} itemType="skill" itemName={skill.name} />
              </div>
            </div>
          </div>

          <p className="text-lg text-secondary leading-relaxed mb-8">{skill.description}</p>

          <div className="bg-card border border-card-border rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-foreground mb-4">About this skill</h2>
            <p className="text-muted leading-relaxed">{skill.longDescription}</p>
          </div>

          {skill.requiredTools && (
            <div className="bg-card border border-card-border rounded-xl p-5 mb-6">
              <h2 className="font-semibold text-foreground mb-3">Required Tools</h2>
              <div className="flex flex-wrap gap-2">
                {skill.requiredTools.map((t) => (
                  <span key={t} className="flex items-center gap-1.5 text-sm bg-background border border-card-border text-muted px-3 py-1.5 rounded-lg font-mono">
                    <Terminal size={12} /> {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {skill.tags.length > 0 && (
            <div className="mb-6">
              <h2 className="font-semibold text-foreground mb-3">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {skill.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-card border border-card-border text-muted px-3 py-1 rounded-full">#{tag}</span>
                ))}
              </div>
            </div>
          )}

          {related.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground mb-4">More {cat.label} Skills</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {related.map((s) => <SkillCard key={s.slug} skill={s} />)}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="font-semibold text-foreground mb-3">Install</h3>
            <div className="bg-background border border-card-border rounded-lg p-3 font-mono text-sm text-green-400 break-all mb-3">
              {skill.installCommand}
            </div>
            <p className="text-muted text-xs">Requires OpenClaw + clawhub CLI installed.</p>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
            <div className="flex justify-between">
              <span className="text-muted text-sm">Installs</span>
              <span className="flex items-center gap-1 text-sm"><Download size={13} className="text-brand-400" />{skill.installs.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted text-sm">Stars</span>
              <span className="flex items-center gap-1 text-sm"><Star size={13} className="text-yellow-500" />{skill.stars.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted text-sm">Version</span>
              <span className="text-sm text-foreground">v{skill.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted text-sm">Category</span>
              <Link href={`/skills?category=${skill.category}`} className="text-sm text-brand-400 hover:underline">{cat.label}</Link>
            </div>
          </div>

          {skill.clawhubUrl && (
            <div className="bg-card border border-card-border rounded-xl p-5">
              <a href={skill.clawhubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors">
                <span className="text-lg">🦞</span> View on ClawHub
                <ExternalLink size={12} className="ml-auto" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
