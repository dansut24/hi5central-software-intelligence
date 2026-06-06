import GenerateDetectionButton from "./GenerateDetectionButton";

async function getSoftware(id) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/software/${id}`, {
    cache: "no-store",
  });

  if (!res.ok) return null;
  return res.json();
}

function formatDate(value) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString("en-GB");
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return "Unknown";
  if (size > 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function statusStyle(status) {
  if (status === "ready" || status === "success") return styles.good;
  if (status === "needs_resolver") return styles.warn;
  if (status === "broken" || status === "failed") return styles.bad;
  return styles.pending;
}

function providerStyle(provider) {
  if (provider === "winget") return styles.winget;
  if (provider === "github") return styles.github;
  if (provider === "chocolatey") return styles.chocolatey;
  return styles.manual;
}

function detectionSummary(rule) {
  if (rule.method === "registry") {
    return `${rule.registry_hive}\\${rule.registry_path} → ${rule.registry_value}`;
  }

  if (rule.method === "file") {
    return rule.file_path;
  }

  if (rule.method === "command") {
    return rule.version_command;
  }

  return "Unknown";
}

export default async function SoftwareDetailsPage({ params }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;

  const data = await getSoftware(id);

  if (!data?.ok) {
    return (
      <main style={styles.page}>
        <a style={styles.backLink} href="/">← Back to dashboard</a>
        <section style={styles.panel}>
          <h1 style={styles.title}>Software not found</h1>
          <p style={styles.muted}>{data?.error || "Unable to load software."}</p>
        </section>
      </main>
    );
  }

  const software = data.software;
  const latestVersion = data.versions?.[0]?.version || "Unknown";
  const readyInstallers = (data.installers || []).filter(
    (item) => item.validation_status === "ready"
  ).length;

  return (
    <main style={styles.page}>
      <a style={styles.backLink} href="/">← Back to dashboard</a>

      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Software Details</p>
          <h1 style={styles.title}>{software.name}</h1>
          <p style={styles.subtitle}>
            {software.vendor || "Unknown vendor"} · {software.category || "Uncategorised"}
          </p>
          <p style={styles.tiny}>{software.winget_id}</p>
        </div>

        <div style={styles.actions}>
          {software.homepage_url && (
            <a style={styles.button} href={software.homepage_url} target="_blank">
              Homepage
            </a>
          )}
          <a style={styles.buttonDark} href="/admin">
            Import more
          </a>
        </div>
      </section>

      <section style={styles.cards}>
        <Card label="Latest Version" value={latestVersion} />
        <Card label="Installers" value={data.installers?.length || 0} hint={`${readyInstallers} ready`} />
        <Card label="Detection Rules" value={data.detection_rules?.length || 0} />
        <Card label="Sources" value={data.sources?.length || 0} />
      </section>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>General</h2>
        <div style={styles.grid}>
          <Info label="Name" value={software.name} />
          <Info label="Vendor" value={software.vendor || "Unknown"} />
          <Info label="Category" value={software.category || "Uncategorised"} />
          <Info label="Active" value={software.active ? "Yes" : "No"} />
          <Info label="Created" value={formatDate(software.created_at)} />
          <Info label="Updated" value={formatDate(software.updated_at)} />
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>Installers</h2>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Provider</th>
                <th style={styles.th}>Platform</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Validation</th>
                <th style={styles.th}>Size</th>
                <th style={styles.th}>Silent install</th>
                <th style={styles.th}>Download</th>
              </tr>
            </thead>

            <tbody>
              {(data.installers || []).map((installer) => (
                <tr key={installer.id}>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, ...providerStyle(installer.provider) }}>
                      {installer.provider || "manual"}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {installer.platform} · {installer.architecture}
                  </td>
                  <td style={styles.td}>{installer.installer_type}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.status, ...statusStyle(installer.validation_status) }}>
                      {installer.validation_status || "pending"}
                    </span>
                    <div style={styles.small}>{installer.validation_message}</div>
                  </td>
                  <td style={styles.td}>{formatBytes(installer.resolved_content_length)}</td>
                  <td style={styles.td}>
                    <code style={styles.code}>{installer.silent_install_args || "Not set"}</code>
                  </td>
                  <td style={styles.td}>
                    <a
                      style={styles.download}
                      href={installer.resolved_download_url || installer.download_url}
                      target="_blank"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}

              {(!data.installers || data.installers.length === 0) && (
                <tr>
                  <td style={styles.empty} colSpan={7}>No installers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>Version History</h2>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Version</th>
                <th style={styles.th}>Discovered</th>
                <th style={styles.th}>Release</th>
              </tr>
            </thead>

            <tbody>
              {(data.versions || []).map((version) => (
                <tr key={version.id}>
                  <td style={styles.td}>
                    <code style={styles.code}>{version.version}</code>
                  </td>
                  <td style={styles.td}>
                    {formatDate(version.discovered_at || version.created_at)}
                  </td>
                  <td style={styles.td}>
                    {version.release_url ? (
                      <a style={styles.link} href={version.release_url} target="_blank">
                        View release
                      </a>
                    ) : (
                      <span style={styles.small}>None</span>
                    )}
                  </td>
                </tr>
              ))}

              {(!data.versions || data.versions.length === 0) && (
                <tr>
                  <td style={styles.empty} colSpan={3}>No versions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    <section style={styles.panel}>
  <div style={styles.sectionHeader}>
    <h2 style={styles.panelTitle}>Detection Rules</h2>
    <GenerateDetectionButton softwareId={software.id} />
  </div>
  
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Method</th>
                <th style={styles.th}>Platform</th>
                <th style={styles.th}>Rule</th>
                <th style={styles.th}>Updated</th>
              </tr>
            </thead>

            <tbody>
              {(data.detection_rules || []).map((rule) => (
                <tr key={rule.id}>
                  <td style={styles.td}>
                    <span style={styles.badge}>{rule.method}</span>
                  </td>
                  <td style={styles.td}>{rule.platform}</td>
                  <td style={styles.td}>
                    <code style={styles.code}>{detectionSummary(rule)}</code>
                  </td>
                  <td style={styles.td}>{formatDate(rule.updated_at)}</td>
                </tr>
              ))}

              {(!data.detection_rules || data.detection_rules.length === 0) && (
                <tr>
                  <td style={styles.empty} colSpan={4}>No detection rules found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.panel}>
        <h2 style={styles.panelTitle}>Sources</h2>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Type</th>
                <th style={styles.th}>Enabled</th>
                <th style={styles.th}>Latest Check</th>
              </tr>
            </thead>

            <tbody>
              {(data.sources || []).map((source) => {
                const check = source.source_check_runs?.[0];

                return (
                  <tr key={source.id}>
                    <td style={styles.td}>{source.source_name}</td>
                    <td style={styles.td}>{source.source_type}</td>
                    <td style={styles.td}>{source.enabled ? "Yes" : "No"}</td>
                    <td style={styles.td}>
                      {check ? (
                        <>
                          <span style={{ ...styles.status, ...statusStyle(check.status) }}>
                            {check.status}
                          </span>
                          <div style={styles.small}>{check.detected_version}</div>
                          <div style={styles.tiny}>{formatDate(check.checked_at)}</div>
                        </>
                      ) : (
                        <span style={styles.small}>Never checked</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {(!data.sources || data.sources.length === 0) && (
                <tr>
                  <td style={styles.empty} colSpan={4}>No sources found.</td>
                </tr>
              )}
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

function Info({ label, value }) {
  return (
    <div style={styles.info}>
      <span style={styles.infoLabel}>{label}</span>
      <strong style={styles.infoValue}>{value}</strong>
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
  backLink: {
    display: "inline-block",
    marginBottom: 18,
    color: "#2563eb",
    fontWeight: 800,
    textDecoration: "none",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    marginBottom: 20,
    flexWrap: "wrap",
  },
  eyebrow: {
    margin: 0,
    color: "#2563eb",
    fontWeight: 800,
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
  tiny: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 4,
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
    display: "block",
    fontSize: 28,
  },
  cardHint: {
    color: "#6b7280",
    fontSize: 12,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    overflow: "hidden",
    padding: 18,
    marginBottom: 20,
  },
  panelTitle: {
  margin: 0,
  fontSize: 18,
},
  muted: {
    color: "#6b7280",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  info: {
    background: "#f9fafb",
    border: "1px solid #eef2f7",
    borderRadius: 12,
    padding: 12,
  },
  infoLabel: {
    display: "block",
    color: "#6b7280",
    fontSize: 12,
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 14,
  },
  tableWrap: {
    overflowX: "auto",
    margin: "0 -18px -18px",
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
    borderTop: "1px solid #e5e7eb",
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
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 800,
    background: "#eef2ff",
    color: "#3730a3",
  },
  status: {
    display: "inline-block",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  good: { background: "#dcfce7", color: "#166534" },
  warn: { background: "#fef3c7", color: "#92400e" },
  bad: { background: "#fee2e2", color: "#991b1b" },
  pending: { background: "#e5e7eb", color: "#374151" },
  winget: { background: "#dbeafe", color: "#1d4ed8" },
  github: { background: "#e5e7eb", color: "#111827" },
  chocolatey: { background: "#ede9fe", color: "#5b21b6" },
  manual: { background: "#f3f4f6", color: "#374151" },
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
    fontWeight: 800,
    textDecoration: "none",
  },
  empty: {
    padding: 24,
    color: "#6b7280",
    textAlign: "center",
  },
  sectionHeader: {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 14,
},
};