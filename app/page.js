async function getJson(path) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const res = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
  });

  if (!res.ok) return null;

  return res.json();
}

function latestVersion(app) {
  return app.software_versions?.[0]?.version || "Not checked";
}

function latestRun(app) {
  return app.software_sources?.[0]?.source_check_runs?.[0] || null;
}

function latestSource(app) {
  return app.software_sources?.[0] || null;
}

function findInstaller(app, installers) {
  return installers.find(
    (item) => item.software_catalogue?.winget_id === app.winget_id
  );
}

export default async function HomePage() {
  const statusData = await getJson("/api/sources/status");
  const installerData = await getJson("/api/installers/status");

  const apps = statusData?.apps || [];
  const installers = installerData?.installers || [];

  const sortedApps = [...apps].sort((a, b) => {
    const aStatus = latestRun(a)?.status || "pending";
    const bStatus = latestRun(b)?.status || "pending";

    if (aStatus === "failed" && bStatus !== "failed") return -1;
    if (aStatus !== "failed" && bStatus === "failed") return 1;

    return a.name.localeCompare(b.name);
  });

  const success = apps.filter((app) => latestRun(app)?.status === "success").length;
  const failed = apps.filter((app) => latestRun(app)?.status === "failed").length;
  const pending = apps.length - success - failed;

  const installerCount = installers.length;
  const directInstallerCount = installers.filter((installer) => {
    const url = installer.download_url || "";
    return (
      url.includes(".msi") ||
      url.includes(".exe") ||
      installer.download_resolver === "github_asset"
    );
  }).length;

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Hi5Central</p>
          <h1 style={styles.title}>Software Intelligence</h1>
          <p style={styles.subtitle}>
            Vendor-direct release and installer tracking for managed software.
          </p>
        </div>

        <div style={styles.actions}>
          <a style={styles.button} href="/api/sources/seed">
            Seed sources
          </a>
          <a style={styles.button} href="/api/installers/seed">
            Seed installers
          </a>
          <a style={styles.buttonPrimary} href="/api/sources/check?limit=25">
            Check versions
          </a>
          <a
            style={styles.buttonDark}
            href="/api/installers/validate-downloads?limit=10"
          >
            Validate installers
          </a>
        </div>
      </section>

      <section style={styles.cards}>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Applications</span>
          <strong style={styles.cardValue}>{apps.length}</strong>
        </div>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Version checks</span>
          <strong style={styles.cardValue}>{success}</strong>
          <span style={styles.cardHint}>{failed} failed / {pending} pending</span>
        </div>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Installers</span>
          <strong style={styles.cardValue}>{installerCount}</strong>
        </div>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Likely direct</span>
          <strong style={styles.cardValue}>{directInstallerCount}</strong>
        </div>
      </section>

      {failed > 0 && (
        <section style={styles.warning}>
          <strong>{failed} source checks need attention.</strong>
          <span>Failed rows are shown first.</span>
        </section>
      )}

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>Tracked applications</h2>
            <span style={styles.muted}>
              {success}/{apps.length} version checks successful · {installerCount} installers seeded
            </span>
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>App</th>
                <th style={styles.th}>Latest</th>
                <th style={styles.th}>Version source</th>
                <th style={styles.th}>Installer</th>
                <th style={styles.th}>Silent args</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedApps.map((app) => {
                const source = latestSource(app);
                const run = latestRun(app);
                const installer = findInstaller(app, installers);
                const status = run?.status || "pending";

                const releaseUrl =
                  app.software_versions?.[0]?.release_url || app.homepage_url;

                const downloadUrl =
                  installer?.download_url ||
                  source?.metadata?.downloadUrl ||
                  app.homepage_url;

                return (
                  <tr key={app.id}>
                    <td style={styles.td}>
                      <strong>{app.name}</strong>
                      <div style={styles.small}>{app.vendor}</div>
                      <div style={styles.tiny}>{app.winget_id}</div>
                    </td>

                    <td style={styles.td}>
                      <code style={styles.code}>{latestVersion(app)}</code>
                    </td>

                    <td style={styles.td}>
                      <span style={styles.badge}>{source?.source_type || "none"}</span>
                      <div style={styles.small}>{source?.source_name}</div>
                    </td>

                    <td style={styles.td}>
                      {installer ? (
                        <>
                          <span style={styles.badgeDark}>
                            {installer.installer_type} · {installer.architecture}
                          </span>
                          <div style={styles.small}>
                            {installer.download_resolver || "direct_url"}
                          </div>
                        </>
                      ) : (
                        <span style={styles.statusPending}>No installer</span>
                      )}
                    </td>

                    <td style={styles.td}>
                      {installer?.silent_install_args ? (
                        <code style={styles.code}>{installer.silent_install_args}</code>
                      ) : (
                        <span style={styles.small}>Not set</span>
                      )}
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.status,
                          ...(status === "failed"
                            ? styles.statusBad
                            : status === "success"
                              ? styles.statusGood
                              : styles.statusPending),
                        }}
                      >
                        {status}
                      </span>

                      {run?.message && (
                        <div
                          style={
                            status === "failed"
                              ? styles.errorMessage
                              : styles.small
                          }
                        >
                          {run.message}
                        </div>
                      )}
                    </td>

                    <td style={styles.td}>
                      <div style={styles.actionLinks}>
                        <a style={styles.link} href={releaseUrl} target="_blank">
                          Release
                        </a>
                        <a style={styles.download} href={downloadUrl} target="_blank">
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    background: "#f6f7fb",
    color: "#111827",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: 0,
    color: "#2563eb",
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontSize: 12,
  },
  title: {
    margin: "4px 0",
    fontSize: 34,
    lineHeight: 1.1,
  },
  subtitle: {
    margin: 0,
    color: "#6b7280",
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  button: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#ffffff",
    color: "#111827",
    textDecoration: "none",
    border: "1px solid #d1d5db",
    fontWeight: 700,
  },
  buttonPrimary: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#2563eb",
    color: "#ffffff",
    textDecoration: "none",
    border: "1px solid #2563eb",
    fontWeight: 700,
  },
  buttonDark: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#111827",
    color: "#ffffff",
    textDecoration: "none",
    border: "1px solid #111827",
    fontWeight: 700,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
    marginBottom: 20,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 18,
  },
  cardLabel: {
    display: "block",
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 30,
    display: "block",
  },
  cardHint: {
    color: "#6b7280",
    fontSize: 12,
  },
  warning: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    background: "#fff7ed",
    color: "#9a3412",
    border: "1px solid #fed7aa",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    overflow: "hidden",
  },
  panelHeader: {
    padding: 18,
    borderBottom: "1px solid #e5e7eb",
  },
  panelTitle: {
    margin: 0,
    fontSize: 18,
  },
  muted: {
    color: "#6b7280",
    fontSize: 13,
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    background: "#f9fafb",
    color: "#6b7280",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid #f1f5f9",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  },
  small: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
  },
  tiny: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 3,
  },
  code: {
    background: "#f3f4f6",
    padding: "3px 6px",
    borderRadius: 6,
  },
  badge: {
    display: "inline-block",
    background: "#eef2ff",
    color: "#3730a3",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    fontWeight: 700,
  },
  badgeDark: {
    display: "inline-block",
    background: "#111827",
    color: "#ffffff",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    fontWeight: 700,
  },
  status: {
    display: "inline-block",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  statusGood: {
    background: "#dcfce7",
    color: "#166534",
  },
  statusBad: {
    background: "#fee2e2",
    color: "#991b1b",
  },
  statusPending: {
    background: "#fef3c7",
    color: "#92400e",
  },
  errorMessage: {
    color: "#b91c1c",
    fontSize: 12,
    marginTop: 4,
    maxWidth: 320,
    whiteSpace: "normal",
  },
  actionLinks: {
    display: "flex",
    gap: 8,
    alignItems: "center",
  },
  link: {
    color: "#2563eb",
    fontWeight: 700,
    textDecoration: "none",
  },
  download: {
    background: "#111827",
    color: "#ffffff",
    padding: "6px 9px",
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: "none",
  },
};