import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import ServerCard from "@/components/ServerCard";
import {
  SERVERS,
  CATEGORIES,
  getCategories,
  getServersByCategory,
  type Category,
} from "@/data/servers";

interface Props {
  params: { slug: string };
}

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c }));
}

export function generateMetadata({ params }: Props): Metadata {
  const cat = CATEGORIES[params.slug as Category];
  if (!cat) return {};
  const count = SERVERS.filter((s) => s.category === params.slug).length;
  return {
    title: `Best MCP Servers for ${cat.label} (${count} servers)`,
    description: `${cat.description}. Browse ${count} MCP servers for ${cat.label}.`,
  };
}

export default function CategoryPage({ params }: Props) {
  const { slug } = params;
  const cat = CATEGORIES[slug as Category];
  if (!cat) notFound();

  const servers = getServersByCategory(slug as Category).sort((a, b) => b.stars - a.stars);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href="/servers"
        className="inline-flex items-center gap-2 text-muted hover:text-foreground text-sm mb-8 transition-colors"
      >
        <ArrowLeft size={16} /> All categories
      </Link>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-4xl">{cat.icon}</span>
          <h1 className="text-3xl font-bold">
            {cat.label}{" "}
            <span className="text-muted font-normal text-xl">MCP Servers</span>
          </h1>
        </div>
        <p className="text-muted text-lg">{cat.description}</p>
        <p className="text-sm text-muted mt-2">{servers.length} servers available</p>
      </div>

      {servers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {servers.map((server) => (
            <ServerCard key={server.slug} server={server} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-muted">
          <p className="text-lg mb-4">No servers in this category yet.</p>
          <Link href="/submit" className="text-brand-400 hover:underline">
            Submit the first one →
          </Link>
        </div>
      )}

      <div className="mt-12 bg-card border border-card-border rounded-xl p-8 text-center">
        <p className="text-muted mb-3">
          Know an MCP server for <strong className="text-foreground">{cat.label}</strong> that&apos;s missing?
        </p>
        <Link
          href="/submit"
          className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          Submit a server
        </Link>
      </div>
    </div>
  );
}
