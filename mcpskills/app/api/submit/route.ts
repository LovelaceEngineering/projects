import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const githubUrl = formData.get("githubUrl") as string;
    const category = formData.get("category") as string;
    const description = formData.get("description") as string;
    const email = formData.get("email") as string;

    if (!githubUrl || !category || !description) {
      return NextResponse.redirect(new URL("/submit?error=missing", req.url));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      await fetch(`${supabaseUrl}/rest/v1/submissions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ github_url: githubUrl, category, description, submitter_email: email || null }),
      });
    }

    return NextResponse.redirect(new URL("/submit?success=1", req.url));
  } catch {
    return NextResponse.redirect(new URL("/submit?error=1", req.url));
  }
}
