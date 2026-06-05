import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { STARTER_INSTALLERS } from "@/lib/installers";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseAdmin();
  const results = [];

  for (const installer of STARTER_INSTALLERS) {
    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .select("id, name, winget_id")
      .eq("winget_id", installer.winget_id)
      .single();

    if (appError || !app) {
      results.push({
        winget_id: installer.winget_id,
        ok: false,
        error: appError?.message || "Software not found",
      });
      continue;
    }

    const { error } = await supabase
      .from("software_installers")
      .upsert(
        {
          software_id: app.id,
          platform: installer.platform || "windows",
          architecture: installer.architecture || "x64",
          installer_type: installer.installer_type,
          download_url: installer.download_url,
          download_resolver: installer.download_resolver || "direct_url",
resolver_metadata: installer.resolver_metadata || {},
          silent_install_args: installer.silent_install_args,
          silent_uninstall_args: installer.silent_uninstall_args,
          checksum: installer.checksum || null,
          checksum_type: installer.checksum_type || null,
          requires_reboot: installer.requires_reboot || false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "software_id,platform,architecture" }
      );

    results.push({
      name: app.name,
      winget_id: app.winget_id,
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