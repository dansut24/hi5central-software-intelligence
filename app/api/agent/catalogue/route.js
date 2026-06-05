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
      software_versions (
        version,
        release_url,
        discovered_at
      ),
      software_installers (
        platform,
        architecture,
        installer_type,
        download_url,
        resolved_download_url,
        silent_install_args,
        silent_uninstall_args,
        validation_status
      )
    `)
    .eq("active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: data?.length || 0,
    catalogue: data || [],
  });
}