import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getBulkImportPack } from "@/lib/bulk-import";
import { getWingetPackageDetails } from "@/lib/winget";
import { getGithubReleaseDetails } from "@/lib/github";
import { getChocolateyPackageDetails } from "@/lib/chocolatey";

export const dynamic = "force-dynamic";

function looksLikeInstaller(url = "") {
  const clean = url.toLowerCase().split("?")[0];

  return (
    clean.endsWith(".msi") ||
    clean.endsWith(".exe") ||
    clean.endsWith(".msix") ||
    clean.endsWith(".zip")
  );
}

function contentLooksLikeInstaller(contentType = "") {
  const ct = contentType.toLowerCase();

  return (
    ct.includes("application/octet-stream") ||
    ct.includes("application/x-msdownload") ||
    ct.includes("application/x-msi") ||
    ct.includes("application/x-msdos-program") ||
    ct.includes("application/zip") ||
    ct.includes("binary")
  );
}

async function validateUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok || res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        signal: controller.signal,
      });
    }

    const finalUrl = res.url || url;
    const contentType = res.headers.get("content-type") || "";
    const contentLength = res.headers.get("content-length") || "";

    const direct =
      looksLikeInstaller(finalUrl) ||
      looksLikeInstaller(url) ||
      contentLooksLikeInstaller(contentType);

    let validationStatus = "broken";
    let validationMessage = `Download failed with HTTP ${res.status}`;

    if (res.ok && direct) {
      validationStatus = "ready";
      validationMessage = "Installer validated";
    } else if (res.ok && !direct) {
      validationStatus = "needs_resolver";
      validationMessage = `URL resolved but is not a direct installer: ${
        contentType || "unknown content type"
      }`;
    }

    return {
      ok: res.ok,
      status: res.status,
      finalUrl,
      contentType,
      contentLength,
      direct,
      validationStatus,
      validationMessage,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getPackageDetails(item) {
  if (item.provider === "winget") {
    const pkg = await getWingetPackageDetails(item.id);

    return {
      provider: "winget",
      sourceName: "Winget",
      sourceType: "winget",
      catalogueId: pkg.winget_id,
      packageId: pkg.winget_id,
      name: pkg.name,
      vendor: pkg.vendor,
      version: pkg.version,
      homepage_url: pkg.homepage_url,
      release_url: pkg.source_url,
      installer_type: pkg.installer_type,
      download_url: pkg.download_url,
      silent_install_args: pkg.silent_install_args,
      silent_uninstall_args: pkg.silent_uninstall_args,
      checksum: pkg.checksum || null,
      checksum_type: pkg.checksum_type || null,
      resolver_metadata: {
        source: "winget",
        manifest: pkg.manifest_metadata || {},
      },
      source_metadata: {
        winget_id: pkg.winget_id,
        source_url: pkg.source_url,
      },
    };
  }

  if (item.provider === "github") {
    const pkg = await getGithubReleaseDetails(item.id);

    return {
      provider: "github",
      sourceName: "GitHub",
      sourceType: "github",
      catalogueId: `github.${pkg.package_id.replace("/", ".")}`,
      packageId: pkg.package_id,
      name: pkg.name,
      vendor: pkg.vendor,
      version: pkg.version,
      homepage_url: pkg.homepage_url,
      release_url: pkg.release_url,
      installer_type: pkg.installer_type,
      download_url: pkg.download_url,
      silent_install_args: pkg.silent_install_args,
      silent_uninstall_args: pkg.silent_uninstall_args,
      checksum: null,
      checksum_type: null,
      resolver_metadata: {
        source: "github",
        package_id: pkg.package_id,
        asset_name: pkg.asset_name,
      },
      source_metadata: {
        package_id: pkg.package_id,
        release_url: pkg.release_url,
        asset_name: pkg.asset_name,
      },
    };
  }

  if (item.provider === "chocolatey") {
    const pkg = await getChocolateyPackageDetails(item.id);

    return {
      provider: "chocolatey",
      sourceName: "Chocolatey",
      sourceType: "chocolatey",
      catalogueId: `choco.${pkg.package_id}`,
      packageId: pkg.package_id,
      name: pkg.name,
      vendor: pkg.vendor,
      version: pkg.version,
      homepage_url: pkg.homepage_url,
      release_url: pkg.release_url,
      installer_type: "choco",
      download_url: pkg.download_url,
      silent_install_args: pkg.silent_install_args,
      silent_uninstall_args: pkg.silent_uninstall_args,
      checksum: null,
      checksum_type: null,
      resolver_metadata: {
        source: "chocolatey",
        package_id: pkg.package_id,
      },
      source_metadata: {
        package_id: pkg.package_id,
        release_url: pkg.release_url,
      },
    };
  }

  throw new Error(`Unsupported provider: ${item.provider}`);
}

async function importOne(supabase, item) {
  const pkg = await getPackageDetails(item);

  const { data: app, error: appError } = await supabase
    .from("software_catalogue")
    .upsert(
      {
        name: pkg.name,
        vendor: pkg.vendor,
        winget_id: pkg.catalogueId,
        category: item.category || "Imported",
        homepage_url: pkg.homepage_url || null,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "winget_id" }
    )
    .select()
    .single();

  if (appError) {
    throw new Error(appError.message);
  }

  await supabase
    .from("software_versions")
    .upsert(
      {
        software_id: app.id,
        version: pkg.version,
        release_url: pkg.release_url || null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "software_id,version" }
    );

  await supabase
    .from("software_sources")
    .upsert(
      {
        software_id: app.id,
        source_name: pkg.sourceName,
        source_type: pkg.sourceType,
        enabled: true,
        metadata: pkg.source_metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "software_id,source_type" }
    );

  let check = {
    validationStatus: "ready",
    validationMessage: `${pkg.sourceName} package imported`,
    finalUrl: pkg.download_url,
    contentType: `${pkg.sourceType}/package`,
    contentLength: null,
    direct: true,
  };

  if (pkg.provider !== "chocolatey") {
    check = await validateUrl(pkg.download_url);
  }

  const { data: installer, error: installerError } = await supabase
    .from("software_installers")
    .upsert(
      {
        software_id: app.id,
        provider: pkg.provider,
        platform: "windows",
        architecture: "x64",
        installer_type: pkg.installer_type,
        download_url: pkg.download_url,
        resolved_download_url: check.finalUrl,
        resolved_content_type: check.contentType,
        resolved_content_length: check.contentLength,
        download_resolver: pkg.provider === "chocolatey" ? "chocolatey" : "direct_url",
        resolver_metadata: pkg.resolver_metadata,
        silent_install_args: pkg.silent_install_args,
        silent_uninstall_args: pkg.silent_uninstall_args,
        checksum: pkg.checksum,
        checksum_type: pkg.checksum_type,
        validation_status: check.validationStatus,
        validation_message: check.validationMessage,
        validated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "software_id,platform,architecture" }
    )
    .select()
    .single();

  if (installerError) {
    throw new Error(installerError.message);
  }

  return {
    ok: true,
    provider: pkg.provider,
    software_id: app.id,
    installer_id: installer.id,
    name: app.name,
    vendor: app.vendor,
    winget_id: app.winget_id,
    version: pkg.version,
    validation_status: check.validationStatus,
    validation_message: check.validationMessage,
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    packs: Object.entries((await import("@/lib/bulk-import")).BULK_IMPORT_PACKS).map(
      ([key, pack]) => ({
        key,
        label: pack.label,
        description: pack.description,
        count: pack.items.length,
        items: pack.items,
      })
    ),
  });
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const packName = body.pack || "essentials";
    const limit = Math.min(Number(body.limit || 100), 100);

    const pack = getBulkImportPack(packName);
    const items = pack.items.slice(0, limit);
    const supabase = supabaseAdmin();

    const results = [];

    for (const item of items) {
      try {
        const result = await importOne(supabase, item);
        results.push(result);
      } catch (error) {
        results.push({
          ok: false,
          provider: item.provider,
          package_id: item.id,
          category: item.category,
          error: error.message || String(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      pack: packName,
      label: pack.label,
      count: results.length,
      successCount: results.filter((item) => item.ok).length,
      failedCount: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}