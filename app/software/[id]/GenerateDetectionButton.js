"use client";

import { useState } from "react";

export default function GenerateDetectionButton({ softwareId }) {
  const [adminKey, setAdminKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function generateRule() {
    if (!adminKey.trim()) {
      setMessage("Admin key required.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/detection-rules/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-api-key": adminKey,
        },
        body: JSON.stringify({ software_id: softwareId }),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error || "Failed to generate detection rule");
      }

      setMessage(`Generated ${json.generated_rule.method} rule.`);
      window.location.reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <input
        value={adminKey}
        onChange={(event) => setAdminKey(event.target.value)}
        placeholder="Admin key"
        type="password"
        style={styles.input}
      />

      <button onClick={generateRule} disabled={loading} style={styles.button}>
        {loading ? "Generating..." : "Generate Detection Rule"}
      </button>

      {message && <span style={styles.message}>{message}</span>}
    </div>
  );
}

const styles = {
  wrap: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    alignItems: "center",
  },
  input: {
    padding: "9px 11px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
  },
  button: {
    background: "#111827",
    color: "#ffffff",
    border: "none",
    borderRadius: 8,
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  message: {
    color: "#6b7280",
    fontSize: 12,
  },
};