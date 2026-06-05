import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function buildInstallCommand(installer) {
  if (installer.installer_type === "msi") {
    return {
      executable: "msiexec.exe",
      args: `/i "{installer_path}" ${installer.silent_install_args || ""}`.trim(),
    };
  }

  return {
    executable: "installer",
    args: `"{installer_path}" ${installer.silent_install_args || ""}`.trim(),
  };
}

function buildPlan(app) {
  const latest = app.software_versions?.[0];
  const installer = app.software_installers?.find(
    (item) => item.validation_status === "ready"
  );
  const detectionRule = app.software_detection_rules?.[0] || null;

  if (!latest || !installer) return null;

  return {
    software_id: app.id,
    name: app.name,
    vendor: app.vendor,
    winget_id: app.winget_id,
    target_version: latest.version,
    release_url: latest.release_url,
    platform: installer.platform,
    architecture: installer.architecture,
    installer_type: installer.installer_type,
    download_url: installer.resolved_download_url || installer.download_url,
    install_command: buildInstallCommand(installer),
    uninstall_command: {
      args: installer.silent_uninstall_args,
    },
    detection_rule: detectionRule,
    verification: {
      expected_version: latest.version,
      method: detectionRule?.method || null,
    },
  };
}

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
    .eq("active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const plans = (data || []).map(buildPlan).filter(Boolean);

  return NextResponse.json({
    ok: true,
    count: plans.length,
    plans,
  });
}