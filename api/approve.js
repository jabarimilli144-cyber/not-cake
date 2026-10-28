// GET  /api/approve?t=TOKEN  shows the recipe with an "Add to site" button.
// POST /api/approve          (form field t) adds it to community.json on GitHub.
// The GET never changes anything, because email apps open links on their own to scan them.
const { esc, readToken, publishRecipe } = require("./_lib");

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Not Cake</title>
<style>
  body { margin: 0; background: #0f0c1a; color: #eee8ff; font: 16px/1.55 system-ui, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 40px max(16px, env(safe-area-inset-left)) 60px; }
  h1 { font-size: 28px; margin: 0 0 8px; } .muted { color: #a99fc8; }
  .meta { font: 13px ui-monospace, monospace; color: #ffc46b; }
  li { margin: 4px 0; } li::marker { color: #b58cff; }
  button, .btn { display: inline-block; font: 600 16px system-ui; border: 0; border-radius: 999px; padding: 12px 22px;
    background: #dcc8ff; color: #0f0c1a; cursor: pointer; text-decoration: none; }
  .box { background: #1a1530; border: 1px solid rgba(196,170,255,.16); border-radius: 16px; padding: 20px; margin: 20px 0; }
</style></head><body><main>${body}</main></body></html>`;
}

function send(res, status, title, body) {
  res.status(status).setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(page(title, body));
}

const expired = `<h1>This link doesn't work</h1><p class="muted">It may have expired (links last 14 days) or been copied incompletely. Nothing was added.</p>`;

module.exports = async (req, res) => {
  const token = req.method === "POST" ? (req.body && req.body.t) : req.query.t;
  const payload = readToken(token);
  if (!payload || !payload.recipe) return send(res, 400, "Link not valid", expired);
  const r = payload.recipe;

  if (req.method !== "POST") {
    return send(res, 200, "Approve " + r.name, `
      <p class="muted">Not Cake · Approve a recipe</p>
      <div class="box">
        <h1>${esc(r.name)}</h1>
        ${r.blurb ? `<p class="muted">${esc(r.blurb)}</p>` : ""}
        <p class="meta">${esc(r.time)} · ${esc(r.yield)} · ${esc(r.temp)} · ${esc(r.flavor)} mix</p>
        <ul>${r.ing.map(i => `<li>${esc(i)}</li>`).join("")}</ul>
        <ol>${r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
        ${r.tip ? `<p><b>Tip:</b> ${esc(r.tip)}</p>` : ""}
      </div>
      <form method="post" action="/api/approve">
        <input type="hidden" name="t" value="${esc(token)}">
        <button type="submit">Add to the site</button>
      </form>
      <p class="muted">Don't want it? Close this page. Nothing changes unless you press the button.</p>`);
  }

  try {
    const result = await publishRecipe({ ...r, approvedAt: Date.now() });
    send(res, 200, "Added", result === "already"
      ? `<h1>Already on the site</h1><p class="muted">“${esc(r.name)}” was approved before. Nothing changed.</p><p><a class="btn" href="/#recipes">See the recipes</a></p>`
      : `<h1>Added!</h1><p class="muted">“${esc(r.name)}” will show up on the site in about a minute, once Vercel finishes updating.</p><p><a class="btn" href="/#recipes">See the recipes</a></p>`);
  } catch {
    send(res, 500, "Couldn't add it", `<h1>Couldn't add it</h1><p class="muted">GitHub didn't accept the change. Check that the GitHub token in Vercel is still valid, then use the link in the email again.</p>`);
  }
};
