// Shared helpers for the API routes. Files starting with "_" are not routes on Vercel.
//
// Storage is Vercel Blob, laid out as:
//   pending/<id>.json   one file per waiting suggestion (many visitors write at once)
//   approved.json       every approved recipe (only the owner writes it)
//   status.json         {id: "approved" | "declined"} for reviewed suggestions (only the owner writes it)
//   rate/<kind>/<visitor>/<time>.json   markers used to limit how often someone can act
const crypto = require("crypto");
const { put, get, list, del } = require("@vercel/blob");

const FLAVORS = ["yellow", "white", "chocolate", "lemon", "spice", "funfetti"];
const TYPES = ["cookies", "bars", "breakfast", "nobake", "dessert"];
const ID = /^r[0-9a-f]{12}$/;

// Set by Vercel when a Blob store is connected to the project.
const configured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

// A store is either public or private, chosen when it was created. Find out with one test write.
let access = null;
async function storeAccess() {
  if (access) return access;
  const opts = { contentType: "application/json", addRandomSuffix: false, allowOverwrite: true };
  try {
    await put("meta/probe.json", "{}", { ...opts, access: "private" });
    access = "private";
  } catch {
    await put("meta/probe.json", "{}", { ...opts, access: "public" });
    access = "public";
  }
  return access;
}

async function write(pathname, value) {
  await put(pathname, JSON.stringify(value), {
    access: await storeAccess(), contentType: "application/json",
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60,
  });
}

async function read(pathname, fallback) {
  let r;
  try { r = await get(pathname, { access: await storeAccess(), useCache: false }); }
  catch (err) { if (err && err.name === "BlobNotFoundError") return fallback; throw err; }
  if (!r || r.statusCode !== 200) return fallback;
  try { return JSON.parse(await new Response(r.stream).text()); } catch { return fallback; }
}

async function listAll(prefix) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

const remove = pathnames => (pathnames.length ? del(pathnames) : Promise.resolve());

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

const HOUR = 3600 * 1000;
// How many times this visitor did <kind> in the last hour. Clears out older markers.
async function recentHits(kind, who) {
  const blobs = await listAll(`rate/${kind}/${who}/`);
  const cutoff = Date.now() - HOUR;
  await remove(blobs.filter(b => new Date(b.uploadedAt).getTime() < cutoff).map(b => b.pathname));
  return blobs.filter(b => new Date(b.uploadedAt).getTime() >= cutoff).length;
}
const recordHit = (kind, who) => write(`rate/${kind}/${who}/${Date.now()}-${crypto.randomBytes(3).toString("hex")}.json`, {});

// Compares hashes so the check takes the same time whatever was typed. Not case-sensitive.
function codeMatches(given) {
  const want = process.env.APPROVAL_CODE;
  if (!want || typeof given !== "string") return false;
  const h = s => crypto.createHash("sha256").update(s.trim().toLowerCase()).digest();
  return crypto.timingSafeEqual(h(given), h(want));
}

module.exports = { configured, write, read, listAll, remove, cleanRecipe, visitor, recentHits, recordHit, codeMatches, ID };
