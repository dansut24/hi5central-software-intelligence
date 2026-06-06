"use client";

import { useState } from "react";

export default function ResearchImportPage() {
  const [adminKey, setAdminKey] = useState("");
  const [file, setFile] = useState(null);
  const [clearExisting, setClearExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function uploadCsv() {
    if (!adminKey.trim()) {
      setResult({ ok: false, error: "Admin key required." });
      return;
    }

    if (!file) {
      setResult({ ok: false, error: "Please choose a CSV file." });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clearExisting", clearExisting ? "true" : "false");

      const res = await fetch("/api/software/research/import-csv", {
        method: "POST",
        headers: {
          "x-admin-api-key": adminKey,
        },
        body: formData,
      });

      const json = await res.json();
      setResult(json);
    } catch (error) {
      setResult({ ok: false, error: error.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <p style={styles.eyebrow}>Hi5Central Software Research</p>
        <h1 style={styles.title}>Import Research CSV</h1>
        <p style={styles.subtitle}>
          Upload the 1,000-app curated CSV into the research queue from iPhone,
          iPad, or desktop.
        </p>
      </section>

      <section style={styles.panel}>
        <label style={styles.label}>Admin key</label>
        <input
          style={styles.input}
          value={adminKey}
          onChange={(event) => setAdminKey(event.target.value)}
          type="password"
          placeholder="Admin API key"
        />

        <label style={styles.label}>CSV file</label>
        <input
          style={styles.file}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
        />

        {file && (
          <div style={styles.fileInfo}>
            Selected: <strong>{file.name}</strong>
          </div>
        )}

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={clearExisting}
            onChange={(event) => setClearExisting(event.target.checked)}
          />
          Clear existing non-imported research queue rows first
        </label>

        <button
          style={styles.button}
          onClick={uploadCsv}
          disabled={loading}
        >
          {loading ? "Uploading..." : "Upload CSV"}
        </button>
      </section>

      {result && (
        <section style={styles.panel}>
          <h2 style={styles.panelTitle}>
            {result.ok ? "Import queued" : "Import failed"}
          </h2>

          {result.ok ? (
            <div style={styles.stats}>
              <Stat label="Filename" value={result.filename} />
              <Stat label="Total rows" value={result.total_rows} />
              <Stat label="Valid rows" value={result.valid_rows} />
              <Stat label="Inserted" value={result.inserted_count} />
              <Stat label="Failed batches" value={result.failed_batches} />
            </div>
          ) : (
            <p style={styles.error}>{result.error}</p>
          )}

          {result.preview?.length > 0 && (
            <>
              <h3 style={styles.subTitle}>Preview</h3>
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Vendor</th>
                      <th style={styles.th}>Category</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((item) => (
                      <tr key={item.id}>
                        <td style={styles.td}>{item.name}</td>
                        <td style={styles.td}>{item.vendor || "Unknown"}</td>
                        <td style={styles.td}>{item.category}</td>
                        <td style={styles.td}>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result.errors?.length > 0 && (
            <>
              <h3 style={styles.subTitle}>Errors</h3>
              <pre style={styles.pre}>
                {JSON.stringify(result.errors, null, 2)}
              </pre>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.stat}>
      <span style={styles.statLabel}>{label}</span>
      <strong style={styles.statValue}>{String(value ?? "-")}</strong>
    </div>
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
    marginBottom: 20,
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
    maxWidth: 720,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    width: "100%",
    maxWidth: 480,
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 14,
  },
  file: {
    display: "block",
    marginTop: 6,
    marginBottom: 8,
  },
  fileInfo: {
    color: "#374151",
    fontSize: 13,
    marginTop: 8,
  },
  checkboxRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 16,
    color: "#374151",
    fontSize: 14,
  },
  button: {
    marginTop: 18,
    background: "#111827",
    color: "#ffffff",
    border: "none",
    borderRadius: 10,
    padding: "12px 16px",
    fontWeight: 900,
    cursor: "pointer",
  },
  panelTitle: {
    margin: "0 0 14px",
    fontSize: 20,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
  },
  stat: {
    background: "#f9fafb",
    border: "1px solid #eef2f7",
    borderRadius: 12,
    padding: 12,
  },
  statLabel: {
    display: "block",
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
  },
  subTitle: {
    marginTop: 20,
    fontSize: 16,
  },
  tableWrap: {
    overflowX: "auto",
    marginTop: 10,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb",
    color: "#6b7280",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid #f1f5f9",
  },
  error: {
    color: "#b91c1c",
    fontWeight: 700,
  },
  pre: {
    background: "#111827",
    color: "#ffffff",
    padding: 12,
    borderRadius: 10,
    overflowX: "auto",
  },
};