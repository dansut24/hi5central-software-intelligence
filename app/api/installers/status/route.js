import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("software_installers")
    .select(`
      id,
      platform,
      architecture,
      installer_type,
      download_url,
      silent_install_args,
      silent_uninstall_args,
      checksum,
      checksum_type,
      requires_reboot,
      created_at,
      updated_at,
      software_catalogue (
        id,
        name,
        vendor,
        winget_id,
        category,
        homepage_url
      )
    `)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    count: data?.length || 0,
    installers: data || [],
  });
}