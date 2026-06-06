import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "name",
  "vendor",
  "category",
  "homepage_url",
  "release_url",
  "download_url",
  "installer_type",
  "silent_install_args",
  "silent_uninstall_args",
  "detection_method",
  "detection_value",
  "notes",
];

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = body.id;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id is required" },
        { status: 400 }
      );
    }

    const updates = {};

    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field] || null;
      }
    }

    updates.status = body.status || "pending";
    updates.confidence = null;
    updates.researched_at = null;
    updates.updated_at = new Date().toISOString();

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("software_research_queue")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      row: data,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}