import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

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

function inferInstallerType(url = "", contentType = "") {
  const clean = url.toLowerCase().split("?")[0];
  const ct = contentType.toLowerCase();

  if (clean.endsWith(".msi") || ct.includes("application/x-msi")) return "msi";
  if (clean.endsWith(".msix")) return "msix";
  if (clean.endsWith(".zip") || ct.includes("application/zip")) return "zip";
  if (clean.endsWith(".exe")) return "exe";

  return "exe";
}

function inferSilentInstallArgs(installerType) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Add-AppxPackage";
  if (installerType === "zip") return "extract";
  return "/S";
}

function inferSilentUninstallArgs(installerType) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Remove-AppxPackage";
  if (installerType === "zip") return "";
  return "/S";
}

function inferNameFromUrl(url = "") {
  try {
    const parsed = new URL(url);
    const file = parsed.pathname.split("/").filter(Boolean).pop() || "";
    const clean = decodeURIComponent(file)
      .replace(/\.(exe|msi|msix|zip)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return clean || parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Vendor App";
  }
}

function inferVendorFromUrl(url = "") {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".");
    return parts[0]
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "";
  }
}

function buildWingetStyleId(name = "") {
  return `hi5central.${String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
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

    return {
      ok: res.ok,
      status: res.status,
      finalUrl,
      contentType,
      contentLength,
      direct: looksLikeInstaller(finalUrl) || looksLikeInstaller(url),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const url = body.url;

    if (!url) {
      return NextResponse.json(
        { ok: false, error: "url is required" },
        { status: 400 }
      );
    }

    const check = await validateUrl(url);
    const installerType = inferInstallerType(check.finalUrl, check.contentType);

    const name = body.name || inferNameFromUrl(check.finalUrl || url);
    const vendor = body.vendor || inferVendorFromUrl(check.finalUrl || url);

    const draft = {
      name,
      vendor,
      winget_id: body.winget_id || buildWingetStyleId(name),
      version: body.version || "latest",
      category: body.category || "Hi5Central",
      homepage_url: body.homepage_url || null,
      release_url: body.release_url || null,
      installer_type: installerType,
      download_url: check.finalUrl || url,
      silent_install_args:
        body.silent_install_args || inferSilentInstallArgs(installerType),
      silent_uninstall_args:
        body.silent_uninstall_args || inferSilentUninstallArgs(installerType),
      detection_rule: body.detection_rule || {
        method: "file",
        file_path: `C:\\Program Files\\${name}\\${name}.exe`,
      },
      version_source: {
        strategy: "manual_review",
        analysed_url: url,
        final_url: check.finalUrl,
      },
    };

    return NextResponse.json({
      ok: true,
      confidence: check.direct ? 0.75 : 0.45,
      direct: check.direct,
      validation_probe: {
        status: check.status,
        final_url: check.finalUrl,
        content_type: check.contentType,
        content_length: check.contentLength,
      },
      draft,
      warnings: [
        !check.direct ? "URL does not look like a direct installer." : null,
        draft.version === "latest" ? "Version could not be detected automatically." : null,
        "Review silent install/uninstall arguments before import.",
        "Review detection rule before import.",
      ].filter(Boolean),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}