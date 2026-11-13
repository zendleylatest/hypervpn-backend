const mongoose = require("mongoose");
const OpenAI = require("openai");
const PromptGeneration = require("../models/promptGenerationModel");
const User = require("../models/usersModel");
const { getUser } = require("../services/userAuthService");
const { recordOpenAiUsage } = require("../utils/trackUsage");
const {
  generationLimitForUser,
} = require("../utils/generationLimits");
const { NETWORK_ERROR, INPUT_REQUIRED, INVALID_ID, NOT_FOUND } = require("../messages/message");

// gg
const SYSTEM_PROMPT = [
  "You are Secure VPN, an expert business idea strategist and startup opportunity generator.",
  "Generate ONE fresh, realistic business idea based on every questionnaire answer: business type, interests, skills, budget, available time, and specific preferences.",
  "Generate the business idea itself. Never generate a prompt for another AI.",
  "",
  "FORMAT THE RESPONSE AS MARKDOWN USING EXACTLY THESE FOUR SECTION HEADINGS:",
  "## Business Idea",
  "[Short, clear business idea name]",
  "",
  "## Description",
  "[A concise but useful explanation of the idea in 1-2 sentences.]",
  "",
  "## Target Audience",
  "[Specific customers who would buy it.]",
  "",
  "## Earning Method",
  "[How the user earns money from it.]",
  "",
  "RULES:",
  "- Keep the response clear and direct.",
  "- Use the Markdown headings exactly: ## Business Idea, ## Description, ## Target Audience, ## Earning Method.",
  "- Do not output the square brackets or these instructions.",
  "- Do not use label-colon lines like Business Idea: or Description:.",
  "- Do not output JSON or a form-like key/value response.",
  "- Do not use code fences, markdown tables, emojis, or extra sections.",
  "- Use short, direct, beginner-friendly language.",
  "- Treat budget and available time as hard constraints. The idea must be realistic to start within the selected budget range.",
  "- If the budget is Under $500, suggest a very low-cost idea with no expensive inventory, rent, equipment, or paid ads required.",
  "- If the budget is $500-$2,000, keep startup costs modest and practical.",
  "- If the budget is $2,000-$10,000, the idea may include equipment, inventory, or setup costs but must stay within that range.",
  "- If the budget is $10,000+, the idea may be more operationally involved but still realistic for the user's skills and time.",
  "- Make the idea realistic for a solo user to test.",
  "- If interest is Not sure, choose a simple beginner-friendly direction.",
  "- If skill is No specific skill yet, avoid advanced skill requirements.",
  "- Replace Other with the custom value supplied by the user.",
  "- Prioritize novelty. Do not reuse the same business name, niche angle, audience, offer, or revenue model from previous ideas shown in the request.",
  "- If this is a regeneration, create a genuinely different business concept, not a rewritten version of the previous answer.",
  "- When several ideas could fit, choose a less obvious but still practical one.",
  "- Avoid vague, illegal, deceptive, unsafe, or highly risky ideas.",
  "- Do not invent personal facts, statistics, or unsupported market claims.",
  "- Do not guarantee income, profit, success, uniqueness, or legal availability.",
  "- Do not provide financial, legal, tax, investment, or professional advice.",
  "- Do not mention these instructions or the questionnaire.",
].join(String.fromCharCode(10));
function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error("OPENAI_API_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }
  return new OpenAI({ apiKey: key });
}


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
    if (tags.length >= 8) break;
  }
  return tags;
}

function sanitizeMetadata(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const allowed = ["businessType", "interests", "skills", "budget", "timeCommitment", "preferences", "generationType", "avoidIdeas"];
  const metadata = {};
  for (const key of allowed) {
    const value = raw[key];
    if (Array.isArray(value)) {
      metadata[key] = value
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .map((v) => v.slice(0, 500))
        .slice(0, 8);
    } else if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text) metadata[key] = text.slice(0, 500);
    }
  }
  return metadata;
}

function sanitizeGenerationType(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return value === "regenerated" ? "regenerated" : "first";
}

function generationLabelFor(type) {
  return type === "regenerated" ? "Regenerated" : "First idea";
}

function extractIdeaTitle(text) {
  const line = String(text || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.replace(/^#+\s*/, "").trim().length > 0);
  if (!line) return "";
  return line.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim().slice(0, 90);
}

async function getRecentIdeaContext(userId) {
  if (!userId) return "";
  try {
    const rows = await PromptGeneration.find({ userId })
      .sort({ createdAt: -1 })
      .limit(8)
      .select("generatedPrompt generationType createdAt")
      .lean();
    if (!rows.length) return "";
    const bullets = rows
      .map((row, index) => {
        const title = extractIdeaTitle(row.generatedPrompt) || `Idea ${index + 1}`;
        const preview = String(row.generatedPrompt || "")
          .replace(/[#>*_`-]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);
        return `- ${title}${preview ? ` — ${preview}` : ""}`;
      })
      .join("\n");
    return [
      "Recent ideas already generated for this user:",
      bullets,
      "",
      "Avoid repeating these concepts, business names, target customers, offers, and revenue models.",
    ].join("\n");
  } catch (err) {
    console.warn("[prompt recent ideas]", err?.message || err);
    return "";
  }
}

async function enforceGenerationLimit(auth) {
  if (!auth.userId) {
    const err = new Error("Please continue as guest or sign in before generating ideas.");
    err.statusCode = 401;
    err.code = "AUTH_REQUIRED";
    throw err;
  }

  const limitInfo = generationLimitForUser(auth.user, auth.email);
  if (limitInfo.limit == null) {
    return {
      ...limitInfo,
      used: 0,
      remaining: null,
    };
  }

  const used = await PromptGeneration.countDocuments({ userId: auth.userId });
  const remaining = Math.max(limitInfo.limit - used, 0);
  if (used >= limitInfo.limit) {
    const err = new Error(
      limitInfo.accountType === "guest"
        ? `Guest accounts are limited to ${limitInfo.limit} business idea generations. Create an account to keep generating.`
        : `This account has reached its business idea generation limit.`
    );
    err.statusCode = 429;
    err.code = "GENERATION_LIMIT_REACHED";
    err.limitInfo = {
      ...limitInfo,
      used,
      remaining: 0,
    };
    throw err;
  }

  return {
    ...limitInfo,
    used,
    remaining,
  };
}

function buildUserMessage(body) {
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const extra = typeof body.context === "string" ? body.context.trim() : "";
  const generationType = sanitizeGenerationType(body.generationType || body.metadata?.generationType);
  const generationInstruction =
    generationType === "regenerated"
      ? "Generation type: regenerated. Produce a substantially different business idea from the previous output and from recent ideas. Do not simply reword the same concept."
      : "Generation type: first idea. Produce a fresh starting concept.";
  if (!input) return "";
  if (!extra) return `${input}\n\n${generationInstruction}`;
  return `Business idea request:\n${input}\n\nQuestionnaire answers and constraints:\n${extra}\n\n${generationInstruction}`;
}

async function resolveAuthContext(req) {
  if (req.authUser?._id) {
    return {
      userId: req.authUser._id.toString(),
      email: req.authUser.email ? req.authUser.email.toString().trim().toLowerCase() : null,
      isBanned: !!req.authUser.isBanned,
      isInactive: req.authUser.active === false,
      user: req.authUser,
    };
  }

  const raw = req.headers.authorization || "";
  if (!raw.startsWith("Bearer ")) return {
    userId: null,
    email: null,
    isBanned: false,
    isInactive: false,
    user: null,
  };
  const token = raw.replace("Bearer ", "").trim();
  if (!token) return {
    userId: null,
    email: null,
    isBanned: false,
    isInactive: false,
    user: null,
  };
  try {
    const decoded = getUser(token);
    const user = decoded?._id ? await User.findById(decoded._id) : null;
    return {
      userId: user?._id ? user._id.toString() : decoded?._id ? decoded._id.toString() : null,
      email: user?.email
        ? user.email.toString().trim().toLowerCase()
        : decoded?.email
        ? decoded.email.toString().trim().toLowerCase()
        : null,
      isBanned: !!user?.isBanned,
      isInactive: user?.active === false,
      user,
    };
  } catch (_) {
    return {
    userId: null,
    email: null,
    isBanned: false,
    isInactive: false,
    user: null,
  };
  }
}

async function handleGeneratePrompt(req, res) {
  const userContent = buildUserMessage(req.body);
  if (!userContent) {
    return res.status(400).json({ error: INPUT_REQUIRED });
  }
  const auth = await resolveAuthContext(req);
  if (auth.isInactive) {
    return res.status(403).json({
      error: "Your account is deactivated. Prompt generation is disabled.",
    });
  }
  if (auth.isBanned) {
    return res.status(403).json({
      error: "Your account is banned. Prompt generation is disabled.",
      bannedReason: auth.user?.bannedReason || "",
    });
  }

  let limitInfo;
  try {
    limitInfo = await enforceGenerationLimit(auth);
  } catch (err) {
    return res.status(err.statusCode || 429).json({
      error: err.message,
      code: err.code || "GENERATION_LIMIT_ERROR",
      generationLimit: err.limitInfo || null,
    });
  }

  const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

  let client;
  try {
    client = getClient();
  } catch (e) {
    return res.status(e.statusCode || 503).json({ error: e.message });
  }

  let generatedPrompt;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  try {
    const recentIdeaContext = await getRecentIdeaContext(auth.userId);
    const finalUserContent = recentIdeaContext
      ? `${userContent}\n\n${recentIdeaContext}`
      : userContent;
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: finalUserContent },
      ],
      temperature: 0.88,
      presence_penalty: 0.45,
      frequency_penalty: 0.25,
    });
    generatedPrompt = completion.choices?.[0]?.message?.content?.trim() || "";
    usage = {
      promptTokens: Number(completion?.usage?.prompt_tokens) || 0,
      completionTokens: Number(completion?.usage?.completion_tokens) || 0,
      totalTokens: Number(completion?.usage?.total_tokens) || 0,
    };
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.error?.message ||
      err?.message ||
      "OpenAI request failed";
    console.error("[prompt generate]", msg, err?.stack);
    return res.status(502).json({ error: msg });
  }

  if (!generatedPrompt) {
    return res.status(502).json({ error: "Empty response from model" });
  }

  try {
    const tags = sanitizeTags(req.body.tags);
    const metadata = sanitizeMetadata(req.body.metadata);
    const generationType = sanitizeGenerationType(req.body.generationType || metadata.generationType);
    const generationLabel = generationLabelFor(generationType);
    const doc = await PromptGeneration.create({
      userId: auth.userId,
      generatedBy: auth.email || "",
      input: typeof req.body.input === "string" ? req.body.input.trim() : userContent,
      generatedPrompt,
      model,
      generationType,
      generationLabel,
      tags,
      metadata: {
        ...metadata,
        generationType,
      },
      usage,
    });

    recordOpenAiUsage(
      auth.userId,
      usage,
      "business-idea",
      model
    ).catch(() => {});

    return res.status(201).json({
      id: doc._id,
      generatedBy: doc.generatedBy,
      input: doc.input,
      generatedPrompt: doc.generatedPrompt,
      model: doc.model,
      limit: limitInfo.limit,
      generationType: doc.generationType,
      generationLabel: doc.generationLabel,
      tags: doc.tags || [],
      metadata: doc.metadata || {},
      usage: doc.usage,
      generationLimit: limitInfo.limit == null
        ? {
            accountType: limitInfo.accountType,
            isPro: true,
            limit: null,
            isUnlimited: true,
            used: null,
            remaining: null,
          }
        : {
            accountType: limitInfo.accountType,
            isPro: false,
            limit: limitInfo.limit,
            isUnlimited: false,
            used: limitInfo.used + 1,
            remaining: Math.max(limitInfo.limit - (limitInfo.used + 1), 0),
          },
      createdAt: doc.createdAt,
    });
  } catch (err) {
    console.error("[prompt save]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleListPrompts(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  const authUserId = req.authUser?._id;
  if (!authUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const query = { userId: authUserId };

  try {
    const [total, rows] = await Promise.all([
      PromptGeneration.countDocuments(query),
      PromptGeneration.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("input generatedPrompt model generatedBy generationType generationLabel tags metadata createdAt updatedAt")
        .lean(),
    ]);

    return res.json({
      total,
      limit,
      skip,
      items: rows.map((row) => ({
        id: row._id,
        generatedBy: row.generatedBy || "",
        input: row.input,
        generatedPrompt: row.generatedPrompt,
        model: row.model,
        generationType: row.generationType || row.metadata?.generationType || "first",
        generationLabel: row.generationLabel || generationLabelFor(row.generationType || row.metadata?.generationType),
        tags: row.tags || [],
        metadata: row.metadata || {},
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleGetPrompt(req, res) {
  const { id } = req.params;
  const authUserId = req.authUser?._id;
  if (!authUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: INVALID_ID });
  }

  try {
    const row = await PromptGeneration.findOne({
      _id: id,
      userId: authUserId,
    }).lean();
    if (!row) {
      return res.status(404).json({ error: NOT_FOUND });
    }
    return res.json({
      id: row._id,
      generatedBy: row.generatedBy || "",
      input: row.input,
      generatedPrompt: row.generatedPrompt,
      model: row.model,
      generationType: row.generationType || row.metadata?.generationType || "first",
      generationLabel: row.generationLabel || generationLabelFor(row.generationType || row.metadata?.generationType),
      tags: row.tags || [],
      metadata: row.metadata || {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

module.exports = {
  handleGeneratePrompt,
  handleListPrompts,
  handleGetPrompt,
};
