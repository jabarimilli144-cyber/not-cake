// POST /api/generate: the recipe chat. Body: {messages: [{role: "user" | "assistant", content}]}
// Returns {reply, recipe} where recipe is null when the request wasn't for a recipe.
const Anthropic = require("@anthropic-ai/sdk");
const { FLAVORS, TYPES, cleanRecipe, allow, ready } = require("./_lib");

const client = new Anthropic();
const MAX_PER_HOUR = 12;

const SYSTEM = `You write recipes for Not Cake, a site of easy recipes that start from a boxed baking mix (cake mix, brownie mix, corn muffin mix and the like) and use it differently than the box's own directions say.

For each request, write one recipe that fits what the person asked for. Rules:
- A boxed mix must be a main ingredient. Name it with its box size, like "1 box (15.25 oz) yellow cake mix", "1 box (18 oz) brownie mix" or "1 box (8.5 oz) corn muffin mix".
- Don't follow the box's directions or make what the box makes: no cake, cupcakes, plain brownies, plain muffins or plain cornbread. Change the method, the add-ins or the shape so it becomes something else.
- Use US measurements and Fahrenheit, and real quantities, times and temperatures a home cook can follow. If raw mix is eaten without baking, include heat-treating it to 160 °F.
- "flavor" is the mix the recipe needs (cornbread means corn muffin mix). "type" is: cookies, bars, breakfast, nobake (no oven), dessert (other sweets) or savory.
- Keep "time", "yield" and "temp" short, like "25 min", "24 cookies", "350 °F" or "No oven".
- "reply" is one or two friendly sentences to the person, in plain language. Don't repeat the recipe in it.

If the message isn't asking for food, or asks for something unsafe, set has_recipe to false, say in "reply" what you can help with, and fill the recipe fields with empty values.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "has_recipe", "recipe"],
  properties: {
    reply: { type: "string" },
    has_recipe: { type: "boolean" },
    recipe: {
      type: "object",
      additionalProperties: false,
      required: ["name", "flavor", "type", "time", "yield", "temp", "blurb", "ing", "steps", "tip"],
      properties: {
        name: { type: "string" },
        flavor: { type: "string", enum: FLAVORS },
        type: { type: "string", enum: TYPES },
        time: { type: "string" },
        yield: { type: "string" },
        temp: { type: "string" },
        blurb: { type: "string" },
        ing: { type: "array", items: { type: "string" } },
        steps: { type: "array", items: { type: "string" } },
        tip: { type: "string" },
      },
    },
  },
};

// Keeps the last few turns, in a shape the API accepts: alternating, starting and ending with the user.
function conversation(raw) {
  const turns = (Array.isArray(raw) ? raw : [])
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, 1500) }))
    .slice(-8);
  const out = [];
  for (const t of turns) {
    if (out.length && out[out.length - 1].role === t.role) out[out.length - 1] = t;
    else out.push(t);
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out.length && out[out.length - 1].role === "user" ? out : null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!ready.generate()) return res.status(503).json({ error: "The recipe chat isn't set up yet." });
  const messages = conversation(req.body && req.body.messages);
  if (!messages) return res.status(400).json({ error: "Type what you'd like to make." });
  if (!allow("generate", req, MAX_PER_HOUR)) {
    return res.status(429).json({ error: "You've asked for a lot of recipes. Try again in an hour." });
  }

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: "I can't help with that one. Ask me for a cake-mix recipe instead.", recipe: null });
    }
    const textBlock = response.content.find(b => b.type === "text");
    const out = JSON.parse(textBlock ? textBlock.text : "{}");
    const recipe = out.has_recipe ? cleanRecipe(out.recipe) : null;
    res.status(200).json({
      reply: String(out.reply || "").slice(0, 600),
      recipe: recipe && recipe.name && recipe.ing.length && recipe.steps.length ? recipe : null,
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "The recipe chat is busy. Try again in a minute." });
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: "The recipe chat isn't set up correctly." });
    if (err instanceof Anthropic.APIError && err.status === 400) return res.status(503).json({ error: "The recipe chat is out of credit or misconfigured." });
    res.status(500).json({ error: "Couldn't write a recipe right now. Try again." });
  }
};
