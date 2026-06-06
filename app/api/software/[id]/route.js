import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    const params = await context.params;
    const id = params.id;
    const supabase = supabaseAdmin();

    const { data: software, error: softwareError } = await supabase
      .from("software_catalogue")
      .select("*")
      .eq("id", id)
      .single();

    if (softwareError || !software) {
      return NextResponse.json(
        {
          ok: false,
          error: softwareError?.message || "Software not found",
        },
        { status: 404 }
      );
    }

    const [
      versionsResult,
      installersResult,
      detectionRulesResult,
      sourcesResult,
    ] = await Promise.all([
      supabase
        .from("software_versions")
        .select("*")
        .eq("software_id", id)
        .order("created_at", { ascending: false }),

      supabase
        .from("software_installers")
        .select("*")
        .eq("software_id", id)
        .order("updated_at", { ascending: false }),

      supabase
        .from("software_detection_rules")
        .select("*")
        .eq("software_id", id)
        .order("updated_at", { ascending: false }),

      supabase
        .from("software_sources")
        .select(`
          *,
          source_check_runs (
            id,
            status,
            detected_version,
            release_url,
            error_message,
            checked_at
          )
        `)
        .eq("software_id", id)
        .order("updated_at", { ascending: false }),
    ]);

    return NextResponse.json({
      ok: true,
      software,
      versions: versionsResult.data || [],
      installers: installersResult.data || [],
      detection_rules: detectionRulesResult.data || [],
      sources: (sourcesResult.data || []).map((source) => ({
        ...source,
        source_check_runs: (source.source_check_runs || []).sort(
          (a, b) => new Date(b.checked_at || 0) - new Date(a.checked_at || 0)
        ),
      })),
      errors: [
        versionsResult.error
          ? `Versions: ${versionsResult.error.message}`
          : null,
        installersResult.error
          ? `Installers: ${installersResult.error.message}`
          : null,
        detectionRulesResult.error
          ? `Detection rules: ${detectionRulesResult.error.message}`
          : null,
        sourcesResult.error ? `Sources: ${sourcesResult.error.message}` : null,
      ].filter(Boolean),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}