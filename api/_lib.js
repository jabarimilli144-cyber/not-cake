// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.
const crypto = require("crypto");

// Set by Vercel when an Upstash Redis database is connected to the project.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const FLAVORS = ["yellow", "white", "chocolate", "lemon", "spice", "funfetti"];
const TYPES = ["cookies", "bars", "breakfast", "nobake", "dessert"];
const ID = /^r[0-9a-f]{12}$/;

const configured = () => Boolean(REDIS_URL && REDIS_TOKEN);

async function redis(...command) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || `Redis returned ${r.status}`);
  return data.result;
}

// HGETALL comes back as [field, value, field, value, ...].
async function hashValues(key) {
  const flat = (await redis("HGETALL", key)) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    const value = parse(flat[i + 1]);
    if (value) out.push({ ...value, id: flat[i] });
  }
  return out;
}

function parse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
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

const clientIp = req => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";

// Counts hits on a key for a time window. Returns the new count.
async function hit(key, seconds) {
  const n = await redis("INCR", key);
  if (n === 1) await redis("EXPIRE", key, seconds);
  return n;
}

// Compares hashes so the check takes the same time whatever was typed. Not case-sensitive.
function codeMatches(given) {
  const want = process.env.APPROVAL_CODE;
  if (!want || typeof given !== "string") return false;
  const h = s => crypto.createHash("sha256").update(s.trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(h(given), h(want));
}

module.exports = { configured, redis, hashValues, parse, cleanRecipe, clientIp, hit, codeMatches, ID };
