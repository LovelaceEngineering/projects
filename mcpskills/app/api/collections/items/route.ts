import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST /api/collections/items — add item to collection
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collection_id, item_slug, item_type } = await req.json();
  if (!collection_id || !item_slug || !item_type) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Verify user owns this collection
  const { data: col } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collection_id)
    .eq("user_id", user.id)
    .single();
  if (!col) return NextResponse.json({ error: "Collection not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("collection_items")
    .upsert({ collection_id, item_slug, item_type }, { onConflict: "collection_id,item_slug,item_type" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}

// DELETE /api/collections/items — remove item from collection
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collection_id, item_slug, item_type } = await req.json();

  // Verify ownership
  const { data: col } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collection_id)
    .eq("user_id", user.id)
    .single();
  if (!col) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await supabase
    .from("collection_items")
    .delete()
    .eq("collection_id", collection_id)
    .eq("item_slug", item_slug)
    .eq("item_type", item_type);

  return NextResponse.json({ ok: true });
}
