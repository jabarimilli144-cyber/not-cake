// GET /api/status?ids=a,b: the review status of suggestions this browser sent.
const { configured, redis, parse, ID } = require("./_lib");

module.exports = async (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  const ids = String(req.query.ids || "").split(",").filter(id => ID.test(id)).slice(0, 20);
  if (!ids.length) return res.status(200).json({ items: [] });
  try {
    const raw = await redis("HMGET", "status", ...ids);
    const items = raw.map((r, i) => { const s = parse(r); return s && { ...s, id: ids[i] }; }).filter(Boolean);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ items });
  } catch {
    res.status(500).json({ error: "Couldn't load statuses." });
  }
};
