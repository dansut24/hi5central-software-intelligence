import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function normaliseVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^v/i, "")
    .replace(/^release-/i, "");
}

function compareVersions(a, b) {
  const aa = normaliseVersion(a).split(/[.\-_]/).map((x) => Number.parseInt(x, 10));
  const bb = normaliseVersion(b).split(/[.\-_]/).map((x) => Number.parseInt(x, 10));

  const length = Math.max(aa.length, bb.length);

  for (let i = 0; i < length; i++) {
    const av = Number.isFinite(aa[i]) ? aa[i] : 0;
    const bv = Number.isFinite(bb[i]) ? bb[i] : 0;

    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const installed = Array.isArray(body.installed) ? body.installed : [];

    const wingetIds = installed
      .map((item) => item.winget_id)
      .filter(Boolean);

    if (wingetIds.length === 0) {
      return NextResponse.json({
        ok: true,
        count: 0,
        updates: [],
      });
    }

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("software_catalogue")
      .select(`
        id,
        name,
        vendor,
        winget_id,
        category,
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
        ),
        software_detection_rules (
        platform,
        method,
        registry_hive,
        registry_path,
        registry_value,
        file_path,
        version_command
        )
      `)
      .in("winget_id", wingetIds)
      .eq("active", true);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const updates = [];

    for (const app of data || []) {
      const installedItem = installed.find((item) => item.winget_id === app.winget_id);
      const latest = app.software_versions?.[0];
      const installer = app.software_installers?.find(
        (item) => item.validation_status === "ready"
      );

      if (!installedItem || !latest || !latest.version || !installer) {
        continue;
      }

      const comparison = compareVersions(installedItem.version, latest.version);

      if (comparison < 0) {
        updates.push({
  software_id: app.id,
  name: app.name,
  vendor: app.vendor,
  winget_id: app.winget_id,
  installed_version: installedItem.version,
  latest_version: latest.version,
  release_url: latest.release_url,
  installer_type: installer.installer_type,
  download_url: installer.resolved_download_url || installer.download_url,
  silent_install_args: installer.silent_install_args,
  silent_uninstall_args: installer.silent_uninstall_args,
  detection_rule: app.software_detection_rules?.[0] || null,
});
      }
    }

    return NextResponse.json({
      ok: true,
      count: updates.length,
      updates,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}