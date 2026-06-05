import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("software_detection_rules")
    .select(`
      id,
      platform,
      method,
      registry_hive,
      registry_path,
      registry_value,
      file_path,
      version_command,
      created_at,
      updated_at,
      software_catalogue (
        id,
        name,
        vendor,
        winget_id,
        category
      )
    `)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: data?.length || 0,
    rules: data || [],
  });
}