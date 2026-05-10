import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ServerCard from "@/components/ServerCard";
import SkillCard from "@/components/SkillCard";
import { getServerBySlug, type MCPServer } from "@/data/servers";
import { getSkillBySlug, type OCSkill } from "@/data/skills";

interface Props { params: { id: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = await createClient();
  const { data } = await supabase.from("collections").select("name, description").eq("id", params.id).single();
  if (!data) return {};
  return { title: data.name, description: data.description ?? `A curated collection of MCP servers and Skills.` };
}

export default async function CollectionPage({ params }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: col } = await supabase
    .from("collections")
    .select("*, collection_items(item_slug, item_type, added_at)")
    .eq("id", params.id)
    .single();

  if (!col) notFound();

  // Access control: private collections only visible to owner
  if (!col.is_public && col.user_id !== user?.id) notFound();

  type ItemRow = { item_type: string; item_slug: string };
  const items: ItemRow[] = (col.collection_items as ItemRow[]) ?? [];
  const servers: MCPServer[] = items
    .filter((i) => i.item_type === "server")
    .map((i) => getServerBySlug(i.item_slug))
    .filter((s: MCPServer | undefined): s is MCPServer => s !== undefined);
  const skills: OCSkill[] = items
    .filter((i) => i.item_type === "skill")
    .map((i) => getSkillBySlug(i.item_slug))
    .filter((s: OCSkill | undefined): s is OCSkill => s !== undefined);

  const isOwner = user?.id === col.user_id;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <Link href="/collections" className="inline-flex items-center gap-2 text-muted hover:text-foreground text-sm mb-8 transition-colors">
        <ArrowLeft size={16} /> My Collections
      </Link>

      {/* Collection header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          {col.is_public ? (
            <span className="flex items-center gap-1 text-xs text-muted border border-card-border px-2 py-0.5 rounded-full">
              <Globe size={11} /> Public
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted border border-card-border px-2 py-0.5 rounded-full">
              <Lock size={11} /> Private
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold mb-2">{col.name}</h1>
        {col.description && <p className="text-muted">{col.description}</p>}
        <p className="text-xs text-muted mt-2">
          {servers.length} server{servers.length !== 1 ? "s" : ""} · {skills.length} skill{skills.length !== 1 ? "s" : ""}
          {isOwner && (
            <> · <Link href="/collections" className="text-brand-500 hover:underline">Manage</Link></>
          )}
        </p>
      </div>

      {items.length === 0 && (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center">
          <p className="text-muted mb-4">This collection is empty.</p>
          {isOwner && (
            <Link href="/servers" className="bg-brand-600 hover:bg-brand-500 text-white px-5 py-2 rounded-lg text-sm transition-colors">
              Add servers →
            </Link>
          )}
        </div>
      )}

      {servers.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">MCP Servers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((s) => <ServerCard key={s.slug} server={s} />)}
          </div>
        </section>
      )}

      {skills.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">OpenClaw Skills</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((s) => <SkillCard key={s.slug} skill={s} />)}
          </div>
        </section>
      )}
    </div>
  );
}
