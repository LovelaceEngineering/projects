import type { MetadataRoute } from "next";
import { SERVERS, getCategories } from "@/data/servers";
import { SKILLS } from "@/data/skills";
import { POSTS } from "@/data/posts";

const BASE = "https://mcpskills.dev";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/servers`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/skills`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/submit`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const skillPages: MetadataRoute.Sitemap = SKILLS.map((s) => ({
    url: `${BASE}/skills/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const serverPages: MetadataRoute.Sitemap = SERVERS.map((s) => ({
    url: `${BASE}/servers/${s.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const categoryPages: MetadataRoute.Sitemap = getCategories().map((c) => ({
    url: `${BASE}/category/${c}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const blogPages: MetadataRoute.Sitemap = POSTS.map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.publishedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...serverPages, ...skillPages, ...categoryPages, ...blogPages];
}
