// POST /api/suggest: anyone can send a recipe. It waits in "pending" until approved.
const crypto = require("crypto");
const { configured, redis, cleanRecipe, clientIp, hit } = require("./_lib");

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
    if ((await hit("rate:suggest:" + clientIp(req), 3600)) > MAX_PER_HOUR) {
      return res.status(429).json({ error: "Too many suggestions. Try again in an hour." });
    }
    if ((await redis("HLEN", "pending")) >= MAX_PENDING) {
      return res.status(507).json({ error: "The suggestion box is full." });
    }
    const id = "r" + crypto.randomBytes(6).toString("hex");
    const at = Date.now();
    await redis("HSET", "pending", id, JSON.stringify({ ...recipe, at }));
    await redis("HSET", "status", id, JSON.stringify({ name: recipe.name, status: "pending", at }));
    res.status(200).json({ id });
  } catch {
    res.status(500).json({ error: "Couldn't save the suggestion." });
  }
};
