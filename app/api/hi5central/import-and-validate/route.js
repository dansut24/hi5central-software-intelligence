import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getHi5CentralApp } from "@/lib/hi5central-apps";

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

  const { data, error } = await supabase
    .from("software_detection_rules")
    .upsert(row, { onConflict: "software_id,platform,rule_key" })
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

    const curated = body.app_id ? getHi5CentralApp(body.app_id) : body;

    if (!curated.name || !curated.download_url) {
      return NextResponse.json(
        { ok: false, error: "name and download_url are required" },
        { status: 400 }
      );
    }

    const appDefinition = {
      name: curated.name,
      vendor: curated.vendor || "",
      winget_id:
        curated.winget_id ||
        `hi5central.${String(curated.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      category: curated.category || "Hi5Central",
      homepage_url: curated.homepage_url || null,
      release_url: curated.release_url || null,
      version: curated.version || "latest",
      installer_type: curated.installer_type || "exe",
      download_url: curated.download_url,
      silent_install_args: curated.silent_install_args || "/S",
      silent_uninstall_args: curated.silent_uninstall_args || "/S",
      detection_rule: curated.detection_rule || null,
      version_source: curated.version_source || null,
    };

    const check = await validateUrl(appDefinition.download_url);
    const supabase = supabaseAdmin();

    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .upsert(
        {
          name: appDefinition.name,
          vendor: appDefinition.vendor,
          winget_id: appDefinition.winget_id,
          category: appDefinition.category,
          homepage_url: appDefinition.homepage_url,
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

    await supabase
      .from("software_versions")
      .upsert(
        {
          software_id: app.id,
          version: appDefinition.version,
          release_url: appDefinition.release_url,
          created_at: new Date().toISOString(),
        },
        { onConflict: "software_id,version" }
      );

    await supabase
      .from("software_sources")
      .upsert(
        {
          software_id: app.id,
          source_name: "Hi5Central",
          source_type: "hi5central",
          enabled: true,
          metadata: {
            curated: true,
            app_id: body.app_id || null,
            release_url: appDefinition.release_url,
            download_url: appDefinition.download_url,
            version_source: appDefinition.version_source,
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
          installer_type: appDefinition.installer_type,
          download_url: appDefinition.download_url,
          resolved_download_url: check.finalUrl,
          resolved_content_type: check.contentType,
          resolved_content_length: check.contentLength,
          download_resolver: "vendor_direct",
          resolver_metadata: {
            source: "hi5central",
            curated: true,
            app_id: body.app_id || null,
            version_source: appDefinition.version_source,
          },
          silent_install_args: appDefinition.silent_install_args,
          silent_uninstall_args: appDefinition.silent_uninstall_args,
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
      appDefinition.detection_rule
    );

    return NextResponse.json({
      ok: true,
      source: "hi5central",
      imported: {
        software_id: app.id,
        provider: "hi5central",
        name: app.name,
        vendor: app.vendor,
        winget_id: app.winget_id,
        version: appDefinition.version,
        installer_type: appDefinition.installer_type,
        download_url: appDefinition.download_url,
        release_url: appDefinition.release_url,
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