import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function getPath(obj, path) {
  if (!path) return obj;
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

function cleanVersion(version, stripPrefix) {
  if (!version) return "";
  let v = String(version).trim();
  if (stripPrefix && v.startsWith(stripPrefix)) v = v.slice(stripPrefix.length);
  return v;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function resolveGithubRelease(metadata) {
  const json = await fetchJson(
    `https://api.github.com/repos/${metadata.owner}/${metadata.repo}/releases/latest`
  );

  return {
    version: cleanVersion(json.tag_name || json.name, "v"),
    releaseUrl: json.html_url,
  };
}

async function resolveVendorJson(metadata) {
  const json = await fetchJson(metadata.url);

  let target = json;

  if (metadata.arrayPath) {
    target = getPath(json, metadata.arrayPath);
  }

  if (Array.isArray(target) && metadata.arrayIndex !== undefined) {
    target = target[metadata.arrayIndex];
  }

  if (Array.isArray(target) && metadata.arrayFind) {
    target = target.find((row) =>
      Object.entries(metadata.arrayFind).every(([key, value]) => {
        const actual = getPath(row, key);

        if (value === true) return Boolean(actual) === true;
        if (value === false) return Boolean(actual) === false;

        return actual === value;
      })
    );
  }

  if (!target && metadata.fallbackArrayIndex !== undefined && Array.isArray(json)) {
    target = json[metadata.fallbackArrayIndex];
  }

  const rawVersion = metadata.versionPath
    ? getPath(target, metadata.versionPath)
    : target;

  if (!rawVersion) {
    throw new Error("Could not resolve version from vendor_json source");
  }

  return {
    version: cleanVersion(rawVersion, metadata.stripPrefix),
    releaseUrl: metadata.releaseUrl || metadata.url,
  };
}

async function resolveVendorHtml(metadata) {
  const res = await fetch(metadata.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${metadata.url}`);

  const html = await res.text();
  const regex = new RegExp(metadata.versionPattern, "i");
  const match = html.match(regex);

  if (!match?.[1]) {
    throw new Error("Version pattern did not match");
  }

  return {
    version: cleanVersion(match[1], metadata.stripPrefix),
    releaseUrl: metadata.releaseUrl || metadata.url,
  };
}

async function resolveSource(source) {
  const metadata = source.metadata || {};

  if (source.source_type === "github_release") {
    return resolveGithubRelease(metadata);
  }

  if (source.source_type === "vendor_json") {
    return resolveVendorJson(metadata);
  }

  if (source.source_type === "vendor_html") {
    return resolveVendorHtml(metadata);
  }

  throw new Error(`Unsupported source_type: ${source.source_type}`);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") || 10), 50);

  const supabase = supabaseAdmin();

  const { data: sources, error } = await supabase
    .from("software_sources")
    .select("*, software_catalogue(name, winget_id)")
    .eq("enabled", true)
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results = [];

  for (const source of sources || []) {
    try {
      const resolved = await resolveSource(source);

      await supabase.from("software_versions").insert({
        software_id: source.software_id,
        version: resolved.version,
        release_url: resolved.releaseUrl,
      });

      await supabase.from("source_check_runs").insert({
        source_id: source.id,
        status: "success",
        message: resolved.version,
      });

      results.push({
        status: "success",
        name: source.software_catalogue?.name,
        winget_id: source.software_catalogue?.winget_id,
        version: resolved.version,
        releaseUrl: resolved.releaseUrl,
      });
    } catch (err) {
      await supabase.from("source_check_runs").insert({
        source_id: source.id,
        status: "failed",
        message: err.message,
      });

      results.push({
        status: "failed",
        name: source.software_catalogue?.name,
        winget_id: source.software_catalogue?.winget_id,
        error: err.message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    count: results.length,
    results,
  });
}