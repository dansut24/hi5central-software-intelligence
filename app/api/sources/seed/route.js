import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { STARTER_SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const supabase = supabaseAdmin();
  const results = [];

  for (const item of STARTER_SOURCES) {
    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .upsert(
        {
          name: item.name,
          vendor: item.vendor,
          winget_id: item.winget_id,
          category: item.category,
          homepage_url: item.homepage_url,
          active: true,
        },
        { onConflict: "winget_id" }
      )
      .select()
      .single();

    if (appError) {
      results.push({ name: item.name, ok: false, error: appError.message });
      continue;
    }

    const { error: sourceError } = await supabase
      .from("software_sources")
      .insert({
        software_id: app.id,
        source_name: item.source_name,
        source_type: item.source_type,
        enabled: true,
        metadata: item.metadata,
      });

    results.push({
      name: item.name,
      ok: !sourceError,
      error: sourceError?.message || null,
    });
  }

  return NextResponse.json({
    ok: true,
    count: results.length,
    results,
  });
}