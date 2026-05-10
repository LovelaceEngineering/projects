"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut, User, BookMarked, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export function AuthButton() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signIn() {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    setOpen(false);
    setUser(null);
  }

  if (loading) return <div className="w-8 h-8 rounded-full bg-card-border animate-pulse" />;

  if (!user) {
    return (
      <button
        onClick={signIn}
        className="flex items-center gap-2 text-sm text-muted hover:text-foreground border border-card-border hover:border-brand-500 px-3 py-1.5 rounded-lg transition-all"
      >
        <LogIn size={15} />
        <span className="hidden sm:inline">Sign in</span>
      </button>
    );
  }

  const avatar = user.user_metadata?.avatar_url;
  const name = user.user_metadata?.user_name || user.user_metadata?.name || user.email;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 border border-card-border hover:border-brand-500 rounded-lg px-2 py-1.5 transition-all"
      >
        {avatar ? (
          <img src={avatar} alt={name} className="w-6 h-6 rounded-full" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-brand-600 flex items-center justify-center">
            <User size={12} className="text-white" />
          </div>
        )}
        <ChevronDown size={14} className="text-muted" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-52 bg-card border border-card-border rounded-xl shadow-xl py-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-card-border">
              <p className="text-sm font-medium text-foreground truncate">{name}</p>
              <p className="text-xs text-muted truncate">{user.email}</p>
            </div>
            <Link
              href="/collections"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:text-foreground hover:bg-badge-bg transition-colors"
            >
              <BookMarked size={15} /> My Collections
            </Link>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-muted hover:text-foreground hover:bg-badge-bg transition-colors"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
