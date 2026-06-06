import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { searchWinget, getWingetPackageDetails } from "@/lib/winget";
import { searchOfficialSoftware } from "@/lib/tavily";

export const dynamic = "force-dynamic";

const KNOWN_DETECTION_RULES = {
  "Google Chrome Enterprise": {
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Google\\Chrome\\BLBeacon",
    registry_value: "version",
  },
  "Mozilla Firefox ESR": {
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Mozilla\\Mozilla Firefox ESR",
    registry_value: "CurrentVersion",
  },
  "Microsoft Edge Enterprise": {
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\Microsoft\\Edge\\BLBeacon",
    registry_value: "version",
  },
  "Brave Browser": {
    method: "registry",
    registry_hive: "HKLM",
    registry_path: "SOFTWARE\\BraveSoftware\\Brave-Browser\\BLBeacon",
    registry_value: "version",
  },
};

function looksLikeInstaller(url = "") {
  const clean = String(url).toLowerCase().split("?")[0];

  return (
    clean.endsWith(".msi") ||
    clean.endsWith(".exe") ||
    clean.endsWith(".msix") ||
    clean.endsWith(".zip")
  );
}

function inferInstallerType(url = "") {
  const clean = String(url).toLowerCase().split("?")[0];

  if (clean.endsWith(".msi")) return "msi";
  if (clean.endsWith(".msix")) return "msix";
  if (clean.endsWith(".zip")) return "zip";
  if (clean.endsWith(".exe")) return "exe";

  return null;
}

function inferSilentInstallArgs(type) {
  if (type === "msi") return "/qn /norestart";
  if (type === "msix") return "Add-AppxPackage";
  if (type === "zip") return "extract";
  return "/S";
}

function inferSilentUninstallArgs(type) {
  if (type === "msi") return "/qn /norestart";
  if (type === "msix") return "Remove-AppxPackage";
  if (type === "zip") return "";
  return "/S";
}

async function validateUrl(url) {
  if (!url) return null;

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

    return {
      ok: res.ok,
      status: res.status,
      final_url: res.url || url,
      content_type: res.headers.get("content-type") || "",
      content_length: res.headers.get("content-length") || "",
      direct: looksLikeInstaller(res.url || url) || looksLikeInstaller(url),
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

function scoreWinget(row, candidate) {
  const rowName = normalise(row.name);
  const candidateName = normalise(candidate.name || candidate.winget_id);
  const rowVendor = normalise(row.vendor);
  const candidateVendor = normalise(candidate.vendor);

  let score = 0;

  if (candidateName === rowName) score += 70;
  if (candidateName.includes(rowName)) score += 40;
  if (rowName.includes(candidateName)) score += 25;
  if (rowVendor && candidateVendor && candidateVendor.includes(rowVendor)) score += 20;
  if (candidate.importable) score += 10;

  const badWords = ["beta", "preview", "dev", "insider", "plugin", "plugins", "addon", "rc"];
  if (badWords.some((word) => candidateName.includes(word))) score -= 30;

  return Math.max(0, Math.min(score, 100));
}

function buildDetectionFromRow(row, fallbackName) {
  if (KNOWN_DETECTION_RULES[row.name]) {
    return KNOWN_DETECTION_RULES[row.name];
  }

  if (row.detection_method && row.detection_value) {
    if (row.detection_method === "registry") {
      return {
        method: "registry",
        registry_hive: "HKLM",
        registry_path: row.detection_value,
        registry_value: "DisplayVersion",
      };
    }

    if (row.detection_method === "file") {
      return {
        method: "file",
        file_path: row.detection_value,
      };
    }

    if (row.detection_method === "command") {
      return {
        method: "command",
        version_command: row.detection_value,
      };
    }
  }

  const clean = String(fallbackName || row.name || "App")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .trim();

  return {
    method: "file",
    file_path: `C:\\Program Files\\${clean}\\${clean}.exe`,
  };
}

async function processRow(supabase, row) {
  const result = {
    source: null,
    confidence: 0,
    draft: null,
    validation: null,
    candidates: [],
  };

  if (row.download_url) {
    const validation = await validateUrl(row.download_url);
    const installerType = row.installer_type || inferInstallerType(validation?.final_url || row.download_url) || "exe";

    result.source = "csv";
    result.confidence = validation?.direct ? 85 : 55;
    result.validation = validation;
    result.draft = {
      name: row.name,
      vendor: row.vendor,
      category: row.category || "Uncategorised",
      homepage_url: row.homepage_url,
      release_url: row.release_url,
      version: "latest",
      winget_id: `hi5central.${String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      installer_type: installerType,
      download_url: validation?.final_url || row.download_url,
      silent_install_args: row.silent_install_args || inferSilentInstallArgs(installerType),
      silent_uninstall_args: row.silent_uninstall_args || inferSilentUninstallArgs(installerType),
      detection_rule: buildDetectionFromRow(row, row.name),
      version_source: {
        strategy: "research_queue",
        source_row_id: row.id,
      },
    };

    return result;
  }

  try {
    const wingetResults = await searchWinget([row.name, row.vendor].filter(Boolean).join(" "), 8);

    const scored = wingetResults
      .map((candidate) => ({
        ...candidate,
        confidence: scoreWinget(row, candidate),
      }))
      .sort((a, b) => b.confidence - a.confidence);

    result.candidates = scored.slice(0, 5);

    const best = scored[0];

    if (best && best.confidence >= 70) {
      const pkg = await getWingetPackageDetails(best.winget_id);

      result.source = "winget";
      result.confidence = best.confidence;
      result.draft = {
        name: pkg.name,
        vendor: pkg.vendor,
        category: row.category || "Uncategorised",
        homepage_url: pkg.homepage_url || row.homepage_url,
        release_url: pkg.source_url,
        version: pkg.version,
        winget_id: pkg.winget_id,
        installer_type: pkg.installer_type,
        download_url: pkg.download_url,
        silent_install_args: pkg.silent_install_args,
        silent_uninstall_args: row.silent_uninstall_args || pkg.silent_uninstall_args,
        detection_rule: buildDetectionFromRow(row, pkg.name),
        version_source: {
          strategy: "winget",
          winget_id: pkg.winget_id,
        },
      };

      result.validation = await validateUrl(pkg.download_url);
      return result;
    }
  } catch (error) {
    result.candidates.push({
      source: "winget",
      error: error.message,
    });
  }

  try {
    const vendorResults = await searchOfficialSoftware(row.name);

    const trusted = vendorResults.slice(0, 5);

    result.source = "vendor_review";
    result.confidence = trusted.length ? 45 : 0;
    result.candidates.push(
      ...trusted.map((item) => ({
        source: "vendor",
        title: item.title,
        url: item.url,
        snippet: item.content,
        confidence: 45,
      }))
    );

    return result;
  } catch (error) {
    result.candidates.push({
      source: "tavily",
      error: error.message,
    });
  }

  return result;
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit || 1), 10);
    const id = body.id || null;

    const supabase = supabaseAdmin();

    let query = supabase
      .from("software_research_queue")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (id) {
      query = supabase
        .from("software_research_queue")
        .select("*")
        .eq("id", id)
        .limit(1);
    }

    const { data: rows, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const results = [];

    for (const row of rows || []) {
      try {
        const processed = await processRow(supabase, row);

        const status =
          processed.draft && processed.confidence >= 70
            ? "researched"
            : "needs_review";

        await supabase
          .from("software_research_queue")
          .update({
            status,
            confidence: processed.confidence,
            homepage_url: processed.draft?.homepage_url || row.homepage_url,
            release_url: processed.draft?.release_url || row.release_url,
            download_url: processed.draft?.download_url || row.download_url,
            installer_type: processed.draft?.installer_type || row.installer_type,
            silent_install_args:
              processed.draft?.silent_install_args || row.silent_install_args,
            silent_uninstall_args:
              processed.draft?.silent_uninstall_args || row.silent_uninstall_args,
            detection_method:
              processed.draft?.detection_rule?.method || row.detection_method,
            detection_value:
              processed.draft?.detection_rule?.registry_path ||
              processed.draft?.detection_rule?.file_path ||
              processed.draft?.detection_rule?.version_command ||
              row.detection_value,
            notes: JSON.stringify({
              source: processed.source,
              validation: processed.validation,
              candidates: processed.candidates,
              draft: processed.draft,
            }),
            researched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        results.push({
          ok: true,
          id: row.id,
          name: row.name,
          status,
          source: processed.source,
          confidence: processed.confidence,
          draft: processed.draft,
          validation: processed.validation,
          candidates: processed.candidates,
        });
      } catch (error) {
        await supabase
          .from("software_research_queue")
          .update({
            status: "failed",
            notes: error.message || String(error),
            researched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        results.push({
          ok: false,
          id: row.id,
          name: row.name,
          status: "failed",
          error: error.message || String(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      count: results.length,
      researched: results.filter((item) => item.status === "researched").length,
      needs_review: results.filter((item) => item.status === "needs_review").length,
      failed: results.filter((item) => item.status === "failed").length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}