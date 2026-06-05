import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWingetPackageDetails } from "@/lib/winget";

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

    const pkg = await getWingetPackageDetails(wingetId);
    const supabase = supabaseAdmin();

    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .upsert(
        {
          name: pkg.name,
          vendor: pkg.vendor,
          winget_id: pkg.winget_id,
          category: body.category || "Imported",
          homepage_url: pkg.homepage_url || null,
          active: true,
        },
        { onConflict: "winget_id" }
      )
      .select()
      .single();

    if (appError) {
      return NextResponse.json(
        { ok: false, error: appError.message },
        { status: 500 }
      );
    }

    await supabase.from("software_versions").insert({
      software_id: app.id,
      version: pkg.version,
      release_url: pkg.source_url,
    });

    const check = await validateUrl(pkg.download_url);

    const { data: installer, error: installerError } = await supabase
      .from("software_installers")
      .upsert(
        {
          software_id: app.id,
          platform: "windows",
          architecture: "x64",
          installer_type: pkg.installer_type,
          download_url: pkg.download_url,
          resolved_download_url: check.finalUrl,
          resolved_content_type: check.contentType,
          resolved_content_length: check.contentLength,
          download_resolver: "direct_url",
          resolver_metadata: {},
          silent_install_args: pkg.silent_install_args,
          silent_uninstall_args: pkg.silent_uninstall_args,
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
      return NextResponse.json(
        { ok: false, error: installerError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      imported: {
        software_id: app.id,
        name: app.name,
        vendor: app.vendor,
        winget_id: app.winget_id,
        version: pkg.version,
        installer_type: pkg.installer_type,
        download_url: pkg.download_url,
        source_url: pkg.source_url,
      },
      validation: {
        installer_id: installer.id,
        status: check.validationStatus,
        message: check.validationMessage,
        final_url: check.finalUrl,
        content_type: check.contentType,
        content_length: check.contentLength,
        direct: check.direct,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}