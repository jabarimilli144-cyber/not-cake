// GET /api/status?ids=a,b: the review status of suggestions this browser sent.
// Anything not reviewed yet is still waiting, so only reviewed ones are returned.
const { configured, read, ID } = require("./_lib");

module.exports = async (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  const ids = String(req.query.ids || "").split(",").filter(id => ID.test(id)).slice(0, 20);
  try {
    const all = ids.length ? await read("status.json", {}) : {};
    const statuses = {};
    for (const id of ids) if (all[id]) statuses[id] = all[id];
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ statuses });
  } catch {
    res.status(500).json({ error: "Couldn't load statuses." });
  }
};
