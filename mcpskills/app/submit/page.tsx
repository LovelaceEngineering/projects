import type { Metadata } from "next";
import { Github, PackageOpen } from "lucide-react";
import { CATEGORIES, getCategories } from "@/data/servers";

export const metadata: Metadata = {
  title: "Submit an MCP Server",
  description: "Submit your MCP server to MCPHub and reach thousands of AI developers.",
};

export default function SubmitPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Submit Your MCP Server</h1>
        <p className="text-muted">
          Built an MCP server? Get it in front of thousands of developers looking for new tools.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {[
          { icon: <Github size={20} />, title: "GitHub Required", desc: "Open-source servers only. Must have a public GitHub repo." },
          { icon: <PackageOpen size={20} />, title: "Any Language", desc: "TypeScript, Python, Go, Rust — we list all of them." },
        ].map((item) => (
          <div key={item.title} className="bg-card border border-card-border rounded-xl p-4 flex gap-3">
            <div className="text-brand-400 mt-1">{item.icon}</div>
            <div>
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              <p className="text-xs text-muted mt-1">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-card-border rounded-xl p-6">
        <form action="/api/submit" method="POST" className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              GitHub URL <span className="text-brand-400">*</span>
            </label>
            <input
              type="url"
              name="githubUrl"
              required
              placeholder="https://github.com/you/your-mcp-server"
              className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-brand-600 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Category <span className="text-brand-400">*</span>
            </label>
            <select
              name="category"
              required
              className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-brand-600 transition-colors"
            >
              <option value="">Select a category…</option>
              {getCategories().map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORIES[cat].icon} {CATEGORIES[cat].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Short Description <span className="text-brand-400">*</span>
            </label>
            <textarea
              name="description"
              required
              rows={3}
              placeholder="What does your server do? (max 150 chars)"
              maxLength={150}
              className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-brand-600 transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Your Email (optional)
            </label>
            <input
              type="email"
              name="email"
              placeholder="you@example.com — we'll notify you when listed"
              className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder-muted focus:outline-none focus:border-brand-600 transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Submit Server →
          </button>

          <p className="text-xs text-muted text-center">
            We review all submissions. Usually listed within 48 hours.
          </p>
        </form>
      </div>
    </div>
  );
}
