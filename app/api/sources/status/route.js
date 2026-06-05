import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("software_catalogue")
    .select(`
      id,
      name,
      vendor,
      winget_id,
      category,
      homepage_url,
      software_sources (
        id,
        source_name,
        source_type,
        enabled,
        source_check_runs (
          status,
          message,
          checked_at
        )
      ),
      software_versions (
        version,
        release_url,
        discovered_at
      )
    `)
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: data?.length || 0,
    apps: data || [],
  });
}