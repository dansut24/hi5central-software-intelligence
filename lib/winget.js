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

function sortVersionsNewestFirst(items) {
  return [...items].sort((a, b) =>
    b.name.localeCompare(a.name, undefined, { numeric: true })
  );
}

function isPreReleaseName(name = "") {
  const clean = name.toLowerCase();

  return (
    clean.includes("pre-release") ||
    clean.includes("prerelease") ||
    clean.includes("preview") ||
    clean.includes("beta") ||
    clean.includes("alpha") ||
    clean.includes("nightly") ||
    clean.includes("-rc") ||
    clean.includes("rc-")
  );
}

function stableDirsFirst(items) {
  const stable = items.filter((item) => !isPreReleaseName(item.path || item.name));
  const unstable = items.filter((item) => isPreReleaseName(item.path || item.name));

  return [
    ...sortVersionsNewestFirst(stable),
    ...sortVersionsNewestFirst(unstable),
  ];
}

export async function searchWinget(query, limit = 10) {
  const q = encodeURIComponent(
    `${query} repo:${WINGET_REPO} path:manifests extension:yaml`
  );
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

export async function getManifestFiles(wingetId) {
  let currentPath = wingetIdToManifestPath(wingetId);

  for (let depth = 0; depth < 6; depth++) {
    const url = `${GITHUB_API}/repos/${WINGET_REPO}/contents/${currentPath}`;
    const items = await githubJson(url);

    const yamlFiles = (items || []).filter(
      (item) => item.type === "file" && item.name.endsWith(".yaml")
    );

    if (yamlFiles.length > 0) {
      const version = currentPath.split("/").pop();

      return {
        version,
        manifestPath: currentPath,
        files: yamlFiles,
      };
    }

    const dirs = stableDirsFirst(
  (items || []).filter((item) => item.type === "dir")
);

    if (!dirs.length) {
      throw new Error(`No manifest files found for ${wingetId} at ${currentPath}`);
    }

    currentPath = dirs[0].path;
  }

  throw new Error(`Could not resolve manifest files for ${wingetId}`);
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
  if (value.includes("zip")) return "zip";

  return value || "exe";
}

function inferSilentArgs(installerType) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Add-AppxPackage";
  if (installerType === "zip") return "";
  return "/S";
}

export async function getWingetPackageDetails(wingetId) {
  const manifest = await getManifestFiles(wingetId);

  let localeText = "";
  let installerText = "";
  let defaultText = "";

  for (const file of manifest.files) {
    if (!file.name.endsWith(".yaml")) continue;

    const text = await fetchRawManifestFile(file.download_url);

    if (
      file.name.endsWith(".locale.en-US.yaml") ||
      file.name.endsWith(".locale.yaml")
    ) {
      localeText = text;
    }

    if (file.name === `${wingetId}.yaml`) {
      defaultText = text;
    }

    if (text.includes("InstallerUrl:") || text.includes("Installers:")) {
      installerText = text;
    }
  }

  if (!installerText) {
    throw new Error(
      `No installer manifest found for ${wingetId}. Files: ${manifest.files
        .map((file) => file.name)
        .join(", ")}`
    );
  }

  const metadataText = localeText || defaultText || installerText;

  const name =
    readYamlValue(metadataText, "PackageName") ||
    readYamlValue(installerText, "PackageName") ||
    wingetId;

  const vendor =
    readYamlValue(metadataText, "Publisher") ||
    readYamlValue(installerText, "Publisher") ||
    "";

  const homepageUrl =
    readYamlValue(metadataText, "PackageUrl") ||
    readYamlValue(metadataText, "PublisherUrl") ||
    "";

  const installerType = readInstallerType(installerText);
  const downloadUrl = readFirstInstallerUrl(installerText);

  if (!downloadUrl) {
    throw new Error(`No InstallerUrl found for ${wingetId}`);
  }

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