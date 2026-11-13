const SavedIdea = require("../models/savedIdeaModel");

function sanitizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const tags = [];
  for (const item of raw) {
    const tag = String(item || "").replace(/\s+/g, " ").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag.slice(0, 48));
    if (tags.length >= 10) break;
  }
  return tags;
}

function generationTypeOf(raw) {
  return String(raw || "").trim().toLowerCase() === "regenerated"
    ? "regenerated"
    : "first";
}

function generationLabelOf(type, rawLabel) {
  const label = String(rawLabel || "").trim();
  if (label) return label.slice(0, 40);
  return type === "regenerated" ? "Regenerated" : "First idea";
}

function mapSavedIdea(row) {
  return {
    id: row.promptId,
    title: row.title || "Business Idea",
    preview: row.preview || "",
    body: row.body || "",
    tags: row.tags || [],
    generationType: row.generationType || "first",
    generationLabel:
      row.generationLabel ||
      generationLabelOf(row.generationType || "first", ""),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listSavedIdeas(req, res) {
  try {
    const rows = await SavedIdea.find({ userId: req.authUser._id })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();
    return res.json({
      success: true,
      items: rows.map(mapSavedIdea),
    });
  } catch (err) {
    console.error("[saved ideas:list]", err);
    return res.status(500).json({ error: "Failed to load saved ideas." });
  }
}

async function saveIdea(req, res) {
  const promptId = String(req.body?.id || req.body?.promptId || "").trim();
  if (!promptId) {
    return res.status(400).json({ error: "Saved idea id is required." });
  }

  const generationType = generationTypeOf(req.body?.generationType);
  const update = {
    userId: req.authUser._id,
    promptId,
    title: String(req.body?.title || "Business Idea").trim().slice(0, 140),
    preview: String(req.body?.preview || "").trim().slice(0, 500),
    body: String(req.body?.body || "").trim(),
    tags: sanitizeTags(req.body?.tags),
    generationType,
    generationLabel: generationLabelOf(
      generationType,
      req.body?.generationLabel
    ),
  };

  try {
    const row = await SavedIdea.findOneAndUpdate(
      { userId: req.authUser._id, promptId },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.status(201).json({
      success: true,
      item: mapSavedIdea(row),
    });
  } catch (err) {
    console.error("[saved ideas:save]", err);
    return res.status(500).json({ error: "Failed to save idea." });
  }
}

async function deleteSavedIdea(req, res) {
  const promptId = String(req.params.id || "").trim();
  if (!promptId) {
    return res.status(400).json({ error: "Saved idea id is required." });
  }

  try {
    await SavedIdea.deleteOne({ userId: req.authUser._id, promptId });
    return res.json({ success: true });
  } catch (err) {
    console.error("[saved ideas:delete]", err);
    return res.status(500).json({ error: "Failed to remove saved idea." });
  }
}

module.exports = {
  listSavedIdeas,
  saveIdea,
  deleteSavedIdea,
};
