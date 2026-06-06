const TAVILY_URL = "https://api.tavily.com/search";

const BLOCKED_DOMAINS = [
  "softonic.com",
  "filehippo.com",
  "uptodown.com",
  "cnet.com",
  "download.com",
];

export async function searchOfficialSoftware(query) {
  const response = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query: `${query} official download`,
      search_depth: "advanced",
      max_results: 10,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily HTTP ${response.status}`);
  }

  const json = await response.json();

  return (json.results || []).filter((result) => {
    try {
      const host = new URL(result.url).hostname;
      return !BLOCKED_DOMAINS.some((d) => host.includes(d));
    } catch {
      return false;
    }
  });
}