export default function HomePage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Hi5Central Software Intelligence</h1>
      <p>Clean Tier 1 vendor-direct release tracking.</p>

      <h2>Test endpoints</h2>

      <ul>
        <li>/api/sources/seed</li>
        <li>/api/sources/check?limit=10</li>
        <li>/api/sources/status</li>
      </ul>
    </main>
  );
}