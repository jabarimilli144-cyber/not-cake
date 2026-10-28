// GET /api/recipes: every approved community recipe.
const { configured, hashValues } = require("./_lib");

module.exports = async (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  try {
    const recipes = (await hashValues("approved")).sort((a, b) => (a.approvedAt || 0) - (b.approvedAt || 0));
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ recipes });
  } catch {
    res.status(500).json({ error: "Couldn't load recipes." });
  }
};
