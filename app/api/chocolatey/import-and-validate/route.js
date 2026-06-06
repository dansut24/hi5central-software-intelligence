import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getChocolateyPackageDetails } from "@/lib/chocolatey";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const packageId = body.package_id;

    if (!packageId) {
      return NextResponse.json(
        { ok: false, error: "package_id is required" },
        { status: 400 }
      );
    }

    const pkg = await getChocolateyPackageDetails(packageId);
    const supabase = supabaseAdmin();

    const wingetId = body.winget_id || `choco.${pkg.package_id}`;

    const { data: app, error: appError } = await supabase
      .from("software_catalogue")
      .upsert(
        {
          name: body.name || pkg.name,
          vendor: body.vendor || pkg.vendor,
          winget_id: wingetId,
          category: body.category || "Chocolatey",
          homepage_url: pkg.homepage_url || null,
          active: true,
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

    await supabase.from("software_versions").insert({
      software_id: app.id,
      version: pkg.version,
      release_url: pkg.release_url,
    });

    const { data: installer, error: installerError } = await supabase
      .from("software_installers")
      .upsert(
        {
          software_id: app.id,
          platform: "windows",
          architecture: "x64",
          installer_type: "choco",
          download_url: pkg.download_url,
          resolved_download_url: pkg.download_url,
          resolved_content_type: "chocolatey/package",
          resolved_content_length: null,
          download_resolver: "chocolatey",
          resolver_metadata: {
            source: "chocolatey",
            package_id: pkg.package_id,
          },
          silent_install_args: pkg.silent_install_args,
          silent_uninstall_args: pkg.silent_uninstall_args,
          validation_status: "ready",
          validation_message: "Chocolatey package imported; requires Chocolatey on endpoint",
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

    return NextResponse.json({
      ok: true,
      source: "chocolatey",
      imported: {
        software_id: app.id,
        name: app.name,
        vendor: app.vendor,
        winget_id: app.winget_id,
        version: pkg.version,
        installer_type: "choco",
        download_url: pkg.download_url,
        release_url: pkg.release_url,
      },
      validation: {
        installer_id: installer.id,
        status: "ready",
        message: "Chocolatey package imported; requires Chocolatey on endpoint",
        final_url: pkg.download_url,
        content_type: "chocolatey/package",
        content_length: null,
        direct: true,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}