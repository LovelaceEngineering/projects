import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — Let's Claude",
  description: "Tutorials, case studies, and insights on building with Claude.",
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <div className="px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-4xl font-bold text-claude-dark md:text-5xl">Blog</h1>
        <p className="mt-3 text-lg text-claude-muted leading-relaxed">
          Tutorials, case studies, and insights on building with Claude.
        </p>

        <div className="mt-12 flex flex-col gap-5">
          {posts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group rounded-xl border border-claude-sand p-7 transition-all hover:border-claude-amber hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-claude-sand px-3 py-0.5 text-xs font-medium text-claude-muted">
                  {post.category}
                </span>
                <span className="text-xs text-claude-muted">{post.date}</span>
              </div>
              <h2 className="mt-3 font-serif text-xl font-semibold text-claude-dark group-hover:text-claude-amber transition-colors">
                {post.title}
              </h2>
              <p className="mt-2 text-sm text-claude-muted leading-relaxed">{post.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
