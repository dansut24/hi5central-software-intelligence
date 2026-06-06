import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWingetPackageDetails } from "@/lib/winget";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const wingetId = body.winget_id;

    if (!wingetId) {
      return NextResponse.json(
        { ok: false, error: "winget_id is required" },
        { status: 400 }
      );
    }

    const pkg = await getWingetPackageDetails(wingetId);
    const supabase = supabaseAdmin();

    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .upsert(
        {
          name: pkg.name,
          vendor: pkg.vendor,
          winget_id: pkg.winget_id,
          category: body.category || "Imported",
          homepage_url: pkg.homepage_url || null,
          active: true,
        },
        { onConflict: "winget_id" }
      )
      .select()
      .single();

    if (appError) {
      return NextResponse.json(
        { ok: false, error: appError.message },
        { status: 500 }
      );
    }

    const { error: versionError } = await supabase
  .from("software_versions")
  .upsert(
    {
      software_id: app.id,
      version: pkg.version,
      release_url: pkg.source_url || null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "software_id,version" }
  );

const { error: sourceError } = await supabase
  .from("software_sources")
  .upsert(
    {
      software_id: app.id,
      source_name: "Winget",
      source_type: "winget",
      enabled: true,
      metadata: {
        winget_id: pkg.winget_id,
        source_url: pkg.source_url,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "software_id,source_type" }
  );

const { error: installerError } = await supabase
      .from("software_installers")
      .upsert(
        {
          software_id: app.id,
          provider: "winget",
          platform: "windows",
          architecture: "x64",
          installer_type: pkg.installer_type,
          download_url: pkg.download_url,
          download_resolver: "direct_url",
          resolver_metadata: {},
          silent_install_args: pkg.silent_install_args,
          silent_uninstall_args: pkg.silent_uninstall_args,
          validation_status: "pending",
          validation_message: "Imported from Winget; validate download before agent use",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "software_id,platform,architecture" }
      );

    return NextResponse.json({
      ok: true,
      imported: {
        software_id: app.id,
        name: app.name,
        vendor: app.vendor,
        winget_id: app.winget_id,
        version: pkg.version,
        installer_type: pkg.installer_type,
        download_url: pkg.download_url,
        source_url: pkg.source_url,
      },
      warnings: [
  versionError ? `Version upsert failed: ${versionError.message}` : null,
  sourceError ? `Source upsert failed: ${sourceError.message}` : null,
  installerError ? `Installer upsert failed: ${installerError.message}` : null,
].filter(Boolean),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}