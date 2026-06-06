import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("software_installers")
    .select(`
      id,
      provider,
platform,
architecture,
installer_type,
download_url,
download_resolver,
resolver_metadata,
silent_install_args,
silent_uninstall_args,
checksum,
checksum_type,
requires_reboot,
validation_status,
validation_message,
validated_at,
resolved_download_url,
resolved_content_type,
resolved_content_length,
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