// POST /api/review: owner-only. Send the approval code in the x-approval-code header.
// Body: {action: "list"} | {action: "approve" | "decline" | "remove", id}
const { configured, redis, hashValues, parse, cleanRecipe, clientIp, hit, codeMatches, ID } = require("./_lib");

const MAX_WRONG_PER_HOUR = 10;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  if (!process.env.APPROVAL_CODE) return res.status(503).json({ error: "The approval code isn't set up in Vercel yet." });

  try {
    const wrongKey = "rate:wrong:" + clientIp(req);
    if (Number(await redis("GET", wrongKey)) >= MAX_WRONG_PER_HOUR) {
      return res.status(429).json({ error: "Too many wrong tries. Wait an hour." });
    }
    if (!codeMatches(req.headers["x-approval-code"])) {
      await hit(wrongKey, 3600);
      return res.status(401).json({ error: "That code doesn't match." });
    }

    const { action, id } = req.body && typeof req.body === "object" ? req.body : {};
    if (action === "list") {
      return res.status(200).json({ pending: await hashValues("pending") });
    }
    if (!ID.test(String(id))) return res.status(400).json({ error: "Unknown recipe." });

    if (action === "remove") {
      await redis("HDEL", "approved", id);
      return res.status(200).json({ ok: true });
    }
    if (action === "approve" || action === "decline") {
      const item = parse(await redis("HGET", "pending", id));
      if (!item) return res.status(404).json({ error: "That suggestion was already handled." });
      if (action === "approve") {
        await redis("HSET", "approved", id, JSON.stringify({ ...cleanRecipe(item), approvedAt: Date.now() }));
      }
      await redis("HDEL", "pending", id);
      await redis("HSET", "status", id, JSON.stringify({ name: item.name, status: action === "approve" ? "approved" : "declined", at: item.at }));
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "Unknown action." });
  } catch {
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
};
