"use client";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Plus, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Collection {
  id: string;
  name: string;
  collection_items: { count: number }[];
}

interface Props {
  itemSlug: string;
  itemType: "server" | "skill";
  itemName: string;
}

export function SaveToCollection({ itemSlug, itemType, itemName }: Props) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [savedIn, setSavedIn] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function openModal() {
    if (!user) {
      await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${location.origin}/auth/callback?next=${location.pathname}` },
      });
      return;
    }
    setOpen(true);
    setLoading(true);
    const [colRes, itemRes] = await Promise.all([
      fetch("/api/collections").then((r) => r.json()),
      supabase
        .from("collection_items")
        .select("collection_id")
        .eq("item_slug", itemSlug)
        .eq("item_type", itemType),
    ]);
    setCollections(colRes.collections ?? []);
    setSavedIn(new Set((itemRes.data ?? []).map((i: { collection_id: string }) => i.collection_id)));
    setLoading(false);
  }

  async function toggle(collectionId: string) {
    const isSaved = savedIn.has(collectionId);
    const method = isSaved ? "DELETE" : "POST";
    setSavedIn((prev) => {
      const next = new Set(prev);
      isSaved ? next.delete(collectionId) : next.add(collectionId);
      return next;
    });
    await fetch("/api/collections/items", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_id: collectionId, item_slug: itemSlug, item_type: itemType }),
    });
  }

  async function createCollection() {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const { collection } = await res.json();
    setCollections((prev) => [{ ...collection, collection_items: [{ count: 0 }] }, ...prev]);
    setNewName("");
    setCreating(false);
    // Auto-add to new collection
    await toggle(collection.id);
  }

  const isSavedAnywhere = savedIn.size > 0;

  return (
    <>
      <button
        onClick={openModal}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
          isSavedAnywhere
            ? "bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300"
            : "bg-card border-card-border text-muted hover:text-foreground hover:border-brand-500"
        }`}
      >
        {isSavedAnywhere ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
        {isSavedAnywhere ? "Saved" : "Save"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
              <div>
                <h3 className="font-semibold text-foreground">Save to collection</h3>
                <p className="text-xs text-muted mt-0.5 truncate max-w-[220px]">{itemName}</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Collections list */}
            <div className="px-5 py-3 max-h-64 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-muted" />
                </div>
              ) : collections.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">No collections yet — create one below</p>
              ) : (
                <ul className="space-y-1">
                  {collections.map((col) => {
                    const saved = savedIn.has(col.id);
                    return (
                      <li key={col.id}>
                        <button
                          onClick={() => toggle(col.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                            saved
                              ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300"
                              : "hover:bg-badge-bg text-foreground"
                          }`}
                        >
                          <span className="font-medium truncate">{col.name}</span>
                          <span className="flex items-center gap-2 text-xs text-muted shrink-0 ml-2">
                            {col.collection_items?.[0]?.count ?? 0} items
                            {saved && <BookmarkCheck size={14} className="text-brand-500" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Create new */}
            <div className="px-5 pb-5 pt-3 border-t border-card-border">
              <p className="text-xs font-medium text-muted mb-2 uppercase tracking-wider">New collection</p>
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createCollection()}
                  placeholder="e.g. My DevOps stack"
                  className="flex-1 bg-background border border-card-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:border-brand-500 transition-colors"
                />
                <button
                  onClick={createCollection}
                  disabled={!newName.trim() || creating}
                  className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors"
                >
                  {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
