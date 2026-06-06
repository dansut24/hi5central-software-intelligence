"use client";

import { useState } from "react";

const PROVIDERS = {
  winget: {
    label: "Winget",
    searchUrl: "/api/winget/search",
    importUrl: "/api/winget/import-and-validate",
    idField: "winget_id",
  },
  github: {
    label: "GitHub",
    searchUrl: "/api/github/search",
    importUrl: "/api/github/import-and-validate",
    idField: "package_id",
  },
};

export default function AdminPage() {
  const [provider, setProvider] = useState("winget");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Imported");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState("");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");

  const activeProvider = PROVIDERS[provider];

  async function searchSoftware() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(
        `${activeProvider.searchUrl}?q=${encodeURIComponent(query)}&limit=15`
      );

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      setResults(json.results || []);
      setMessage(`Found ${json.count} result(s) from ${activeProvider.label}.`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function importPackage(item) {
    const packageId = item[activeProvider.idField];

    setImporting(packageId);
    setMessage("");

    try {
      const body =
        provider === "github"
          ? {
              package_id: packageId,
              category,
              name: item.name,
              vendor: item.vendor,
            }
          : {
              winget_id: packageId,
              category,
            };

      const res = await fetch(activeProvider.importUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!json.ok) throw new Error(json.error);

      setMessage(
        `Imported ${json.imported.name} ${json.imported.version} -- validation: ${json.validation.status}`
      );
    } catch (error) {
      setMessage(error.message);
    } finally {
      setImporting("");
    }
  }

  function getItemId(item) {
    return item.winget_id || item.package_id;
  }

  function getLatest(item) {
    return item.latest_version || item.latest_seen_version || "";
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Hi5Central Admin</p>
          <h1 style={styles.title}>Software Import</h1>
          <p style={styles.subtitle}>
            Search Winget or GitHub, import software, and validate installers in one click.
          </p>
        </div>

        <div style={styles.actions}>
          <a style={styles.button} href="/">
            Dashboard
          </a>
          <a style={styles.buttonDark} href="/api/installers/validate-downloads?limit=100">
            Validate installers
          </a>
        </div>
      </section>

      <section style={styles.panel}>
        <div style={styles.searchRow}>
          <select
            style={styles.select}
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setResults([]);
              setMessage("");
            }}
          >
            <option value="winget">Winget</option>
            <option value="github">GitHub</option>
          </select>

          <input
            style={styles.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              provider === "github"
                ? "Search GitHub, e.g. ventoy, rustdesk, obs"
                : "Search Winget, e.g. adobe reader, chrome, wireshark"
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") searchSoftware();
            }}
          />

          <input
            style={styles.category}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Category"
          />

          <button
            style={styles.primaryButton}
            onClick={searchSoftware}
            disabled={loading || query.trim().length < 2}
          >
            {loading ? "Searching..." : `Search ${activeProvider.label}`}
          </button>
        </div>

        {message && <div style={styles.message}>{message}</div>}
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Search results</h2>
          <span style={styles.muted}>
            {results.length} candidates · {activeProvider.label}
          </span>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Package ID</th>
                <th style={styles.th}>Latest</th>
                <th style={styles.th}>Vendor</th>
                <th style={styles.th}>Installer</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {results.map((item) => {
                const id = getItemId(item);

                return (
                  <tr key={id}>
                    <td style={styles.td}>
                      <strong>{item.name || id}</strong>
                      {item.description && (
                        <div style={styles.small}>{item.description}</div>
                      )}
                      {item.error && <div style={styles.error}>{item.error}</div>}
                    </td>

                    <td style={styles.td}>
                      <code style={styles.code}>{id}</code>
                    </td>

                    <td style={styles.td}>
                      <code style={styles.code}>{getLatest(item) || "Unknown"}</code>
                    </td>

                    <td style={styles.td}>{item.vendor || "Unknown"}</td>

                    <td style={styles.td}>
                      <span style={styles.badge}>
                        {item.installer_type || "unknown"}
                      </span>
                    </td>

                    <td style={styles.td}>
                      <a
                        style={styles.link}
                        href={item.source_url || item.html_url}
                        target="_blank"
                      >
                        View source
                      </a>
                    </td>

                    <td style={styles.td}>
                      <button
                        style={styles.importButton}
                        onClick={() => importPackage(item)}
                        disabled={Boolean(importing) || item.importable === false}
                      >
                        {importing === id ? "Importing..." : "Import + Validate"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {results.length === 0 && (
                <tr>
                  <td style={styles.empty} colSpan={7}>
                    Search for an app to import.
                  </td>
                </tr>
              )}
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
  buttonDark: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#111827",
    color: "#ffffff",
    textDecoration: "none",
    border: "1px solid #111827",
    fontWeight: 700,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 20,
  },
  searchRow: {
    display: "flex",
    gap: 10,
    padding: 18,
    flexWrap: "wrap",
  },
  select: {
    width: 140,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 14,
    background: "#ffffff",
  },
  input: {
    flex: "1 1 320px",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 14,
  },
  category: {
    width: 160,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 14,
  },
  primaryButton: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  message: {
    borderTop: "1px solid #e5e7eb",
    padding: 14,
    color: "#374151",
    background: "#f9fafb",
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
    maxWidth: 360,
    whiteSpace: "normal",
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
  error: {
    color: "#b91c1c",
    fontSize: 12,
    marginTop: 4,
    maxWidth: 360,
    whiteSpace: "normal",
  },
  link: {
    color: "#2563eb",
    fontWeight: 700,
    textDecoration: "none",
  },
  importButton: {
    background: "#111827",
    color: "#ffffff",
    padding: "8px 11px",
    borderRadius: 8,
    fontWeight: 800,
    border: "none",
    cursor: "pointer",
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: "#6b7280",
  },
};