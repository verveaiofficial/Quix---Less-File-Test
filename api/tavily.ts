// Vercel serverless proxy for Tavily (bypasses browser CORS blocks)
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  try {
    const key = process.env.VITE_TAVILY_API_KEY || process.env.TAVILY_API_KEY || "";
    if (!key) { res.status(500).json({ error: "Tavily key missing in Vercel env" }); return; }
    const { query, max_results } = req.body || {};
    const out = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, search_depth: "advanced", max_results: max_results || 10 }),
    });
    const data = await out.json();
    res.status(out.ok ? 200 : out.status).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "proxy error" });
  }
}