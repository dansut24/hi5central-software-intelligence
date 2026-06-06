"use client";

import { useEffect, useState } from "react";

const [editing, setEditing] = useState(null);

const STATUSES = ["pending", "researched", "needs_review", "imported", "failed"];

export default function SoftwareResearchPage() {
  const [adminKey, setAdminKey] = useState("");
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRows(nextStatus = status) {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/software/research/list?status=${nextStatus}&limit=50`, {
        headers: {
          "x-admin-api-key": adminKey,
        },
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      setRows(json.rows || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function processNext(limit = 10) {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/software/research/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-api-key": adminKey,
        },
        body: JSON.stringify({ limit }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      setMessage(
        `Processed ${json.count}. Researched: ${json.researched}, Needs review: ${json.needs_review}, Failed: ${json.failed}`
      );

      await loadRows(status);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit() {
  if (!editing) return;

  setLoading(true);
  setMessage("");

  try {
    const res = await fetch("/api/software/research/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-api-key": adminKey,
      },
      body: JSON.stringify(editing),
    });

    const json = await res.json();
    if (!json.ok) throw new Error(json.error);

    setEditing(null);
    setMessage("Row updated. Process it again to validate the new URL.");
    await loadRows(status);
  } catch (error) {
    setMessage(error.message);
  } finally {
    setLoading(false);
  }
}
  
  
  async function approveRow(id) {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/software/research/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-api-key": adminKey,
        },
        body: JSON.stringify({ id }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      setMessage(`Imported ${json.imported.name}`);
      await loadRows(status);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (adminKey.trim()) {
      loadRows(status);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Hi5Central Software Intelligence</p>
          <h1 style={styles.title}>Research Queue</h1>
          <p style={styles.subtitle}>
            Process, review, and approve curated software rows into the live catalogue.
          </p>
        </div>

        <a style={styles.button} href="/software/research-import">
          Import CSV
        </a>
      </section>

      <section style={styles.panel}>
        <div style={styles.toolbar}>
          <input
            style={styles.input}
            type="password"
            placeholder="Admin key"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
          />

          <button style={styles.primaryButton} onClick={() => loadRows(status)} disabled={loading || !adminKey}>
            Load
          </button>

          <button style={styles.darkButton} onClick={() => processNext(10)} disabled={loading || !adminKey}>
            Process next 10
          </button>
        </div>

        <div style={styles.tabs}>
          {STATUSES.map((item) => (
            <button
              key={item}
              style={item === status ? styles.activeTab : styles.tab}
              onClick={() => setStatus(item)}
            >
              {item.replace("_", " ")}
            </button>
          ))}
        </div>

        {message && <div style={styles.message}>{message}</div>}
      </section>

      <section style={styles.panel}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>{status.replace("_", " ")} rows</h2>
          <span style={styles.muted}>{rows.length} loaded</span>
        </div>

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Vendor</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Confidence</th>
                <th style={styles.th}>Download</th>
                <th style={styles.th}>Detection</th>
                <th style={styles.th}>Action</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>
                    <strong>{row.name}</strong>
                    <div style={styles.small}>{row.id}</div>
                  </td>

                  <td style={styles.td}>{row.vendor || "Unknown"}</td>
                  <td style={styles.td}>{row.category || "Uncategorised"}</td>
                  <td style={styles.td}>{row.confidence ?? "-"}</td>

                  <td style={styles.td}>
                    {row.download_url ? (
                      <a style={styles.link} href={row.download_url} target="_blank">
                        Download
                      </a>
                    ) : (
                      "Missing"
                    )}
                  </td>

                  <td style={styles.td}>
                    <code style={styles.code}>
                      {row.detection_method || "none"}
                    </code>
                    {row.detection_value && (
                      <div style={styles.small}>{row.detection_value}</div>
                    )}
                  </td>

                  <td style={styles.td}>
  {row.status === "researched" || row.status === "needs_review" ? (
    <div style={styles.actionGroup}>
      <button
        style={styles.secondaryButton}
        onClick={() => setEditing(row)}
        disabled={loading}
      >
        Edit
      </button>

      <button
        style={styles.importButton}
        onClick={() => approveRow(row.id)}
        disabled={loading}
      >
        Approve
      </button>
    </div>
  ) : row.imported_software_id ? (
    <a style={styles.link} href={`/software/${row.imported_software_id}`}>
      Open
    </a>
  ) : (
    <span style={styles.muted}>No action</span>
  )}
</td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td style={styles.empty} colSpan={7}>
                    No rows loaded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      
      {editing && (
  <section style={styles.modalBackdrop}>
    <div style={styles.modal}>
      <h2 style={styles.panelTitle}>Edit research row</h2>

      {[
        ["name", "Name"],
        ["vendor", "Vendor"],
        ["category", "Category"],
        ["homepage_url", "Homepage URL"],
        ["release_url", "Release URL"],
        ["download_url", "Direct download URL"],
        ["installer_type", "Installer type"],
        ["silent_install_args", "Silent install args"],
        ["silent_uninstall_args", "Silent uninstall args"],
        ["detection_method", "Detection method"],
        ["detection_value", "Detection value"],
      ].map(([field, label]) => (
        <label key={field} style={styles.editLabel}>
          {label}
          <input
            style={styles.editInput}
            value={editing[field] || ""}
            onChange={(event) =>
              setEditing({
                ...editing,
                [field]: event.target.value,
              })
            }
          />
        </label>
      ))}

      <div style={styles.modalActions}>
        <button style={styles.primaryButton} onClick={saveEdit} disabled={loading}>
          Save
        </button>
        <button
          style={styles.button}
          onClick={() => setEditing(null)}
          disabled={loading}
        >
          Cancel
        </button>
      </div>
    </div>
  </section>
)}


    </main>
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
  panel: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 18,
    overflow: "hidden",
    marginBottom: 20,
  },
  toolbar: {
    display: "flex",
    gap: 10,
    padding: 18,
    flexWrap: "wrap",
  },
  input: {
    flex: "1 1 260px",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    fontSize: 14,
  },
  button: {
    padding: "10px 14px",
    borderRadius: 10,
    background: "#ffffff",
    color: "#111827",
    textDecoration: "none",
    border: "1px solid #d1d5db",
    fontWeight: 800,
  },
  primaryButton: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 900,
  },
  darkButton: {
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #111827",
    background: "#111827",
    color: "#ffffff",
    fontWeight: 900,
  },
  tabs: {
    display: "flex",
    gap: 8,
    padding: "0 18px 18px",
    flexWrap: "wrap",
  },
  tab: {
    padding: "8px 11px",
    borderRadius: 999,
    border: "1px solid #d1d5db",
    background: "#ffffff",
    fontWeight: 800,
    textTransform: "capitalize",
  },
  activeTab: {
    padding: "8px 11px",
    borderRadius: 999,
    border: "1px solid #2563eb",
    background: "#eff6ff",
    color: "#2563eb",
    fontWeight: 900,
    textTransform: "capitalize",
  },
  message: {
    borderTop: "1px solid #e5e7eb",
    padding: 14,
    background: "#f9fafb",
    color: "#374151",
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
    textTransform: "capitalize",
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
  },
  small: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 4,
    maxWidth: 360,
    wordBreak: "break-word",
  },
  code: {
    background: "#f3f4f6",
    padding: "3px 6px",
    borderRadius: 6,
  },
  link: {
    color: "#2563eb",
    fontWeight: 800,
    textDecoration: "none",
  },
  importButton: {
    background: "#111827",
    color: "#ffffff",
    padding: "8px 11px",
    borderRadius: 8,
    fontWeight: 900,
    border: "none",
  },
  empty: {
    padding: 24,
    textAlign: "center",
    color: "#6b7280",
  },
  secondaryButton: {
  background: "#ffffff",
  color: "#111827",
  padding: "8px 11px",
  borderRadius: 8,
  fontWeight: 900,
  border: "1px solid #d1d5db",
  marginRight: 8,
},
modalBackdrop: {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
},
modal: {
  width: "100%",
  maxWidth: 720,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#ffffff",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
},
editLabel: {
  display: "block",
  fontSize: 13,
  fontWeight: 800,
  color: "#374151",
  marginTop: 12,
},
editInput: {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
},
modalActions: {
  display: "flex",
  gap: 10,
  marginTop: 18,
  flexWrap: "wrap",
},
actionGroup: {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
},
};