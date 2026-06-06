import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

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

function contentLooksLikeInstaller(contentType = "") {
  const ct = String(contentType).toLowerCase();

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

    return {
      ok: res.ok,
      status: res.status,
      finalUrl,
      contentType,
      contentLength,
      direct,
      validationStatus: res.ok && direct ? "ready" : res.ok ? "needs_resolver" : "broken",
      validationMessage:
        res.ok && direct
          ? "Installer validated"
          : res.ok
            ? `URL resolved but is not a direct installer: ${contentType || "unknown content type"}`
            : `Download failed with HTTP ${res.status}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseNotes(notes) {
  try {
    return JSON.parse(notes || "{}");
  } catch {
    return {};
  }
}

function normaliseRegistryPath(path = "") {
  const value = String(path || "");

  if (!value) return "";
  if (value.includes("\\")) return value;

  return value
    .replace(/^SOFTWARE/i, "SOFTWARE\\")
    .replace(/Microsoft/i, "Microsoft\\")
    .replace(/Windows/i, "Windows\\")
    .replace(/CurrentVersion/i, "CurrentVersion\\")
    .replace(/Uninstall/i, "Uninstall\\")
    .replace(/Google/i, "Google\\")
    .replace(/Chrome/i, "Chrome\\")
    .replace(/Edge/i, "Edge\\")
    .replace(/Mozilla/i, "Mozilla\\")
    .replace(/BLBeacon/i, "BLBeacon");
}

function buildDetectionRule(row, draft) {
  const knownRule = KNOWN_DETECTION_RULES[draft?.name] || KNOWN_DETECTION_RULES[row.name];

  if (knownRule) {
    return knownRule;
  }

  const rule = draft?.detection_rule;

  if (rule?.method) {
    return {
      method: rule.method,
      registry_hive: rule.registry_hive || null,
      registry_path: rule.registry_path
        ? normaliseRegistryPath(rule.registry_path)
        : null,
      registry_value: rule.registry_value || null,
      file_path: rule.file_path || null,
      version_command: rule.version_command || null,
    };
  }

  if (row.detection_method && row.detection_value) {
    if (row.detection_method === "registry") {
      return {
        method: "registry",
        registry_hive: "HKLM",
        registry_path: normaliseRegistryPath(row.detection_value),
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

  return null;
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
  if (!rule?.method) return null;

  const row = {
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

  let deleteQuery = supabase
    .from("software_detection_rules")
    .delete()
    .eq("software_id", softwareId)
    .eq("platform", "windows")
    .eq("method", row.method);

  if (row.registry_hive) deleteQuery = deleteQuery.eq("registry_hive", row.registry_hive);
  if (row.registry_path) deleteQuery = deleteQuery.eq("registry_path", row.registry_path);
  if (row.registry_value) deleteQuery = deleteQuery.eq("registry_value", row.registry_value);
  if (row.file_path) deleteQuery = deleteQuery.eq("file_path", row.file_path);
  if (row.version_command) deleteQuery = deleteQuery.eq("version_command", row.version_command);

  await deleteQuery;

  const { data, error } = await supabase
    .from("software_detection_rules")
    .insert(row)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request) {
  const authError = requireAdmin(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const id = body.id || body.research_id;

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id is required" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

    const { data: row, error: rowError } = await supabase
      .from("software_research_queue")
      .select("*")
      .eq("id", id)
      .single();

    if (rowError || !row) {
      return NextResponse.json(
        { ok: false, error: rowError?.message || "Research row not found" },
        { status: 404 }
      );
    }

    const notes = parseNotes(row.notes);
    const draft = {
      ...(notes.draft || {}),
      ...(body.override || {}),
    };

    const name = draft.name || row.name;
    const vendor = draft.vendor || row.vendor || "";
    const category = draft.category || row.category || "Hi5Central";
    const wingetId =
      draft.winget_id ||
      `hi5central.${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

    const downloadUrl = draft.download_url || row.download_url;

    if (!name || !downloadUrl) {
      return NextResponse.json(
        { ok: false, error: "Approved row needs name and download_url" },
        { status: 400 }
      );
    }

    const check = await validateUrl(downloadUrl);

    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .upsert(
        {
          name,
          vendor,
          winget_id: wingetId,
          category,
          homepage_url: draft.homepage_url || row.homepage_url || null,
          active: true,
          updated_at: new Date().toISOString(),
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

    const version = draft.version || "latest";
    const releaseUrl = draft.release_url || row.release_url || null;

    await supabase
      .from("software_versions")
      .upsert(
        {
          software_id: app.id,
          version,
          release_url: releaseUrl,
          created_at: new Date().toISOString(),
        },
        { onConflict: "software_id,version" }
      );

    await supabase
      .from("software_sources")
      .upsert(
        {
          software_id: app.id,
          source_name: "Hi5Central Research",
          source_type: "hi5central",
          enabled: true,
          metadata: {
            curated: true,
            research_id: row.id,
            source: notes.source || "research_queue",
            validation: notes.validation || null,
            version_source: draft.version_source || null,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "software_id,source_type" }
      );

    const { data: installer, error: installerError } = await supabase
      .from("software_installers")
      .upsert(
        {
          software_id: app.id,
          provider: "hi5central",
          platform: "windows",
          architecture: "x64",
          installer_type: draft.installer_type || row.installer_type || "exe",
          download_url: downloadUrl,
          resolved_download_url: check.finalUrl,
          resolved_content_type: check.contentType,
          resolved_content_length: check.contentLength,
          download_resolver: "vendor_direct",
          resolver_metadata: {
            source: "research_queue",
            research_id: row.id,
            version_source: draft.version_source || null,
          },
          silent_install_args:
            draft.silent_install_args || row.silent_install_args || "/S",
          silent_uninstall_args:
            draft.silent_uninstall_args || row.silent_uninstall_args || "/S",
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

    const detectionRule = await upsertDetectionRule(
      supabase,
      app.id,
      buildDetectionRule(row, draft)
    );

    await supabase
      .from("software_research_queue")
      .update({
        status: "imported",
        imported_software_id: app.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    return NextResponse.json({
      ok: true,
      imported: {
        software_id: app.id,
        name: app.name,
        vendor: app.vendor,
        winget_id: app.winget_id,
        version,
        category: app.category,
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
      detection_rule: detectionRule,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}