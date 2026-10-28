// POST /api/suggest: anyone can send a recipe. It waits as "pending" until approved.
const crypto = require("crypto");
const { configured, query, cleanRecipe, visitor, recentHits, recordHit } = require("./_lib");

const MAX_PENDING = 300;
const MAX_PER_HOUR = 5;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  const body = req.body && typeof req.body === "object" ? req.body : {};

  // Bots fill in the hidden "website" field. Pretend it worked and store nothing.
  if (body.website) return res.status(200).json({ id: "r" + crypto.randomBytes(6).toString("hex") });

  const recipe = cleanRecipe(body);
  if (!recipe.name) return res.status(400).json({ error: "Give the recipe a name." });
  if (recipe.ing.length < 2) return res.status(400).json({ error: "Add at least two ingredients, one per line." });
  if (!recipe.steps.length) return res.status(400).json({ error: "Add the steps, one per line." });

  try {
    const key = "suggest:" + visitor(req);
    if ((await recentHits(key)) >= MAX_PER_HOUR) {
      return res.status(429).json({ error: "Too many suggestions. Try again in an hour." });
    }
    const [{ n }] = await query(`SELECT count(*)::int AS n FROM suggestions WHERE status = 'pending'`);
    if (n >= MAX_PENDING) return res.status(507).json({ error: "The suggestion box is full." });

    const id = "r" + crypto.randomBytes(6).toString("hex");
    await query(`INSERT INTO suggestions (id, data, created_at) VALUES ($1, $2, $3)`, [id, JSON.stringify(recipe), Date.now()]);
    await recordHit(key);
    res.status(200).json({ id });
  } catch {
    res.status(500).json({ error: "Couldn't save the suggestion." });
  }
};
