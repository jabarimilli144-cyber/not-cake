// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.
//
// There is no database. A suggestion travels inside a signed link in the approval email,
// and approving it commits the recipe to community.json in the GitHub repo. Vercel then
// redeploys the site with it.
const crypto = require("crypto");

const FLAVORS = ["yellow", "white", "chocolate", "lemon", "spice", "funfetti", "brownie"];
const TYPES = ["cookies", "bars", "breakfast", "nobake", "dessert"];
const REPO = process.env.GITHUB_REPO || "jabarimilli144-cyber/not-cake";
const FILE = "community.json";
const LINK_DAYS = 14;

const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const lines = (v, max) => (Array.isArray(v) ? v.map(x => text(x, 300)).filter(Boolean).slice(0, max) : []);

function cleanRecipe(b = {}) {
  return {
    name: text(b.name, 80),
    flavor: FLAVORS.includes(b.flavor) ? b.flavor : "yellow",
    type: TYPES.includes(b.type) ? b.type : "dessert",
    time: text(b.time, 20), yield: text(b.yield, 30), temp: text(b.temp, 20),
    blurb: text(b.blurb, 160), tip: text(b.tip, 200), by: text(b.by, 40),
    ing: lines(b.ing, 30), steps: lines(b.steps, 30),
  };
}
function recipeProblem(r) {
  if (!r.name) return "Give the recipe a name.";
  if (r.ing.length < 2) return "Add at least two ingredients, one per line.";
  if (!r.steps.length) return "Add the steps, one per line.";
  return null;
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- Signed approval links ----
// The signing key is derived from the GitHub token, so there is no extra secret to set up.
const signingKey = () => crypto.createHash("sha256").update("not-cake-approval:" + (process.env.GITHUB_TOKEN || "")).digest();
const b64 = buf => Buffer.from(buf).toString("base64url");

function signToken(payload) {
  const body = b64(JSON.stringify(payload));
  return body + "." + b64(crypto.createHmac("sha256", signingKey()).update(body).digest());
}
function readToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", signingKey()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

// ---- Rate limits ----
// Kept in memory, so each server instance counts on its own. That's a speed bump against
// spam, not a hard cap: set a monthly spend limit in the Anthropic Console as well.
const hits = new Map();
function allow(kind, req, max) {
  const who = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const key = kind + ":" + who;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < 3600 * 1000);
  if (recent.length >= max) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}

// ---- Email (Resend) ----
async function sendEmail({ subject, html }) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Not Cake <onboarding@resend.dev>",
      to: [process.env.OWNER_EMAIL],
      subject, html,
    }),
  });
  if (!r.ok) throw new Error(`Email failed: ${r.status} ${await r.text()}`);
}

// ---- GitHub ----
async function github(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "not-cake-site",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

// Adds a recipe to community.json. Returns "added" or "already".
async function publishRecipe(recipe) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await github(`contents/${FILE}`);
    let list = { recipes: [] };
    if (cur.status === 200) list = JSON.parse(Buffer.from(cur.data.content, "base64").toString());
    else if (cur.status !== 404) throw new Error(`GitHub read failed: ${cur.status}`);
    if ((list.recipes || []).some(r => r.id === recipe.id)) return "already";
    list.recipes = [...(list.recipes || []), recipe];
    const put = await github(`contents/${FILE}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Add community recipe: ${recipe.name}`,
        content: Buffer.from(JSON.stringify(list, null, 2) + "\n").toString("base64"),
        ...(cur.status === 200 ? { sha: cur.data.sha } : {}),
      }),
    });
    if (put.status === 200 || put.status === 201) return "added";
    if (put.status !== 409) throw new Error(`GitHub write failed: ${put.status}`);
    // 409: someone else changed the file in between. Read it again and retry.
  }
  throw new Error("GitHub kept changing underneath us");
}

const ready = {
  generate: () => Boolean(process.env.ANTHROPIC_API_KEY),
  submit: () => Boolean(process.env.RESEND_API_KEY && process.env.OWNER_EMAIL && process.env.GITHUB_TOKEN),
};

module.exports = { FLAVORS, TYPES, LINK_DAYS, cleanRecipe, recipeProblem, esc, signToken, readToken, allow, sendEmail, publishRecipe, ready };
