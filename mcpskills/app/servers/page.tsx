import type { Metadata } from "next";
import Link from "next/link";
import { Filter } from "lucide-react";
import ServerCard from "@/components/ServerCard";
import { SERVERS, CATEGORIES, getCategories, type Category } from "@/data/servers";

export const metadata: Metadata = {
  title: "MCP Server Directory — All Servers",
  description:
    "Browse 60+ MCP servers. Filter by category, sort by stars, and find the perfect tool for your AI workflow.",
};

interface Props {
  searchParams: { category?: string; sort?: string };
}

export default function ServersPage({ searchParams }: Props) {
  const { category, sort = "stars" } = searchParams;
  const categories = getCategories();

  let servers = category
    ? SERVERS.filter((s) => s.category === (category as Category))
    : SERVERS;

  if (sort === "stars") servers = [...servers].sort((a, b) => b.stars - a.stars);
  if (sort === "name") servers = [...servers].sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "verified") servers = [...servers].sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">MCP Server Directory</h1>
        <p className="text-muted">
          {servers.length} server{servers.length !== 1 ? "s" : ""} · Connect Claude to any tool or API
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        {/* Category filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={16} className="text-muted" />
          <Link
            href="/servers"
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              !category
                ? "bg-brand-600 text-white"
                : "bg-card border border-card-border text-muted hover:text-foreground"
            }`}
          >
            All
          </Link>
          {categories.map((cat) => {
            const info = CATEGORIES[cat];
            return (
              <Link
                key={cat}
                href={`/servers?category=${cat}`}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  category === cat
                    ? "bg-brand-600 text-white"
                    : "bg-card border border-card-border text-muted hover:text-foreground"
                }`}
              >
                {info.icon} {info.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <span className="text-muted">Sort:</span>
        {(["stars", "name", "verified"] as const).map((s) => (
          <Link
            key={s}
            href={category ? `/servers?category=${category}&sort=${s}` : `/servers?sort=${s}`}
            className={`px-3 py-1 rounded-lg transition-colors ${
              sort === s
                ? "bg-brand-600 text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {servers.map((server) => (
          <ServerCard key={server.slug} server={server} />
        ))}
      </div>

      {servers.length === 0 && (
        <div className="text-center py-20 text-muted">
          <p className="text-lg">No servers found.</p>
          <Link href="/servers" className="text-brand-400 hover:underline mt-2 inline-block">
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}
