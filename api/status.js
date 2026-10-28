// GET /api/status?ids=a,b: the review status of suggestions this browser sent.
const { configured, query, ID } = require("./_lib");

module.exports = async (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  const ids = String(req.query.ids || "").split(",").filter(id => ID.test(id)).slice(0, 20);
  if (!ids.length) return res.status(200).json({ items: [] });
  try {
    const rows = await query(`SELECT id, data->>'name' AS name, status, created_at FROM suggestions WHERE id = ANY($1)`, [ids]);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      // A recipe the owner removed after approving shows as "Not added".
      items: rows.map(r => ({ id: r.id, name: r.name, status: r.status === "removed" ? "declined" : r.status, at: Number(r.created_at) })),
    });
  } catch {
    res.status(500).json({ error: "Couldn't load statuses." });
  }
};
