# Not Cake

Twelve recipes that turn a box of cake mix into anything but cake, plus where to buy the boxes, and a suggestion box where visitors send recipes for approval.

## Files

- `index.html`, `dusk.jpg`: the site.
- `api/`: Vercel functions for the suggestion box.
  - `recipes.js`: approved recipes.
  - `suggest.js`: send a suggestion (max 5 per hour per visitor).
  - `status.js`: a visitor's own suggestions.
  - `review.js`: list, approve, decline or remove. Needs the approval code.

## Setup on Vercel

1. **Storage** tab → Create Database → **Upstash for Redis** (free plan) → connect it to this project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
2. **Settings → Environment Variables** → add `APPROVAL_CODE` with your approval code.
3. Redeploy.

Until both are set, the suggestion box is hidden and the rest of the site works normally. The approval code is checked only on the server, never in the page.
