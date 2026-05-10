import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Github, Shield, ArrowLeft, Copy, ExternalLink } from "lucide-react";
import ServerCard from "@/components/ServerCard";
import { SaveToCollection } from "@/components/SaveToCollection";
import { SecurityBadge } from "@/components/SecurityBadge";
import { getServerScan } from "@/lib/security";
import { SERVERS, CATEGORIES, getServerBySlug } from "@/data/servers";

interface Props {
  params: { slug: string };
}

export function generateStaticParams() {
  return SERVERS.map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const server = getServerBySlug(params.slug);
  if (!server) return {};
  return {
    title: `${server.name} MCP Server`,
    description: server.description,
    openGraph: {
      title: `${server.name} MCP Server — MCPHub`,
      description: server.description,
    },
  };
}

export default function ServerPage({ params }: Props) {
  const server = getServerBySlug(params.slug);
  if (!server) notFound();

  const cat = CATEGORIES[server.category];
  const related = SERVERS.filter(
    (s) => s.category === server.category && s.slug !== server.slug
  ).slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href="/servers"
        className="inline-flex items-center gap-2 text-muted hover:text-foreground text-sm mb-8 transition-colors"
      >
        <ArrowLeft size={16} /> Back to directory
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="flex items-start gap-4 mb-6">
            <div className="bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              {cat.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Link
                  href={`/category/${server.category}`}
                  className="text-xs bg-badge-bg text-muted px-2 py-0.5 rounded-full hover:text-foreground transition-colors"
                >
                  {cat.label}
                </Link>
                {server.verified && (
                  <span className="text-xs bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Shield size={10} /> Verified
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{server.name}</h1>
              <p className="text-muted mt-1">by {server.author}</p>
              <div className="mt-3">
                <SaveToCollection itemSlug={server.slug} itemType="server" itemName={server.name} />
              </div>
            </div>
          </div>

          <p className="text-lg text-secondary leading-relaxed mb-8">{server.description}</p>

          <div className="bg-card border border-card-border rounded-xl p-6 mb-6">
            <h2 className="font-semibold text-foreground mb-4">About</h2>
            <p className="text-muted leading-relaxed">{server.longDescription}</p>
          </div>

          {/* Security report */}
          <SecurityBadge scan={getServerScan(server.slug)} variant="full" slug={server.slug} type="server" />

          {/* Tags */}
          {server.tags.length > 0 && (
            <div className="mb-6">
              <h2 className="font-semibold text-foreground mb-3">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {server.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-card border border-card-border text-muted px-3 py-1 rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Related */}
          {related.length > 0 && (
            <div>
              <h2 className="font-semibold text-foreground mb-4">
                More {cat.label} Servers
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {related.map((s) => (
                  <ServerCard key={s.slug} server={s} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Install */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="font-semibold text-foreground mb-3">Install</h3>
            <div className="bg-background border border-card-border rounded-lg p-3 font-mono text-sm text-green-400 break-all mb-3">
              {server.installCommand}
            </div>
            <p className="text-muted text-xs">
              Add this to your Claude Desktop config or run in terminal.
            </p>
          </div>

          {/* Stats */}
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted text-sm">Stars</span>
              <span className="flex items-center gap-1 text-sm">
                <Star size={14} className="text-yellow-500" />
                {server.stars.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted text-sm">Language</span>
              <span className="text-sm text-foreground">{server.language}</span>
            </div>
            {server.version && (
              <div className="flex justify-between items-center">
                <span className="text-muted text-sm">Version</span>
                <span className="text-sm text-foreground">v{server.version}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-muted text-sm">Category</span>
              <Link href={`/category/${server.category}`} className="text-sm text-brand-400 hover:underline">
                {cat.label}
              </Link>
            </div>
          </div>

          {/* Links */}
          <div className="bg-card border border-card-border rounded-xl p-5 space-y-2">
            {server.githubUrl && (
              <a
                href={server.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
              >
                <Github size={16} /> View on GitHub
                <ExternalLink size={12} className="ml-auto" />
              </a>
            )}
            {server.npmPackage && (
              <a
                href={`https://www.npmjs.com/package/${server.npmPackage}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
              >
                📦 View on npm
                <ExternalLink size={12} className="ml-auto" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
