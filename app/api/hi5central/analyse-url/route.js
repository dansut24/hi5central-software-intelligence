import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const KNOWN_VENDOR_MATCHERS = [
  {
    test: (url) => url.includes("dl.google.com/chrome/install/googlechromestandaloneenterprise64.msi"),
    draft: {
      name: "Google Chrome Enterprise",
      vendor: "Google",
      winget_id: "hi5central.google-chrome-enterprise",
      category: "Browser",
      homepage_url: "https://chromeenterprise.google/browser/download/",
      release_url: "https://chromereleases.googleblog.com/",
      detection_rule: {
        method: "registry",
        registry_hive: "HKLM",
        registry_path: "SOFTWARE\\Google\\Chrome\\BLBeacon",
        registry_value: "version",
      },
    },
  },
  {
    test: (url) => url.includes("go.microsoft.com/fwlink/?linkid=2093437"),
    draft: {
      name: "Microsoft Edge Enterprise",
      vendor: "Microsoft",
      winget_id: "hi5central.microsoft-edge-enterprise",
      category: "Browser",
      homepage_url: "https://www.microsoft.com/edge/business/download",
      release_url: "https://learn.microsoft.com/deployedge/microsoft-edge-relnote-stable-channel",
      detection_rule: {
        method: "registry",
        registry_hive: "HKLM",
        registry_path: "SOFTWARE\\Microsoft\\Edge\\BLBeacon",
        registry_value: "version",
      },
    },
  },
];

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
    
    const knownMatch = KNOWN_VENDOR_MATCHERS.find((matcher) =>
  matcher.test(url) || matcher.test(check.finalUrl || "")
);

    const name = body.name || knownMatch?.draft?.name || inferNameFromUrl(check.finalUrl || url);
const vendor = body.vendor || knownMatch?.draft?.vendor || inferVendorFromUrl(check.finalUrl || url);

    const draft = {
      name,
      vendor,
      winget_id: body.winget_id || knownMatch?.draft?.winget_id || buildWingetStyleId(name),
category: body.category || knownMatch?.draft?.category || "Hi5Central",
homepage_url: body.homepage_url || knownMatch?.draft?.homepage_url || null,
release_url: body.release_url || knownMatch?.draft?.release_url || null,
detection_rule: body.detection_rule || knownMatch?.draft?.detection_rule || {
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