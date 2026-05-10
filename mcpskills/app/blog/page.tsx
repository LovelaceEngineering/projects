import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";
import { POSTS } from "@/data/posts";

export const metadata: Metadata = {
  title: "MCP Blog — Guides & Tutorials",
  description:
    "Guides, tutorials, and news about the Model Context Protocol. Learn how to use MCP servers with Claude and other AI assistants.",
};

export default function BlogPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">MCP Blog</h1>
        <p className="text-muted">Guides, tutorials, and news about the Model Context Protocol.</p>
      </div>

      <div className="space-y-4">
        {POSTS.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="block group">
            <article className="card-hover bg-card border border-card-border rounded-xl p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 border border-brand-100 dark:border-transparent px-2 py-0.5 rounded-full"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-brand-500 dark:group-hover:text-brand-300 transition-colors mb-2">
                    {post.title}
                  </h2>
                  <p className="text-muted text-sm leading-relaxed">{post.excerpt}</p>
                  <div className="flex items-center gap-4 mt-4 text-xs text-muted">
                    <span>{post.publishedAt}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {post.readingTime} min read
                    </span>
                  </div>
                </div>
                <ArrowRight size={20} className="text-muted group-hover:text-brand-400 transition-colors shrink-0 mt-1" />
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
