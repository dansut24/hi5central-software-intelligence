import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");

  return new RegExp(`^${escaped}$`, "i");
}

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

async function resolveGithubAsset(metadata) {
  const owner = metadata?.owner;
  const repo = metadata?.repo;
  const assetPattern = metadata?.assetPattern;

  if (!owner || !repo || !assetPattern) {
    throw new Error("github_asset requires owner, repo and assetPattern");
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Hi5Central-Software-Intelligence",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub latest release failed: HTTP ${res.status}`);
  }

  const release = await res.json();
  const regex = wildcardToRegex(assetPattern);

  const asset = (release.assets || []).find((item) => regex.test(item.name));

  if (!asset) {
    const available = (release.assets || []).map((item) => item.name).join(", ");
    throw new Error(`No asset matched ${assetPattern}. Available: ${available}`);
  }

  return {
    url: asset.browser_download_url,
    assetName: asset.name,
    releaseUrl: release.html_url,
  };
}

async function resolveDownloadUrl(installer) {
  if (installer.download_resolver === "github_asset") {
    return resolveGithubAsset(installer.resolver_metadata || {});
  }

  return {
    url: installer.download_url,
    assetName: null,
    releaseUrl: null,
  };
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
      direct:
        looksLikeInstaller(finalUrl) ||
        looksLikeInstaller(url) ||
        contentLooksLikeInstaller(contentType),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 25), 50);

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("software_installers")
    .select(`
      id,
      download_url,
      download_resolver,
      resolver_metadata,
      installer_type,
      software_catalogue (
        name,
        winget_id
      )
    `)
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results = [];

  for (const installer of data || []) {
    try {
      const resolved = await resolveDownloadUrl(installer);
      const check = await validateUrl(resolved.url);

      results.push({
        status: check.ok && check.direct ? "success" : "failed",
        name: installer.software_catalogue?.name,
        winget_id: installer.software_catalogue?.winget_id,
        installer_type: installer.installer_type,
        resolver: installer.download_resolver || "direct_url",
        assetName: resolved.assetName,
        downloadUrl: installer.download_url,
        resolvedDownloadUrl: resolved.url,
        releaseUrl: resolved.releaseUrl,
        finalUrl: check.finalUrl,
        httpStatus: check.status,
        contentType: check.contentType,
        contentLength: check.contentLength,
        direct: check.direct,
      });
    } catch (err) {
      results.push({
        status: "failed",
        name: installer.software_catalogue?.name,
        winget_id: installer.software_catalogue?.winget_id,
        installer_type: installer.installer_type,
        resolver: installer.download_resolver || "direct_url",
        downloadUrl: installer.download_url,
        error: err.message,
        direct: false,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    count: results.length,
    directCount: results.filter((r) => r.direct).length,
    nonDirectCount: results.filter((r) => !r.direct).length,
    results,
  });
}