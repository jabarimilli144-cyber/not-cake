// POST /api/review: owner-only. Send the approval code in the x-approval-code header.
// Body: {action: "list"} | {action: "approve" | "decline" | "remove", id}
const { configured, query, cleanRecipe, visitor, recentHits, recordHit, codeMatches, recipeRow, ID } = require("./_lib");

const MAX_WRONG_PER_HOUR = 10;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!configured()) return res.status(503).json({ error: "Storage isn't connected yet." });
  if (!process.env.APPROVAL_CODE) return res.status(503).json({ error: "The approval code isn't set up in Vercel yet." });

  try {
    const wrongKey = "wrong:" + visitor(req);
    if ((await recentHits(wrongKey)) >= MAX_WRONG_PER_HOUR) {
      return res.status(429).json({ error: "Too many wrong tries. Wait an hour." });
    }
    if (!codeMatches(req.headers["x-approval-code"])) {
      await recordHit(wrongKey);
      return res.status(401).json({ error: "That code doesn't match." });
    }

    const { action, id } = req.body && typeof req.body === "object" ? req.body : {};
    if (action === "list") {
      const rows = await query(`SELECT * FROM suggestions WHERE status = 'pending' ORDER BY created_at`);
      return res.status(200).json({ pending: rows.map(recipeRow) });
    }
    if (!ID.test(String(id))) return res.status(400).json({ error: "Unknown recipe." });

    let rows;
    if (action === "approve") {
      const [row] = await query(`SELECT data FROM suggestions WHERE id = $1 AND status = 'pending'`, [id]);
      if (!row) return res.status(404).json({ error: "That suggestion was already handled." });
      rows = await query(`UPDATE suggestions SET status = 'approved', approved_at = $2, data = $3 WHERE id = $1 AND status = 'pending' RETURNING id`,
        [id, Date.now(), JSON.stringify(cleanRecipe(row.data))]);
    } else if (action === "decline") {
      rows = await query(`UPDATE suggestions SET status = 'declined' WHERE id = $1 AND status = 'pending' RETURNING id`, [id]);
    } else if (action === "remove") {
      rows = await query(`UPDATE suggestions SET status = 'removed' WHERE id = $1 AND status = 'approved' RETURNING id`, [id]);
    } else {
      return res.status(400).json({ error: "Unknown action." });
    }
    if (!rows.length) return res.status(404).json({ error: "That suggestion was already handled." });
    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
};
