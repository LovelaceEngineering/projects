import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Zap, Search, BookOpen, Plus, ShieldCheck } from "lucide-react";
import ServerCard from "@/components/ServerCard";
import SkillCard from "@/components/SkillCard";
import { SERVERS, CATEGORIES, getFeaturedServers, getCategories } from "@/data/servers";
import { SKILLS, getFeaturedSkills } from "@/data/skills";

export const metadata: Metadata = {
  title: "MCPSkills — MCP Servers & AI Skills Directory",
  description:
    "The largest directory of MCP servers and OpenClaw Skills. Browse 80+ tools for Claude, Cursor, Windsurf, and every AI assistant.",
};

export default function HomePage() {
  const featured = getFeaturedServers();
  const featuredSkills = getFeaturedSkills();
  const categories = getCategories();
  const totalServers = SERVERS.length;
  const totalSkills = SKILLS.length;

  return (
    <div className="min-h-screen">
      {/* HERO */}
      <section className="relative overflow-hidden py-20 px-4 sm:px-6">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, #7c3aed22 0%, transparent 70%)" }}
        />
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-brand-50 dark:bg-brand-900/40 border border-brand-200 dark:border-brand-700/50 text-brand-700 dark:text-brand-300 text-sm px-4 py-2 rounded-full mb-6">
            <Zap size={14} />
            <span>MCP Servers · OpenClaw Skills · AI Extensions</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold leading-tight mb-6">
            Supercharge your AI with{" "}
            <span className="gradient-text">MCP & Skills</span>
          </h1>
          <p className="text-muted text-lg sm:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
            The largest directory of MCP servers and OpenClaw Skills. Connect Claude to any tool,
            API, or platform — or extend it with specialised skills for DevOps, coding, and more.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/servers" className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors glow">
              MCP Servers <ArrowRight size={16} />
            </Link>
            <Link href="/skills" className="border border-brand-300 dark:border-brand-700/60 hover:border-brand-500 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 hover:text-brand-800 dark:hover:text-foreground px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors">
              <Zap size={16} /> OpenClaw Skills
            </Link>
            <Link href="/blog/what-is-mcp" className="border border-card-border hover:border-brand-500 text-muted hover:text-foreground px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors">
              <BookOpen size={16} /> What is MCP?
            </Link>
          </div>
        </div>

        {/* Stats row */}
        <div className="max-w-3xl mx-auto mt-14 grid grid-cols-4 gap-4 text-center">
          {[
            { value: `${totalServers}+`, label: "MCP Servers" },
            { value: `${totalSkills}+`, label: "OpenClaw Skills" },
            { value: `${Object.keys(CATEGORIES).length}`, label: "Categories" },
            { value: "Free", label: "Always free" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-card-border rounded-xl py-4 px-3">
              <div className="text-2xl font-bold gradient-text">{s.value}</div>
              <div className="text-muted text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Browse by Category</h2>
          <Link href="/servers" className="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 text-sm flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {categories.map((cat) => {
            const info = CATEGORIES[cat];
            const count = SERVERS.filter((s) => s.category === cat).length;
            return (
              <Link
                key={cat}
                href={`/category/${cat}`}
                className="card-hover bg-card border border-card-border rounded-xl p-4 text-center flex flex-col items-center gap-2"
              >
                <span className="text-2xl">{info.icon}</span>
                <span className="text-sm font-medium text-foreground">{info.label}</span>
                <span className="text-xs text-muted">{count} servers</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* FEATURED SERVERS */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Featured Servers</h2>
          <Link href="/servers" className="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 text-sm flex items-center gap-1">
            View all {totalServers} <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featured.slice(0, 9).map((server) => (
            <ServerCard key={server.slug} server={server} />
          ))}
        </div>
      </section>

      {/* OPENCLAW SKILLS */}
      <section className="py-12 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-brand-500 dark:text-brand-400 uppercase tracking-wider">OpenClaw Skills</span>
              <span className="text-xs bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full border border-brand-200 dark:border-brand-700/30">New</span>
            </div>
            <h2 className="text-xl font-bold">Featured OpenClaw Skills</h2>
          </div>
          <Link href="/skills" className="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 text-sm flex items-center gap-1">
            View all {totalSkills} <ArrowRight size={14} />
          </Link>
        </div>
        <p className="text-muted text-sm mb-6">
          Skills extend Claude with deep domain knowledge — install with one command via <code className="bg-card border border-card-border text-brand-600 dark:text-brand-300 px-1.5 py-0.5 rounded text-xs">clawhub install</code>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredSkills.slice(0, 6).map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      </section>

      {/* TRUST / SECURITY BANNER */}
      <section className="py-10 px-4 sm:px-6 max-w-7xl mx-auto">
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl px-6 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-300 text-sm">Security scanned &amp; verified</p>
              <p className="text-emerald-700 dark:text-emerald-500 text-xs">Every listing on MCPSkills</p>
            </div>
          </div>
          <p className="text-sm text-emerald-800 dark:text-emerald-400 leading-relaxed flex-1">
            Every MCP server and OpenClaw Skill is scanned for vulnerabilities, credential harvesting,
            phishing, and malicious code before it appears in the directory — and re-scanned on every update.
          </p>
          <a href="/security" className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 whitespace-nowrap">
            How it works <ArrowRight size={12} />
          </a>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-16 px-4 sm:px-6 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">How MCP Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              icon: <Search size={22} />,
              title: "Find a server",
              desc: "Browse MCPSkills by category or search for the tool you need.",
            },
            {
              step: "02",
              icon: <Zap size={22} />,
              title: "Run the install command",
              desc: "One npx or uvx command. No complex setup. Works in 30 seconds.",
            },
            {
              step: "03",
              icon: <ArrowRight size={22} />,
              title: "Use it in Claude",
              desc: "Restart Claude Desktop and your new tools appear automatically.",
            },
          ].map((step) => (
            <div
              key={step.step}
              className="bg-card border border-card-border rounded-xl p-6 relative overflow-hidden"
            >
              <span className="text-5xl font-black text-card-border absolute top-4 right-4 select-none">
                {step.step}
              </span>
              <div className="bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                {step.icon}
              </div>
              <h3 className="font-semibold text-foreground mb-2">{step.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center bg-gradient-to-br from-brand-50 dark:from-brand-900/40 to-card border border-brand-200 dark:border-brand-700/30 rounded-2xl p-10">
          <Plus size={32} className="text-brand-600 dark:text-brand-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-3">Built an MCP Server?</h2>
          <p className="text-muted mb-6">
            Submit your server to MCPSkills and reach thousands of developers looking for new tools.
          </p>
          <Link
            href="/submit"
            className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-3 rounded-xl font-medium inline-flex items-center gap-2 transition-colors"
          >
            Submit Your Server <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
