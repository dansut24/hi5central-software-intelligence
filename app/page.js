async function getStatus() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/sources/status`, {
    cache: "no-store",
  });

  if (!res.ok) {
    return { ok: false, apps: [] };
  }

  return res.json();
}

function latestVersion(app) {
  return app.software_versions?.[0]?.version || "Not checked";
}

function latestReleaseUrl(app) {
  return app.software_versions?.[0]?.release_url || app.homepage_url;
}

function latestRun(app) {
  const runs = app.software_sources?.[0]?.source_check_runs || [];
  return runs[0] || null;
}

export default async function HomePage() {
  const data = await getStatus();
  const apps = data.apps || [];

  const checked = apps.filter((app) => latestVersion(app) !== "Not checked").length;
  const failed = apps.filter((app) => latestRun(app)?.status === "failed").length;

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Hi5Central</p>
          <h1 style={styles.title}>Software Intelligence</h1>
          <p style={styles.subtitle}>
            Vendor-direct Tier 1 release tracking for managed software.
          </p>
        </div>

        <div style={styles.actions}>
          <a style={styles.button} href="/api/sources/seed">
            Seed sources
          </a>
          <a style={styles.buttonPrimary} href="/api/sources/check?limit=10">
            Check versions
          </a>
        </div>
      </section>

      <section style={styles.cards}>
        <div style={styles.card}>
          <span style={styles.cardLabel}>Applications</span>
          <strong style={styles.cardValue}>{apps.length}</strong>
        </div>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Checked</span>
          <strong style={styles.cardValue}>{checked}</strong>
        </div>

        <div style={styles.card}>
          <span style={styles.cardLabel}>Failed</span>
          <strong style={styles.cardValue}>{failed}</strong>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Tracked applications</h2>
          <span style={styles.muted}>{apps.length} sources</span>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>App</th>
                <th style={styles.th}>Vendor</th>
                <th style={styles.th}>Latest version</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Links</th>
              </tr>
            </thead>

            <tbody>
              {apps.map((app) => {
                const source = app.software_sources?.[0];
                const run = latestRun(app);
                const version = latestVersion(app);
                const releaseUrl = latestReleaseUrl(app);
                const downloadUrl =
                  source?.metadata?.downloadUrl ||
                  source?.metadata?.download_url ||
                  app.homepage_url;

                return (
                  <tr key={app.id}>
                    <td style={styles.td}>
                      <strong>{app.name}</strong>
                      <div style={styles.small}>{app.winget_id}</div>
                    </td>

                    <td style={styles.td}>{app.vendor}</td>

                    <td style={styles.td}>
                      <code style={styles.code}>{version}</code>
                    </td>

                    <td style={styles.td}>
                      <span style={styles.badge}>{source?.source_type}</span>
                      <div style={styles.small}>{source?.source_name}</div>
                    </td>

                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.status,
                          ...(run?.status === "failed"
                            ? styles.statusBad
                            : run?.status === "success"
                              ? styles.statusGood
                              : styles.statusPending),
                        }}
                      >
                        {run?.status || "pending"}
                      </span>
                      <div style={styles.small}>{run?.message || ""}</div>
                    </td>

                    <td style={styles.td}>
                      <a style={styles.link} href={releaseUrl} target="_blank">
                        Release
                      </a>
                      {" · "}
                      <a style={styles.link} href={downloadUrl} target="_blank">
                        Download
                      </a>
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
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 14,
    marginBottom: 24,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  cardLabel: {
    display: "block",
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 30,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },
  panelHeader: {
    padding: 18,
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
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
  link: {
    color: "#2563eb",
    fontWeight: 700,
    textDecoration: "none",
  },
};