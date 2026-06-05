import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

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
      const check = await validateUrl(installer.download_url);

      results.push({
        status: check.ok ? "success" : "failed",
        name: installer.software_catalogue?.name,
        winget_id: installer.software_catalogue?.winget_id,
        installer_type: installer.installer_type,
        downloadUrl: installer.download_url,
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