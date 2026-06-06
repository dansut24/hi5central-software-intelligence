import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
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
  const res = await fetch(
    `https://api.github.com/repos/${metadata.owner}/${metadata.repo}/releases/latest`,
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
  const regex = wildcardToRegex(metadata.assetPattern);

  const asset = (release.assets || []).find((item) => regex.test(item.name));

  if (!asset) {
    throw new Error(
      `No asset matched ${metadata.assetPattern}. Available: ${(release.assets || [])
        .map((item) => item.name)
        .join(", ")}`
    );
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

    const direct =
      looksLikeInstaller(finalUrl) ||
      looksLikeInstaller(url) ||
      contentLooksLikeInstaller(contentType);

    return {
      ok: res.ok,
      status: res.status,
      finalUrl,
      contentType,
      contentLength,
      direct,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getValidationStatus(check) {
  if (check.ok && check.direct) return "ready";
  if (check.ok && !check.direct) return "needs_resolver";
  return "broken";
}

export async function GET(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 25), 100);

  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("software_installers")
    .select(`
      id,
      provider,
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
      if (installer.provider === "chocolatey" || installer.download_resolver === "chocolatey") {
        await supabase
          .from("software_installers")
          .update({
            validation_status: "ready",
            validation_message: "Chocolatey package imported; requires Chocolatey on endpoint",
            validated_at: new Date().toISOString(),
          })
          .eq("id", installer.id);

        results.push({
          status: "ready",
          provider: installer.provider || "chocolatey",
          name: installer.software_catalogue?.name,
          winget_id: installer.software_catalogue?.winget_id,
          installer_type: installer.installer_type,
          resolver: installer.download_resolver || "chocolatey",
          downloadUrl: installer.download_url,
          finalUrl: installer.download_url,
          httpStatus: 200,
          contentType: "chocolatey/package",
          contentLength: null,
          direct: true,
          message: "Chocolatey package imported; requires Chocolatey on endpoint",
        });

        continue;
      }

      const resolved = await resolveDownloadUrl(installer);
      const check = await validateUrl(resolved.url);

      const validationStatus = getValidationStatus(check);
      const validationMessage =
        validationStatus === "ready"
          ? "Installer validated"
          : validationStatus === "needs_resolver"
            ? `URL resolved but is not a direct installer: ${check.contentType || "unknown content type"}`
            : `Download failed with HTTP ${check.status}`;

      await supabase
        .from("software_installers")
        .update({
          validation_status: validationStatus,
          validation_message: validationMessage,
          validated_at: new Date().toISOString(),
          resolved_download_url: check.finalUrl,
          resolved_content_type: check.contentType,
          resolved_content_length: check.contentLength,
        })
        .eq("id", installer.id);

      results.push({
        status: validationStatus,
        provider: installer.provider || "manual",
        name: installer.software_catalogue?.name,
        winget_id: installer.software_catalogue?.winget_id,
        installer_type: installer.installer_type,
        resolver: installer.download_resolver || "direct_url",
        assetName: resolved.assetName,
        downloadUrl: installer.download_url,
        resolvedDownloadUrl: resolved.url,
        finalUrl: check.finalUrl,
        httpStatus: check.status,
        contentType: check.contentType,
        contentLength: check.contentLength,
        direct: check.direct,
        message: validationMessage,
      });
    } catch (err) {
      await supabase
        .from("software_installers")
        .update({
          validation_status: "broken",
          validation_message: err.message,
          validated_at: new Date().toISOString(),
        })
        .eq("id", installer.id);

      results.push({
        status: "broken",
        provider: installer.provider || "manual",
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
    readyCount: results.filter((r) => r.status === "ready").length,
    needsResolverCount: results.filter((r) => r.status === "needs_resolver").length,
    brokenCount: results.filter((r) => r.status === "broken").length,
    results,
  });
}