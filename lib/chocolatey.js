const CHOCO_API = "https://community.chocolatey.org/api/v2";

function textBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex === -1) return "";

  const valueStart = startIndex + start.length;
  const endIndex = text.indexOf(end, valueStart);

  if (endIndex === -1) return "";

  return text
    .slice(valueStart, endIndex)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();
}

function stripHtml(value = "") {
  return value.replace(/<[^>]+>/g, "").trim();
}

function inferInstallerType(downloadUrl = "") {
  const clean = downloadUrl.toLowerCase().split("?")[0];

  if (clean.endsWith(".msi")) return "msi";
  if (clean.endsWith(".msix")) return "msix";
  if (clean.endsWith(".zip")) return "zip";
  return "exe";
}

function inferSilentArgs(installerType) {
  if (installerType === "msi") return "/qn /norestart";
  if (installerType === "msix") return "Add-AppxPackage";
  if (installerType === "zip") return "extract";
  return "/S";
}

async function fetchText(url) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/atom+xml, application/xml, text/xml, */*",
      "User-Agent": "Hi5Central-Software-Intelligence",
    },
  });

  if (!res.ok) {
    throw new Error(`Chocolatey request failed HTTP ${res.status}: ${url}`);
  }

  return res.text();
}

function parseEntries(xml) {
  const entries = xml.split("<entry>").slice(1).map((part) => `<entry>${part}`);
  return entries.map((entry) => {
    const id = textBetween(entry, "<d:Id", "</d:Id>").split(">").pop();
    const title = textBetween(entry, "<title", "</title>").split(">").pop();
    const version = textBetween(entry, "<d:Version", "</d:Version>").split(">").pop();
    const authors = textBetween(entry, "<d:Authors", "</d:Authors>").split(">").pop();
    const description = stripHtml(
      textBetween(entry, "<d:Description", "</d:Description>").split(">").pop()
    );
    const projectUrl = textBetween(entry, "<d:ProjectUrl", "</d:ProjectUrl>").split(">").pop();
    const packageUrl = textBetween(entry, "<id>", "</id>");

    return {
      source: "chocolatey",
      package_id: id || title,
      name: title || id,
      vendor: authors || "",
      latest_version: version || "",
      description,
      homepage_url: projectUrl || "",
      html_url: packageUrl || `https://community.chocolatey.org/packages/${id}`,
      installer_type: "choco",
      download_url: "",
      silent_install_args: "choco install {package_id} -y --no-progress",
      silent_uninstall_args: "choco uninstall {package_id} -y",
      importable: Boolean(id || title),
    };
  });
}

export async function searchChocolatey(query, limit = 10) {
  const encoded = encodeURIComponent(query);
  const url = `${CHOCO_API}/Search()?%24filter=IsLatestVersion&%24skip=0&%24top=${limit}&searchTerm=%27${encoded}%27&targetFramework=%27%27&includePrerelease=false`;

  const xml = await fetchText(url);
  return parseEntries(xml).slice(0, limit);
}

export async function getChocolateyPackageDetails(packageId) {
  const encoded = encodeURIComponent(`'${packageId}'`);
  const url = `${CHOCO_API}/Packages()?$filter=Id eq ${encoded} and IsLatestVersion`;

  const xml = await fetchText(url);
  const entries = parseEntries(xml);

  const pkg = entries[0];

  if (!pkg) {
    throw new Error(`Chocolatey package not found: ${packageId}`);
  }

  return {
    source: "chocolatey",
    package_id: pkg.package_id,
    name: pkg.name,
    vendor: pkg.vendor,
    version: pkg.latest_version,
    homepage_url: pkg.homepage_url,
    release_url: pkg.html_url,
    installer_type: "choco",
    download_url: `https://community.chocolatey.org/packages/${pkg.package_id}`,
    silent_install_args: `choco install ${pkg.package_id} -y --no-progress`,
    silent_uninstall_args: `choco uninstall ${pkg.package_id} -y`,
  };
}