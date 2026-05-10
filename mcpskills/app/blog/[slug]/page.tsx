import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { POSTS, getPostBySlug } from "@/data/posts";

interface Props {
  params: { slug: string };
}

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const post = getPostBySlug(params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.publishedAt,
    },
  };
}

function renderMarkdown(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) return `<h2 class="text-xl font-bold text-foreground mt-8 mb-3">${line.slice(3)}</h2>`;
      if (line.startsWith("### ")) return `<h3 class="text-lg font-semibold text-foreground mt-6 mb-2">${line.slice(4)}</h3>`;
      if (line.startsWith("---")) return `<hr class="border-card-border my-6" />`;
      if (line.startsWith("**") && line.endsWith("**") && line.length > 4)
        return `<p class="text-foreground font-semibold">${line.slice(2, -2)}</p>`;
      if (line.startsWith("- "))
        return `<li class="text-secondary leading-relaxed list-disc ml-5">${line.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong class='text-foreground'>$1</strong>")}</li>`;
      if (line.startsWith("\`\`\`"))
        return line === "\`\`\`" ? `</code></pre>` : `<pre class="bg-background border border-card-border rounded-lg p-4 overflow-x-auto my-4"><code class="text-green-400 text-sm font-mono">`;
      if (line.trim() === "") return "<br/>";
      return `<p class="text-secondary leading-relaxed mb-3">${line.replace(/\*\*(.*?)\*\*/g, "<strong class='text-foreground'>$1</strong>").replace(/\`(.*?)\`/g, "<code class='blog-inline-code'>$1</code>").replace(/\[(.*?)\]\((.*?)\)/g, "<a href='$2' class='text-brand-400 hover:underline'>$1</a>")}</p>`;
    })
    .join("\n");
}

export default function BlogPostPage({ params }: Props) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-muted hover:text-foreground text-sm mb-8 transition-colors"
      >
        <ArrowLeft size={16} /> Back to blog
      </Link>

      <article>
        <header className="mb-8">
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <span key={tag} className="text-xs bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 border border-brand-100 dark:border-transparent px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
            {post.title}
          </h1>
          <p className="text-muted text-lg mb-4">{post.excerpt}</p>
          <div className="flex items-center gap-4 text-sm text-muted border-b border-card-border pb-6">
            <span>{post.author}</span>
            <span>{post.publishedAt}</span>
            <span className="flex items-center gap-1">
              <Clock size={14} /> {post.readingTime} min read
            </span>
          </div>
        </header>

        <div
          className="prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
        />
      </article>

      <div className="mt-12 bg-card border border-card-border rounded-xl p-6 text-center">
        <p className="text-muted mb-3">Find MCP servers for your workflow</p>
        <Link
          href="/servers"
          className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          Browse the directory →
        </Link>
      </div>
    </div>
  );
}
