# MCPHub.dev — The MCP Server Directory

The largest directory of MCP (Model Context Protocol) servers. Built to generate organic search traffic and reach 1000+ daily visitors.

## Stack

- **Next.js 14** (App Router, static export)
- **Tailwind CSS** for styling
- **Supabase** for newsletter & submissions (optional)
- **Vercel** for deployment

## Local Development

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Deploy to Vercel

### 1. Push to GitHub

```bash
git add -A
git commit -m "feat: initial MCPHub build"
git remote add origin https://github.com/YOUR_USERNAME/mcphub
git push -u origin main
```

### 2. Deploy via Vercel

```bash
npx vercel --prod
# Or connect the repo at https://vercel.com/new
```

### 3. (Optional) Set up Supabase

Create a Supabase project and run this SQL:

```sql
create table newsletter (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  github_url text not null,
  category text not null,
  description text,
  submitter_email text,
  status text default 'pending',
  created_at timestamptz default now()
);
```

Then add env vars in Vercel:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Traffic Strategy (1000 visitors/day)

### SEO (primary driver)
Each of the 60+ servers has its own indexed page:
- `/servers/kubernetes` → targets "kubernetes mcp server"
- `/servers/playwright` → targets "playwright mcp server"
- `/category/devops` → targets "mcp servers for devops"

Blog posts target high-volume queries:
- "what is mcp" — 50k+ monthly searches
- "mcp server list" — rapidly growing
- "how to install mcp server" — high intent

### Community (secondary)
- Post to `/r/ClaudeAI`, `/r/LLM`, Hacker News "Show HN"
- Alessandro's Twitter/LinkedIn (50k+ reach in cloud-native community)
- KubeCon, KCD talks — mention MCPHub in demos

### Directory Listings
- Submit to: Product Hunt, AlternativeTo, SaaSHub, There's An AI For That

## Monetization Options

1. **Featured listings** — $50/month per featured server
2. **Newsletter sponsorships** — once 1000+ subscribers
3. **Affiliate links** — Supabase, Vercel, Cloudflare refer-a-friend
4. **"Verified" badges** — paid verification service for companies
5. **OpenClaw VPS affiliate** — banner in the DevOps/Cloud sections

## Adding More Servers

Edit `data/servers.ts` and add entries. Each server automatically gets:
- Its own SEO-optimized page at `/servers/[slug]`
- A listing in the category page
- Inclusion in the sitemap

## File Structure

```
app/
  page.tsx          — homepage
  servers/
    page.tsx        — directory with filters
    [slug]/page.tsx — individual server pages (60+ SEO pages!)
  category/
    [slug]/page.tsx — category pages (12 pages)
  blog/
    page.tsx        — blog index
    [slug]/page.tsx — blog posts (3 starter posts)
  submit/page.tsx   — submission form
  sitemap.ts        — auto-generated sitemap
  robots.ts         — robots.txt
data/
  servers.ts        — 60+ server listings
  posts.ts          — blog posts
components/         — reusable UI components
```
