# Not Cake

Recipes that turn a box of cake mix into anything but cake, plus where to buy the boxes, a recipe chat, and a suggestion box. New recipes go live only after the owner approves them by email.

## Files

- `index.html`, `dusk.jpg`: the site.
- `community.json`: approved community recipes. The approve link adds to it through the GitHub API, and Vercel redeploys.
- `api/`: Vercel functions.
  - `generate.js`: the recipe chat (Claude).
  - `submit.js`: emails the owner a recipe with a signed approval link (Resend).
  - `approve.js`: the approval page. Adding a recipe commits it to `community.json`.
  - `health.js`: tells the page which features are set up.

## Setup on Vercel (Settings → Environment Variables)

| Name | What it is |
| --- | --- |
| `ANTHROPIC_API_KEY` | From console.anthropic.com. Turns on the recipe chat. |
| `RESEND_API_KEY` | From resend.com. Sends the approval emails. |
| `OWNER_EMAIL` | Where approval emails go. With Resend's test sender this must be the email you signed up to Resend with. |
| `GITHUB_TOKEN` | Fine-grained token with Contents: Read and write on this repo only. Adds approved recipes and signs approval links. |

Redeploy after adding them. Without them the chat and suggestion box stay hidden and the rest of the site works normally.
