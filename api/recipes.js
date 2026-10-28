// GET /api/recipes: every approved community recipe.
const { configured, query, recipeRow } = require("./_lib");

module.exports = async (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  try {
    const rows = await query(`SELECT * FROM suggestions WHERE status = 'approved' ORDER BY approved_at`);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ recipes: rows.map(recipeRow) });
  } catch {
    res.status(500).json({ error: "Couldn't load recipes." });
  }
};
