export const HI5CENTRAL_APPS = {
  "microsoft-edge-enterprise": {
    name: "Microsoft Edge Enterprise",
    vendor: "Microsoft",
    winget_id: "hi5central.microsoft-edge-enterprise",
    category: "Browser",
    homepage_url: "https://www.microsoft.com/edge/business/download",
    release_url: "https://learn.microsoft.com/deployedge/microsoft-edge-relnote-stable-channel",
    version: "latest",
    installer_type: "msi",
    download_url: "https://go.microsoft.com/fwlink/?linkid=2093437",
    silent_install_args: "/qn /norestart",
    silent_uninstall_args: "/qn /norestart",
    detection_rule: {
      method: "registry",
      registry_hive: "HKLM",
      registry_path: "SOFTWARE\\Microsoft\\Edge\\BLBeacon",
      registry_value: "version",
    },
    version_source: {
      strategy: "redirect_url",
      download_url: "https://go.microsoft.com/fwlink/?linkid=2093437",
    },
  },

  "google-chrome-enterprise": {
    name: "Google Chrome Enterprise",
    vendor: "Google",
    winget_id: "hi5central.google-chrome-enterprise",
    category: "Browser",
    homepage_url: "https://chromeenterprise.google/browser/download/",
    release_url: "https://chromereleases.googleblog.com/",
    version: "latest",
    installer_type: "msi",
    download_url: "https://dl.google.com/chrome/install/googlechromestandaloneenterprise64.msi",
    silent_install_args: "/qn /norestart",
    silent_uninstall_args: "/qn /norestart",
    detection_rule: {
      method: "registry",
      registry_hive: "HKLM",
      registry_path: "SOFTWARE\\Google\\Chrome\\BLBeacon",
      registry_value: "version",
    },
    version_source: {
      strategy: "vendor_page",
      release_url: "https://chromereleases.googleblog.com/",
    },
  },

  "adobe-reader-dc": {
    name: "Adobe Acrobat Reader DC",
    vendor: "Adobe",
    winget_id: "hi5central.adobe-reader-dc",
    category: "Documents",
    homepage_url: "https://get.adobe.com/reader/enterprise/",
    release_url: "https://helpx.adobe.com/acrobat/release-note/release-notes-acrobat-reader.html",
    version: "latest",
    installer_type: "exe",
    download_url: "https://ardownload2.adobe.com/pub/adobe/acrobat/win/AcrobatDC/2600121651/AcroRdrDCx642600121651_MUI.exe",
    silent_install_args: "/sAll /rs /rps /msi EULA_ACCEPT=YES",
    silent_uninstall_args: "/qn /norestart",
    detection_rule: {
      method: "registry",
      registry_hive: "HKLM",
      registry_path: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{AC76BA86-7AD7-1033-7B44-AC0F074E4100}",
      registry_value: "DisplayVersion",
    },
    version_source: {
      strategy: "fixed_from_url",
    },
  },

  "vlc": {
    name: "VLC media player",
    vendor: "VideoLAN",
    winget_id: "hi5central.vlc",
    category: "Media",
    homepage_url: "https://www.videolan.org/vlc/",
    release_url: "https://www.videolan.org/vlc/releases/",
    version: "3.0.23",
    installer_type: "exe",
    download_url: "https://get.videolan.org/vlc/3.0.23/win64/vlc-3.0.23-win64.exe",
    silent_install_args: "/S",
    silent_uninstall_args: "/S",
    detection_rule: {
      method: "file",
      file_path: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
    },
    version_source: {
      strategy: "fixed",
    },
  },

  "7zip": {
    name: "7-Zip",
    vendor: "Igor Pavlov",
    winget_id: "hi5central.7zip",
    category: "Compression",
    homepage_url: "https://www.7-zip.org/",
    release_url: "https://www.7-zip.org/download.html",
    version: "26.01",
    installer_type: "exe",
    download_url: "https://www.7-zip.org/a/7z2601-x64.exe",
    silent_install_args: "/S",
    silent_uninstall_args: "/S",
    detection_rule: {
      method: "file",
      file_path: "C:\\Program Files\\7-Zip\\7z.exe",
    },
    version_source: {
      strategy: "fixed",
    },
  },
};

export function getHi5CentralApp(appId) {
  const app = HI5CENTRAL_APPS[appId];

  if (!app) {
    throw new Error(`Unknown Hi5Central curated app: ${appId}`);
  }

  return app;
}

export function listHi5CentralApps() {
  return Object.entries(HI5CENTRAL_APPS).map(([id, app]) => ({
    id,
    name: app.name,
    vendor: app.vendor,
    category: app.category,
    version: app.version,
    installer_type: app.installer_type,
    download_url: app.download_url,
    release_url: app.release_url,
  }));
}