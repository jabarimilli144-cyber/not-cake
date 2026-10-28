// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.
const crypto = require("crypto");
const { neon } = require("@neondatabase/serverless");

// Set by Vercel when a Neon Postgres database is connected to the project.
const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const FLAVORS = ["yellow", "white", "chocolate", "lemon", "spice", "funfetti"];
const TYPES = ["cookies", "bars", "breakfast", "nobake", "dessert"];
const ID = /^r[0-9a-f]{12}$/;

const configured = () => Boolean(DB_URL);

let sql = null;
let ready = null;
// Runs a query, creating the tables the first time.
async function query(text, params = []) {
  if (!sql) sql = neon(DB_URL);
  if (!ready) {
    ready = (async () => {
      await sql.query(`CREATE TABLE IF NOT EXISTS suggestions (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at bigint NOT NULL,
        approved_at bigint
      )`);
      await sql.query(`CREATE TABLE IF NOT EXISTS hits (key text NOT NULL, at timestamptz NOT NULL DEFAULT now())`);
    })().catch(err => { ready = null; throw err; });
  }
  await ready;
  return sql.query(text, params);
}

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

// Visitors are counted by a hash of their IP address, never the address itself.
const visitor = req => crypto.createHash("sha256")
  .update(String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown").digest("hex").slice(0, 32);

// How many times this key was recorded in the last hour.
async function recentHits(key) {
  const rows = await query(`SELECT count(*)::int AS n FROM hits WHERE key = $1 AND at > now() - interval '1 hour'`, [key]);
  return rows[0].n;
}
async function recordHit(key) {
  await query(`INSERT INTO hits (key) VALUES ($1)`, [key]);
  if (Math.random() < 0.05) await query(`DELETE FROM hits WHERE at < now() - interval '1 day'`);
}

// Compares hashes so the check takes the same time whatever was typed. Not case-sensitive.
function codeMatches(given) {
  const want = process.env.APPROVAL_CODE;
  if (!want || typeof given !== "string") return false;
  const h = s => crypto.createHash("sha256").update(s.trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(h(given), h(want));
}

const recipeRow = r => ({ ...r.data, id: r.id, at: Number(r.created_at), approvedAt: r.approved_at && Number(r.approved_at) });

module.exports = { configured, query, cleanRecipe, visitor, recentHits, recordHit, codeMatches, recipeRow, ID };
