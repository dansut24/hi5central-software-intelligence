import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { STARTER_DETECTION_RULES } from "@/lib/detection-rules";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseAdmin();
  const results = [];

  for (const rule of STARTER_DETECTION_RULES) {
    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .select("id, name, winget_id")
      .eq("winget_id", rule.winget_id)
      .single();

    if (appError || !app) {
      results.push({
        winget_id: rule.winget_id,
        ok: false,
        error: appError?.message || "Software not found",
      });
      continue;
    }

    const { error } = await supabase
      .from("software_detection_rules")
      .upsert(
        {
          software_id: app.id,
          platform: rule.platform || "windows",
          method: rule.method,
          registry_hive: rule.registry_hive || null,
          registry_path: rule.registry_path || null,
          registry_value: rule.registry_value || null,
          file_path: rule.file_path || null,
          version_command: rule.version_command || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "software_id,platform,method" }
      );

    results.push({
      name: app.name,
      winget_id: app.winget_id,
      method: rule.method,
      ok: !error,
      error: error?.message || null,
    });
  }

  return NextResponse.json({
    ok: true,
    count: results.length,
    results,
  });
}