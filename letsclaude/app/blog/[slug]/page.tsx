import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { getAllPosts, getPostBySlug } from "@/lib/blog";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} — Let's Claude`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="px-6 py-20">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/blog"
          className="text-sm text-claude-muted hover:text-claude-dark"
        >
          ← Back to Blog
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className="rounded-full bg-claude-cream px-3 py-0.5 text-xs font-medium text-claude-muted">
            {post.category}
          </span>
          <span className="text-xs text-claude-muted">{post.date}</span>
        </div>

        <h1 className="mt-4 text-4xl font-bold">{post.title}</h1>
        <p className="mt-2 text-lg text-claude-muted">{post.description}</p>

        <div className="prose prose-neutral mt-8 max-w-none prose-headings:font-semibold prose-a:text-claude-amber prose-a:no-underline hover:prose-a:underline">
          <MDXRemote source={post.content} />
        </div>
      </article>
    </div>
  );
}
