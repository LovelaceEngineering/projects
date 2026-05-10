import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookMarked, Plus, Globe, Lock, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Collections",
  description: "Your saved MCP servers and OpenClaw Skills collections.",
};

export default async function CollectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/?error=login_required");

  const { data: collections } = await supabase
    .from("collections")
    .select(`
      id, name, description, is_public, created_at,
      collection_items(item_slug, item_type)
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const name = user.user_metadata?.user_name || user.user_metadata?.name || "Your";

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">
            {name}&apos;s Collections
          </h1>
          <p className="text-muted">
            Save MCP servers and Skills into themed lists — share them with your team or keep them private.
          </p>
        </div>
        <Link
          href="/servers"
          className="shrink-0 flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add items
        </Link>
      </div>

      {/* Empty state */}
      {(!collections || collections.length === 0) && (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center">
          <BookMarked size={40} className="text-muted mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">No collections yet</h3>
          <p className="text-muted text-sm mb-6">
            Browse MCP servers or OpenClaw Skills and click <strong className="text-foreground">Save</strong> to build your first collection.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/servers" className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-lg text-sm transition-colors">
              Browse Servers
            </Link>
            <Link href="/skills" className="bg-card border border-card-border hover:border-brand-500 text-foreground px-5 py-2 rounded-lg text-sm transition-colors">
              Browse Skills
            </Link>
          </div>
        </div>
      )}

      {/* Collections grid */}
      {collections && collections.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {collections.map((col) => {
            const servers = col.collection_items?.filter((i: { item_type: string }) => i.item_type === "server").length ?? 0;
            const skills = col.collection_items?.filter((i: { item_type: string }) => i.item_type === "skill").length ?? 0;
            return (
              <Link key={col.id} href={`/collections/${col.id}`} className="block group">
                <div className="card-hover bg-card border border-card-border rounded-xl p-5 h-full flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {col.name}
                    </h3>
                    {col.is_public ? (
                      <span className="flex items-center gap-1 text-xs text-muted shrink-0">
                        <Globe size={12} /> Public
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted shrink-0">
                        <Lock size={12} /> Private
                      </span>
                    )}
                  </div>
                  {col.description && (
                    <p className="text-muted text-sm leading-relaxed line-clamp-2">{col.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-auto">
                    <div className="flex items-center gap-3 text-xs text-muted">
                      {servers > 0 && <span>{servers} server{servers !== 1 ? "s" : ""}</span>}
                      {skills > 0 && <span>{skills} skill{skills !== 1 ? "s" : ""}</span>}
                      {servers === 0 && skills === 0 && <span>Empty</span>}
                    </div>
                    <ArrowRight size={14} className="text-muted group-hover:text-brand-500 transition-colors" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
