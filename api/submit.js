// POST /api/submit: send a recipe (typed in, or from the chat) to the owner for approval.
// Emails the owner a signed link. Nothing is stored until they approve it.
const crypto = require("crypto");
const { LINK_DAYS, cleanRecipe, recipeProblem, esc, signToken, allow, sendEmail, ready } = require("./_lib");

const MAX_PER_HOUR = 5;

function siteUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `https://${host}`;
}

function emailHtml(recipe, link, source) {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#1d1830">
    <p style="color:#6b5f8a;font-size:13px;margin:0 0 4px">NOT CAKE · ${source === "chat" ? "FROM THE RECIPE CHAT" : "SUGGESTED BY A VISITOR"}</p>
    <h1 style="font-size:24px;margin:0 0 8px">${esc(recipe.name)}</h1>
    ${recipe.blurb ? `<p style="margin:0 0 12px;color:#4a4163">${esc(recipe.blurb)}</p>` : ""}
    <p style="font-size:14px;color:#4a4163;margin:0 0 16px">${esc(recipe.time)} · ${esc(recipe.yield)} · ${esc(recipe.temp)} · ${esc(recipe.flavor)} mix${recipe.by ? ` · from ${esc(recipe.by)}` : ""}</p>
    <h3 style="margin:0 0 6px">Ingredients</h3>
    <ul style="margin:0 0 16px;padding-left:20px">${recipe.ing.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
    <h3 style="margin:0 0 6px">Steps</h3>
    <ol style="margin:0 0 16px;padding-left:20px">${recipe.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
    ${recipe.tip ? `<p style="margin:0 0 20px"><b>Tip:</b> ${esc(recipe.tip)}</p>` : ""}
    <p style="margin:24px 0"><a href="${link}" style="background:#6d38d1;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Review and add to the site</a></p>
    <p style="font-size:13px;color:#6b5f8a">Nothing is added until you press the button on that page. To say no, ignore this email. The link works for ${LINK_DAYS} days.</p>
  </div>`;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!ready.submit()) return res.status(503).json({ error: "Suggestions aren't set up yet." });
  const body = req.body && typeof req.body === "object" ? req.body : {};

  const id = "r" + crypto.randomBytes(6).toString("hex");
  // Bots fill in the hidden "website" field. Pretend it worked and send nothing.
  if (body.website) return res.status(200).json({ id });

  const recipe = cleanRecipe(body.recipe);
  const problem = recipeProblem(recipe);
  if (problem) return res.status(400).json({ error: problem });
  if (!allow("submit", req, MAX_PER_HOUR)) {
    return res.status(429).json({ error: "You've sent several recipes already. Try again in an hour." });
  }

  const source = body.source === "chat" ? "chat" : "form";
  const token = signToken({ recipe: { ...recipe, id }, exp: Date.now() + LINK_DAYS * 86400 * 1000 });
  const link = `${siteUrl(req)}/api/approve?t=${token}`;
  try {
    await sendEmail({ subject: `Approve recipe: ${recipe.name}`, html: emailHtml(recipe, link, source) });
    res.status(200).json({ id });
  } catch {
    res.status(500).json({ error: "Couldn't send it for review. Try again." });
  }
};
