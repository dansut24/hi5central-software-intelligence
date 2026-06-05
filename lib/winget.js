const WINGET_REPO = "microsoft/winget-pkgs";
const GITHUB_API = "https://api.github.com";

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Hi5Central-Software-Intelligence",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  return headers;
}

export function wingetIdToManifestPath(wingetId) {
  const parts = String(wingetId || "").split(".");
  const packageId = parts.join("/");
  const firstLetter = parts[0]?.charAt(0)?.toLowerCase();

  if (!firstLetter || parts.length < 2) {
    throw new Error("Invalid winget_id");
  }

  return `manifests/${firstLetter}/${packageId}`;
}

export async function githubJson(url) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: githubHeaders(),
  });

  if (!res.ok) {
    throw new Error(`GitHub request failed HTTP ${res.status}: ${url}`);
  }

  return res.json();
}

export async function searchWinget(query, limit = 10) {
  const q = encodeURIComponent(`${query} repo:${WINGET_REPO} path:manifests extension:yaml`);
  const url = `${GITHUB_API}/search/code?q=${q}&per_page=${limit * 5}`;

  const json = await githubJson(url);
  const seen = new Map();

  for (const item of json.items || []) {
    const path = item.path || "";

    const match = path.match(
      /^manifests\/[^/]+\/(.+)\/([^/]+)\/[^/]+\.yaml$/
    );

    if (!match) continue;

    const packagePath = match[1];
    const version = match[2];
    const wingetId = packagePath.split("/").join(".");

    if (!seen.has(wingetId)) {
      seen.set(wingetId, {
        winget_id: wingetId,
        latest_seen_version: version,
        path,
        html_url: item.html_url,
      });
    }
  }

  const basicResults = [...seen.values()].slice(0, limit);
  const enrichedResults = [];

  for (const item of basicResults) {
    try {
      const details = await getWingetPackageDetails(item.winget_id);

      enrichedResults.push({
        ...item,
        latest_version: details.version,
        name: details.name,
        vendor: details.vendor,
        installer_type: details.installer_type,
        download_url: details.download_url,
        source_url: details.source_url,
        importable: Boolean(details.download_url),
      });
    } catch (error) {
      enrichedResults.push({
        ...item,
        latest_version: item.latest_seen_version,
        importable: false,
        error: error.message,
      });
    }
  }

  return enrichedResults;
}

export async function getLatestManifestVersion(wingetId) {
  const manifestPath = wingetIdToManifestPath(wingetId);
  const url = `${GITHUB_API}/repos/${WINGET_REPO}/contents/${manifestPath}`;

  const folders = await githubJson(url);

  const versions = (folders || [])
    .filter((item) => item.type === "dir")
    .map((item) => item.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  if (!versions.length) {
    throw new Error(`No versions found for ${wingetId}`);
  }

  return {
    version: versions[0],
    manifestPath: `${manifestPath}/${versions[0]}`,
  };
}

export async function getManifestFiles(wingetId) {
  const latest = await getLatestManifestVersion(wingetId);

  const url = `${GITHUB_API}/repos/${WINGET_REPO}/contents/${latest.manifestPath}`;
  const files = await githubJson(url);

  return {
    version: latest.version,
    manifestPath: latest.manifestPath,
    files: files || [],
  };
}

export async function fetchRawManifestFile(downloadUrl) {
  const res = await fetch(downloadUrl, {
    cache: "no-store",
    headers: githubHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Manifest download failed HTTP ${res.status}`);
  }

  return res.text();
}

function readYamlValue(text, key) {
  const regex = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = text.match(regex);
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() || "";
}

function readFirstInstallerUrl(text) {
  const match = text.match(/InstallerUrl:\s*(.+)/);
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() || "";
}

function readInstallerType(text) {
  const value = readYamlValue(text, "InstallerType").toLowerCase();

  if (value.includes("msi")) return "msi";
  if (value.includes("msix")) return "msix";
  return value || "exe";
}

function inferSilentArgs(installerType) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Add-AppxPackage";
  return "/S";
}

export async function getWingetPackageDetails(wingetId) {
  const manifest = await getManifestFiles(wingetId);

  let localeText = "";
  let installerText = "";

  for (const file of manifest.files) {
    if (file.name.endsWith(".locale.en-US.yaml") || file.name.endsWith(".locale.yaml")) {
      localeText = await fetchRawManifestFile(file.download_url);
    }

    if (
  file.name.endsWith(".installer.yaml") ||
  file.name === `${wingetId}.yaml`
) {
  installerText = await fetchRawManifestFile(file.download_url);
}
  }

  if (!installerText) {
    throw new Error(`No installer manifest found for ${wingetId}`);
  }

  const name =
    readYamlValue(localeText, "PackageName") ||
    readYamlValue(installerText, "PackageName") ||
    wingetId;

  const vendor =
    readYamlValue(localeText, "Publisher") ||
    readYamlValue(installerText, "Publisher") ||
    "";

  const homepageUrl =
    readYamlValue(localeText, "PackageUrl") ||
    readYamlValue(localeText, "PublisherUrl") ||
    "";

  const installerType = readInstallerType(installerText);
  const downloadUrl = readFirstInstallerUrl(installerText);

  return {
    winget_id: wingetId,
    name,
    vendor,
    version: manifest.version,
    homepage_url: homepageUrl,
    installer_type: installerType,
    download_url: downloadUrl,
    silent_install_args: inferSilentArgs(installerType),
    silent_uninstall_args: installerType === "msi" ? "/qn /norestart" : "/S",
    source_url: `https://github.com/${WINGET_REPO}/tree/master/${manifest.manifestPath}`,
  };
}