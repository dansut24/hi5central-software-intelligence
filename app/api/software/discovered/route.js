import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items : [body];

    const rows = items
      .filter((item) => item.name)
      .map((item) => ({
        device_id: item.device_id || body.device_id || null,
        tenant_id: item.tenant_id || body.tenant_id || null,
        name: item.name,
        vendor: item.vendor || null,
        installed_version: item.installed_version || item.version || null,
        install_location: item.install_location || null,
        uninstall_string: item.uninstall_string || null,
        quiet_uninstall_string: item.quiet_uninstall_string || null,
        registry_hive: item.registry_hive || null,
        registry_path: item.registry_path || null,
        status: "pending",
        raw: item,
        updated_at: new Date().toISOString(),
      }));

    if (!rows.length) {
      return NextResponse.json(
        { ok: false, error: "At least one discovered item with name is required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("software_discovery_queue")
      .insert(rows)
      .select();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: data.length,
      queued: data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}