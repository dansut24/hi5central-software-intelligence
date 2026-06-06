import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("software_research_queue")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status,
    count: data?.length || 0,
    rows: data || [],
  });
}