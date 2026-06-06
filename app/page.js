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

function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return "Unknown";
  if (size > 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function validationStyle(status) {
  if (status === "ready") return styles.statusGood;
  if (status === "needs_resolver") return styles.statusWarn;
  if (status === "broken") return styles.statusBad;
  return styles.statusPending;
}

function providerStyle(provider) {
  if (provider === "winget") return styles.providerWinget;
  if (provider === "github") return styles.providerGithub;
  if (provider === "chocolatey") return styles.providerChocolatey;
  return styles.providerManual;
}

export default async function HomePage() {
  const statusData = await getJson("/api/sources/status");
  const installerData = await getJson("/api/installers/status");

  const apps = statusData?.apps || [];
  const installers = installerData?.installers || [];

  const success = apps.filter((app) => latestRun(app)?.status === "success").length;
  const failed = apps.filter((app) => latestRun(app)?.status === "failed").length;
  const pending = apps.length - success - failed;

  const readyInstallers = installers.filter((i) => i.validation_status === "ready").length;
  const needsResolver = installers.filter((i) => i.validation_status === "needs_resolver").length;
  const brokenInstallers = installers.filter((i) => i.validation_status === "broken").length;

  const wingetCount = installers.filter((i) => i.provider === "winget").length;
  const githubCount = installers.filter((i) => i.provider === "github").length;
  const chocoCount = installers.filter((i) => i.provider === "chocolatey").length;

  const sortedApps = [...apps].sort((a, b) => {
    const ai = findInstaller(a, installers);
    const bi = findInstaller(b, installers);

    const rank = {
      broken: 0,
      needs_resolver: 1,
      pending: 2,
      ready: 3,
    };

    const av = rank[ai?.validation_status || "pending"];
    const bv = rank[bi?.validation_status || "pending"];

    if (av !== bv) return av - bv;
    return a.name.localeCompare(b.name);
  });

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Hi5Central</p>
          <h1 style={styles.title}>Software Intelligence</h1>
          <p style={styles.subtitle}>
            Multi-provider software catalogue, installer validation, and patch-readiness tracking.
          </p>
        </div>

        <div style={styles.actions}>
          <a style={styles.button} href="/admin">Import apps</a>
          <a style={styles.button} href="/api/sources/seed">Seed sources</a>
          <a style={styles.buttonPrimary} href="/api/sources/check?limit=50">Check versions</a>
          <a style={styles.buttonDark} href="/api/installers/validate-downloads?limit=100">
            Validate installers
          </a>
        </div>
      </section>

      <section style={styles.cards}>
        <Card label="Applications" value={apps.length} />
        <Card label="Version checks" value={success} hint={`${failed} failed / ${pending} pending`} />
        <Card label="Ready installers" value={readyInstallers} />
        <Card label="Needs resolver" value={needsResolver} />
        <Card label="Broken" value={brokenInstallers} />
      </section>

      <section style={styles.providerCards}>
        <ProviderCard label="Winget" value={wingetCount} style={styles.providerWinget} />
        <ProviderCard label="GitHub" value={githubCount} style={styles.providerGithub} />
        <ProviderCard label="Chocolatey" value={chocoCount} style={styles.providerChocolatey} />
      </section>

      {(needsResolver > 0 || brokenInstallers > 0) && (
        <section style={styles.warning}>
          <strong>{needsResolver + brokenInstallers} installer definitions need attention.</strong>
          <span>Broken and resolver-needed rows are shown first.</span>
        </section>
      )}

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <div>
            <h2 style={styles.panelTitle}>Patch readiness</h2>
            <span style={styles.muted}>
              {readyInstallers}/{installers.length} installers ready for agent use
            </span>
          </div>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>App</th>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Latest</th>
                <th style={styles.th}>Version Source</th>
                <th style={styles.th}>Installer</th>
                <th style={styles.th}>Validation</th>
                <th style={styles.th}>Size</th>
                <th style={styles.th}>Silent Args</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedApps.map((app) => {
                const source = latestSource(app);
                const run = latestRun(app);
                const installer = findInstaller(app, installers);
                const releaseUrl = app.software_versions?.[0]?.release_url || app.homepage_url;

                const downloadUrl =
                  installer?.resolved_download_url ||
                  installer?.download_url ||
                  source?.metadata?.downloadUrl ||
                  app.homepage_url;

                const validation = installer?.validation_status || "pending";
                const provider = installer?.provider || "manual";

                return (
                  <tr key={app.id}>
                    <td style={styles.td}>
                      <strong>{app.name}</strong>
                      <div style={styles.small}>{app.vendor || "Unknown vendor"}</div>
                      <div style={styles.tiny}>{app.winget_id}</div>
                    </td>

                    <td style={styles.td}>
                      <span style={{ ...styles.providerBadge, ...providerStyle(provider) }}>
                        {provider}
                      </span>
                      {provider === "chocolatey" && (
                        <div style={styles.warnText}>Requires Chocolatey on endpoint</div>
                      )}
                    </td>

                    <td style={styles.td}>
                      <code style={styles.code}>{latestVersion(app)}</code>
                    </td>

                    <td style={styles.td}>
                      <span style={styles.badge}>{source?.source_type || "none"}</span>
                      <div style={styles.small}>{run?.status || "pending"}</div>
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
                        <span style={{ ...styles.status, ...styles.statusPending }}>
                          No installer
                        </span>
                      )}
                    </td>

                    <td style={styles.td}>
                      <span style={{ ...styles.status, ...validationStyle(validation) }}>
                        {validation}
                      </span>
                      {installer?.validation_message && (
                        <div style={validation === "ready" ? styles.small : styles.errorMessage}>
                          {installer.validation_message}
                        </div>
                      )}
                      {installer?.validated_at && (
                        <div style={styles.tiny}>
                          {new Date(installer.validated_at).toLocaleString("en-GB")}
                        </div>
                      )}
                    </td>

                    <td style={styles.td}>
                      {formatBytes(installer?.resolved_content_length)}
                    </td>

                    <td style={styles.td}>
                      {installer?.silent_install_args ? (
                        <code style={styles.code}>{installer.silent_install_args}</code>
                      ) : (
                        <span style={styles.small}>Not set</span>
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

function Card({ label, value, hint }) {
  return (
    <div style={styles.card}>
      <span style={styles.cardLabel}>{label}</span>
      <strong style={styles.cardValue}>{value}</strong>
      {hint && <span style={styles.cardHint}>{hint}</span>}
    </div>
  );
}

function ProviderCard({ label, value, style }) {
  return (
    <div style={styles.providerCard}>
      <span style={{ ...styles.providerBadge, ...style }}>{label.toLowerCase()}</span>
      <strong style={styles.providerValue}>{value}</strong>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    background: "#f6f7fb",
    color: "#111827",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 24,
    flexWrap: "wrap",
  },
  eyebrow: { margin: 0, color: "#2563eb", fontWeight: 700, textTransform: "uppercase", fontSize: 12 },
  title: { margin: "4px 0", fontSize: 34, lineHeight: 1.1 },
  subtitle: { margin: 0, color: "#6b7280" },
  actions: { display: "flex", gap: 10, flexWrap: "wrap" },
  button: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#fff",
    color: "#111827",
    textDecoration: "none",
    border: "1px solid #d1d5db",
    fontWeight: 700,
  },
  buttonPrimary: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#2563eb",
    color: "#fff",
    textDecoration: "none",
    border: "1px solid #2563eb",
    fontWeight: 700,
  },
  buttonDark: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#111827",
    color: "#fff",
    textDecoration: "none",
    border: "1px solid #111827",
    fontWeight: 700,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 14,
    marginBottom: 14,
  },
  providerCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 20,
  },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 18 },
  cardLabel: { display: "block", color: "#6b7280", fontSize: 13, marginBottom: 8 },
  cardValue: { display: "block", fontSize: 30 },
  cardHint: { color: "#6b7280", fontSize: 12 },
  providerCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 16,
    padding: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  providerValue: { fontSize: 26 },
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
  panel: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 18, overflow: "hidden" },
  panelHeader: { padding: 18, borderBottom: "1px solid #e5e7eb" },
  panelTitle: { margin: 0, fontSize: 18 },
  muted: { color: "#6b7280", fontSize: 13 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: {
    textAlign: "left",
    padding: "12px 16px",
    background: "#f9fafb",
    color: "#6b7280",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
  },
  td: { padding: "14px 16px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top", whiteSpace: "nowrap" },
  small: { color: "#6b7280", fontSize: 12, marginTop: 4 },
  tiny: { color: "#9ca3af", fontSize: 11, marginTop: 3 },
  warnText: { color: "#92400e", fontSize: 11, marginTop: 5 },
  code: { background: "#f3f4f6", padding: "3px 6px", borderRadius: 6 },
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
    color: "#fff",
    borderRadius: 999,
    padding: "3px 8px",
    fontSize: 12,
    fontWeight: 700,
  },
  providerBadge: {
    display: "inline-block",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  providerWinget: { background: "#dbeafe", color: "#1d4ed8" },
  providerGithub: { background: "#e5e7eb", color: "#111827" },
  providerChocolatey: { background: "#ede9fe", color: "#5b21b6" },
  providerManual: { background: "#f3f4f6", color: "#374151" },
  status: {
    display: "inline-block",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  statusGood: { background: "#dcfce7", color: "#166534" },
  statusWarn: { background: "#fef3c7", color: "#92400e" },
  statusBad: { background: "#fee2e2", color: "#991b1b" },
  statusPending: { background: "#e5e7eb", color: "#374151" },
  errorMessage: { color: "#b91c1c", fontSize: 12, marginTop: 4, maxWidth: 320, whiteSpace: "normal" },
  actionLinks: { display: "flex", gap: 8, alignItems: "center" },
  link: { color: "#2563eb", fontWeight: 700, textDecoration: "none" },
  download: {
    background: "#111827",
    color: "#fff",
    padding: "6px 9px",
    borderRadius: 8,
    fontWeight: 700,
    textDecoration: "none",
  },
};