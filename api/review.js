// POST /api/review: owner-only. Send the approval code in the x-approval-code header.
// Body: {action: "list"} | {action: "approve" | "decline" | "remove", id}
const { configured, write, read, listAll, remove, cleanRecipe, visitor, recentHits, recordHit, codeMatches, ID } = require("./_lib");

const MAX_WRONG_PER_HOUR = 10;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  if (!process.env.APPROVAL_CODE) return res.status(503).json({ error: "The approval code isn't set up in Vercel yet." });

  try {
    const who = visitor(req);
    if ((await recentHits("wrong", who)) >= MAX_WRONG_PER_HOUR) {
      return res.status(429).json({ error: "Too many wrong tries. Wait an hour." });
    }
    if (!codeMatches(req.headers["x-approval-code"])) {
      await recordHit("wrong", who);
      return res.status(401).json({ error: "That code doesn't match." });
    }

    const { action, id } = req.body && typeof req.body === "object" ? req.body : {};
    if (action === "list") {
      const blobs = await listAll("pending/");
      const items = await Promise.all(blobs.map(async b => {
        const item = await read(b.pathname, null);
        return item && { ...item, id: b.pathname.slice("pending/".length, -".json".length) };
      }));
      return res.status(200).json({ pending: items.filter(Boolean).sort((a, b) => (a.at || 0) - (b.at || 0)) });
    }
    if (!ID.test(String(id))) return res.status(400).json({ error: "Unknown recipe." });

    const statuses = await read("status.json", {});
    if (action === "approve" || action === "decline") {
      const item = await read(`pending/${id}.json`, null);
      if (!item) return res.status(404).json({ error: "That suggestion was already handled." });
      if (action === "approve") {
        const { recipes = [] } = await read("approved.json", {});
        recipes.push({ ...cleanRecipe(item), id, at: item.at, approvedAt: Date.now() });
        await write("approved.json", { recipes });
      }
      statuses[id] = action === "approve" ? "approved" : "declined";
      await write("status.json", statuses);
      await remove([`pending/${id}.json`]);
      return res.status(200).json({ ok: true });
    }
    if (action === "remove") {
      const { recipes = [] } = await read("approved.json", {});
      await write("approved.json", { recipes: recipes.filter(r => r.id !== id) });
      statuses[id] = "declined";
      await write("status.json", statuses);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch {
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
};
