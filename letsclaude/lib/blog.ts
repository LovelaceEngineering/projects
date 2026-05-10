export interface Post {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  content: string;
}

const posts: Post[] = [
  {
    slug: "welcome",
    title: "Welcome to Let's Claude",
    description: "Why we built Let's Claude and what to expect from the blog.",
    date: "2026-04-06",
    category: "Announcements",
    content: `## Hello\n\nWelcome to **Let's Claude** — tutorials, case studies, and insights on building with the Anthropic platform.\n\nMore posts coming soon.`,
  },
];

export function getAllPosts(): Post[] {
  return [...posts].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug);
}
