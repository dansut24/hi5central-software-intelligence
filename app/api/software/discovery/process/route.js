import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { searchWinget, getWingetPackageDetails } from "@/lib/winget";

export const dynamic = "force-dynamic";

function normaliseRegistryPath(path = "") {
  return String(path).replace(/\\\\/g, "\\");
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

function normalise(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreMatch(discovered, result) {
  const discoveredName = normalise(discovered.name);
  const resultName = normalise(result.name || result.winget_id);
  const resultId = normalise(result.winget_id);
  const discoveredVendor = normalise(discovered.vendor);
  const resultVendor = normalise(result.vendor);

  let score = 0;

  if (resultName === discoveredName) score += 60;
  if (resultName.includes(discoveredName)) score += 35;
  if (discoveredName.includes(resultName)) score += 25;
  if (resultId.includes(discoveredName.replace(/\s+/g, " "))) score += 20;

  if (discoveredVendor && resultVendor && resultVendor.includes(discoveredVendor)) {
    score += 20;
  }

  if (result.importable) score += 10;

  const badVariantWords = [
    "plugin",
    "plugins",
    "addon",
    "addons",
    "extension",
    "extensions",
    "beta",
    "rc",
    "preview",
    "dev",
    "insiders",
    "vdi",
  ];

  if (badVariantWords.some((word) => resultName.includes(word))) {
    score -= 30;
  }

  return Math.max(0, Math.min(score, 100));
}

function buildRegistryRuleFromDiscovery(discovery) {
  if (!discovery.registry_hive || !discovery.registry_path) return null;

  return {
    method: "registry",
    registry_hive: discovery.registry_hive,
    registry_path: normaliseRegistryPath(discovery.registry_path),
    registry_value: "DisplayVersion",
  };
}

function buildFileRuleFromInstallLocation(discovery) {
  if (!discovery.install_location) return null;

  const cleanName = String(discovery.name || "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .trim();

  if (!cleanName) return null;

  return {
    method: "file",
    file_path: `${discovery.install_location}\\${cleanName}.exe`,
  };
}

function buildFallbackRule(software) {
  const folder = String(software.name || "App")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .trim();

  return {
    method: "file",
    file_path: `C:\\Program Files\\${folder}\\${folder}.exe`,
  };
}

function ruleKey(rule) {
  return [
    rule.method,
    rule.registry_hive || "",
    rule.registry_path || "",
    rule.registry_value || "",
    rule.file_path || "",
    rule.version_command || "",
  ].join(":");
}

async function upsertDetectionRule(supabase, softwareId, rule) {
  const normalised = {
    software_id: softwareId,
    platform: "windows",
    method: rule.method,
    registry_hive: rule.registry_hive || null,
    registry_path: rule.registry_path || null,
    registry_value: rule.registry_value || null,
    file_path: rule.file_path || null,
    version_command: rule.version_command || null,
    rule_key: ruleKey(rule),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("software_detection_rules")
    .upsert(normalised, { onConflict: "software_id,platform,rule_key" });

  if (error) throw new Error(error.message);
}

async function importWingetFromDiscovery(supabase, discovery, match) {
  const pkg = await getWingetPackageDetails(match.winget_id);

  const { data: app, error: appError } = await supabase
    .from("software_catalogue")
    .upsert(
      {
        name: pkg.name,
        vendor: pkg.vendor,
        winget_id: pkg.winget_id,
        category: "Discovered",
        homepage_url: pkg.homepage_url || null,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "winget_id" }
    )
    .select()
    .single();

  if (appError) throw new Error(appError.message);

  await supabase
    .from("software_versions")
    .upsert(
      {
        software_id: app.id,
        version: pkg.version,
        release_url: pkg.source_url || null,
        created_at: new Date().toISOString(),
      },
      { onConflict: "software_id,version" }
    );

  await supabase
    .from("software_sources")
    .upsert(
      {
        software_id: app.id,
        source_name: "Winget",
        source_type: "winget",
        enabled: true,
        metadata: {
          winget_id: pkg.winget_id,
          source_url: pkg.source_url,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "software_id,source_type" }
    );

  const check = await validateUrl(pkg.download_url);

  const { data: installer, error: installerError } = await supabase
    .from("software_installers")
    .upsert(
      {
        software_id: app.id,
        provider: "winget",
        platform: "windows",
        architecture: "x64",
        installer_type: pkg.installer_type,
        download_url: pkg.download_url,
        resolved_download_url: check.finalUrl,
        resolved_content_type: check.contentType,
        resolved_content_length: check.contentLength,
        download_resolver: "direct_url",
        resolver_metadata: {
          source: "winget",
          manifest: pkg.manifest_metadata || {},
        },
        silent_install_args: pkg.silent_install_args,
        silent_uninstall_args:
          discovery.quiet_uninstall_string ||
          discovery.uninstall_string ||
          pkg.silent_uninstall_args,
        checksum: pkg.checksum || null,
        checksum_type: pkg.checksum_type || null,
        validation_status: check.validationStatus,
        validation_message: check.validationMessage,
        validated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "software_id,platform,architecture" }
    )
    .select()
    .single();

  if (installerError) throw new Error(installerError.message);

  const rule =
    buildRegistryRuleFromDiscovery(discovery) ||
    buildFileRuleFromInstallLocation(discovery) ||
    buildFallbackRule(app);

  await upsertDetectionRule(supabase, app.id, rule);

  return {
    app,
    installer,
    validation: check,
    detection_rule: rule,
  };
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const limit = Math.min(Number(body.limit || 1), 10);
    const discoveryId = body.discovery_id || null;

    const supabase = supabaseAdmin();

    let query = supabase
      .from("software_discovery_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (discoveryId) {
      query = supabase
        .from("software_discovery_queue")
        .select("*")
        .eq("id", discoveryId)
        .limit(1);
    }

    const { data: discoveries, error: discoveryError } = await query;

    if (discoveryError) {
      return NextResponse.json(
        { ok: false, error: discoveryError.message },
        { status: 500 }
      );
    }

    const results = [];

    for (const discovery of discoveries || []) {
      try {
        const searchTerm = [discovery.name, discovery.vendor]
          .filter(Boolean)
          .join(" ");

        const candidates = await searchWinget(searchTerm, 8);

        const scored = candidates
          .map((candidate) => ({
            ...candidate,
            score: scoreMatch(discovery, candidate),
          }))
          .sort((a, b) => b.score - a.score);

        const best = scored[0];

        if (!best || best.score < 70) {
          await supabase
            .from("software_discovery_queue")
            .update({
              status: "needs_review",
              match_provider: "winget",
              match_confidence: best?.score || 0,
              error_message: best
                ? `Low confidence match: ${best.winget_id}`
                : "No match found",
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", discovery.id);

          results.push({
            ok: false,
            discovery_id: discovery.id,
            name: discovery.name,
            status: "needs_review",
            best_match: best || null,
          });

          continue;
        }

        const imported = await importWingetFromDiscovery(supabase, discovery, best);

        await supabase
          .from("software_discovery_queue")
          .update({
            status: "imported",
            matched_software_id: imported.app.id,
            match_provider: "winget",
            match_confidence: best.score,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", discovery.id);

        results.push({
          ok: true,
          discovery_id: discovery.id,
          name: discovery.name,
          matched: {
            software_id: imported.app.id,
            name: imported.app.name,
            vendor: imported.app.vendor,
            winget_id: imported.app.winget_id,
            version: best.latest_version || best.latest_seen_version || null,
            confidence: best.score,
          },
          validation: {
            status: imported.validation.validationStatus,
            message: imported.validation.validationMessage,
          },
          detection_rule: imported.detection_rule,
        });
      } catch (error) {
        await supabase
          .from("software_discovery_queue")
          .update({
            status: "failed",
            error_message: error.message || String(error),
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", discovery.id);

        results.push({
          ok: false,
          discovery_id: discovery.id,
          name: discovery.name,
          status: "failed",
          error: error.message || String(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      importedCount: results.filter((item) => item.ok).length,
      reviewCount: results.filter((item) => item.status === "needs_review").length,
      failedCount: results.filter((item) => item.status === "failed").length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}