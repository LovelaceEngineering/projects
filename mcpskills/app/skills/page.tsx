import type { Metadata } from "next";
import Link from "next/link";
import { Filter, Zap } from "lucide-react";
import SkillCard from "@/components/SkillCard";
import { SKILLS, SKILL_CATEGORIES, getSkillCategories, type SkillCategory } from "@/data/skills";

export const metadata: Metadata = {
  title: "OpenClaw Skills Directory — AI Skills for Claude",
  description:
    "Browse 25+ OpenClaw skills. Add superpowers to Claude: DevOps, coding, productivity, communication, and more — installed in one command.",
};

interface Props {
  searchParams: { category?: string; sort?: string };
}

export default function SkillsPage({ searchParams }: Props) {
  const { category, sort = "installs" } = searchParams;
  const categories = getSkillCategories();

  let skills = category
    ? SKILLS.filter((s) => s.category === (category as SkillCategory))
    : SKILLS;

  if (sort === "installs") skills = [...skills].sort((a, b) => b.installs - a.installs);
  if (sort === "stars")    skills = [...skills].sort((a, b) => b.stars - a.stars);
  if (sort === "name")     skills = [...skills].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-brand-600 text-white rounded-lg p-1"><Zap size={16} /></span>
          <span className="text-xs font-medium text-brand-400 uppercase tracking-wider">OpenClaw Skills</span>
        </div>
        <h1 className="text-3xl font-bold mb-2">OpenClaw Skills Directory</h1>
        <p className="text-muted max-w-2xl">
          Skills extend Claude with specialised knowledge and workflows. Install with one command via{" "}
          <code className="bg-card text-brand-300 px-1 rounded text-sm">clawhub install</code>.
          Browse {SKILLS.length} skills across {categories.length} categories.
        </p>
      </div>

      {/* What are skills */}
      <div className="bg-gradient-to-r from-brand-50 dark:from-brand-900/30 to-card border border-brand-200 dark:border-brand-700/30 rounded-xl p-5 mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground mb-1">What are OpenClaw Skills?</p>
          <p className="text-sm text-muted">
            Skills are specialised instruction sets that give Claude deep expertise in specific domains — DevOps, coding, productivity, and more. Unlike MCP servers (which connect to APIs), skills enhance Claude&apos;s reasoning and workflow knowledge.
          </p>
        </div>
        <a
          href="https://clawhub.com"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 bg-brand-600 hover:bg-brand-500 text-white text-sm px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          Browse on ClawhHub →
        </a>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={16} className="text-muted" />
        <Link
          href="/skills"
          className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
            !category ? "bg-brand-600 text-white" : "bg-card border border-card-border text-muted hover:text-foreground"
          }`}
        >
          All
        </Link>
        {categories.map((cat) => {
          const info = SKILL_CATEGORIES[cat];
          return (
            <Link
              key={cat}
              href={`/skills?category=${cat}`}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                category === cat ? "bg-brand-600 text-white" : "bg-card border border-card-border text-muted hover:text-foreground"
              }`}
            >
              {info.icon} {info.label}
            </Link>
          );
        })}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <span className="text-muted">Sort:</span>
        {(["installs", "stars", "name"] as const).map((s) => (
          <Link
            key={s}
            href={category ? `/skills?category=${category}&sort=${s}` : `/skills?sort=${s}`}
            className={`px-3 py-1 rounded-lg transition-colors ${sort === s ? "bg-brand-600 text-white" : "text-muted hover:text-foreground"}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {skills.map((skill) => (
          <SkillCard key={skill.slug} skill={skill} />
        ))}
      </div>
    </div>
  );
}
