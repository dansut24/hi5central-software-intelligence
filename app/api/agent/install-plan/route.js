import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`, "i");
}

async function resolveGithubAsset(metadata) {
  const owner = metadata?.owner;
  const repo = metadata?.repo;
  const assetPattern = metadata?.assetPattern;

  if (!owner || !repo || !assetPattern) {
    throw new Error("github_asset requires owner, repo and assetPattern");
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/latest`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Hi5Central-Software-Intelligence",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub latest release failed: HTTP ${res.status}`);
  }

  const release = await res.json();
  const regex = wildcardToRegex(assetPattern);

  const asset = (release.assets || []).find((item) => regex.test(item.name));

  if (!asset) {
    throw new Error(`No GitHub asset matched ${assetPattern}`);
  }

  return asset.browser_download_url;
}

async function getFreshDownloadUrl(installer) {
  if (installer.download_resolver === "github_asset") {
    return resolveGithubAsset(installer.resolver_metadata || {});
  }

  return installer.resolved_download_url || installer.download_url;
}

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

export async function POST(request) {
  try {
    const body = await request.json();
    const wingetId = body.winget_id;

    if (!wingetId) {
      return NextResponse.json(
        { ok: false, error: "winget_id is required" },
        { status: 400 }
      );
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
          download_resolver,
          resolver_metadata,
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
      .eq("winget_id", wingetId)
      .eq("active", true)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message || "Software not found" },
        { status: 404 }
      );
    }

    const latest = data.software_versions?.[0];
    const installer = data.software_installers?.find(
      (item) => item.validation_status === "ready"
    );
    const detectionRule = data.software_detection_rules?.[0] || null;

    if (!latest) {
      return NextResponse.json(
        { ok: false, error: "No latest version available" },
        { status: 409 }
      );
    }

    if (!installer) {
      return NextResponse.json(
        { ok: false, error: "No ready installer available" },
        { status: 409 }
      );
    }

    const downloadUrl = await getFreshDownloadUrl(installer);

    return NextResponse.json({
      ok: true,
      plan: {
        software_id: data.id,
        name: data.name,
        vendor: data.vendor,
        winget_id: data.winget_id,
        target_version: latest.version,
        release_url: latest.release_url,
        platform: installer.platform,
        architecture: installer.architecture,
        installer_type: installer.installer_type,
        download_url: downloadUrl,
        install_command: buildInstallCommand(installer),
        uninstall_command: {
          args: installer.silent_uninstall_args,
        },
        detection_rule: detectionRule,
        verification: {
          expected_version: latest.version,
          method: detectionRule?.method || null,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}