// GET /api/health: tells the page which features are set up, so it can hide the rest.
const { ready } = require("./_lib");

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ generate: ready.generate(), submit: ready.submit() });
};
