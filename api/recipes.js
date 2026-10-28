// GET /api/recipes: every approved community recipe.
const { configured, read } = require("./_lib");

module.exports = async (req, res) => {
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  try {
    const { recipes = [] } = await read("approved.json", {});
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ recipes });
  } catch {
    res.status(500).json({ error: "Couldn't load recipes." });
  }
};
