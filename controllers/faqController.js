const OpenAI = require("openai");
const { getOpenAiApiKey } = require("../services/openAiKeyService");
const {
  getMergedKnowledgeText,
} = require("../services/knowledgeStoreService");
const {
  recordOpenAiUsage,
} = require("../utils/trackUsage");

const MAX_HISTORY_MESSAGES = 10;
let openAiClient = null;
let openAiClientKey = "";

// Rebuilt whenever the key changes, so a key rotated in the key service is
// picked up without restarting the backend.
async function getOpenAI() {
  const key = await getOpenAiApiKey();
  if (!key) return null;
  if (!openAiClient || openAiClientKey !== key) {
    openAiClient = new OpenAI({ apiKey: key });
    openAiClientKey = key;
  }
  return openAiClient;
}

async function faqChat(req, res) {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide a non-empty "messages" array.',
      });
    }

    for (const message of messages) {
      if (
        !message?.role ||
        !message?.content ||
        typeof message.content !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Each message must have "role" and "content" (string).',
        });
      }
      if (!["user", "assistant"].includes(message.role)) {
        return res.status(400).json({
          success: false,
          message:
            'Message role must be "user" or "assistant".',
        });
      }
    }

    const openai = await getOpenAI();
    if (!openai) {
      return res.json({
        success: true,
        reply:
          "The AI assistant is currently unavailable. Please try again later or contact support.",
      });
    }

    const knowledgeText = await getMergedKnowledgeText();
    const fallback =
      "I don't have information on that in my current knowledge base. Please contact support.";

    const systemPrompt = knowledgeText?.trim()
      ? [
          "You are the support assistant for the Secure VPN app.",
          "Your ONLY source of truth is the knowledge base delimited below.",
          "",
          "STRICT RULES - follow them without exception:",
          "1. Answer ONLY from the knowledge base. Do NOT use external knowledge, training data, or assumptions.",
          "2. If the question is not clearly answered by the knowledge base, respond with exactly:",
          '   "' + fallback + '"',
          "   Do NOT guess, provide a partial answer, or suggest information that is not in the knowledge base.",
          '3. Do NOT use phrases such as "typically", "usually", or "based on general knowledge".',
          "4. Keep answers concise and factual. Closely paraphrase the knowledge base when possible.",
          "",
          "--- KNOWLEDGE BASE START ---",
          knowledgeText,
          "--- KNOWLEDGE BASE END ---",
        ].join("\n")
      : [
          "You are the support assistant for the Secure VPN app.",
          "The knowledge base has not been configured yet.",
          "",
          'For every question, respond with exactly: "' +
            fallback +
            '"',
          "Do NOT answer from general knowledge.",
        ].join("\n");

    const recentMessages = messages.slice(-MAX_HISTORY_MESSAGES);
    const model =
      (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...recentMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      max_tokens: 500,
      temperature: 0,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() || "";
    if (!reply) {
      return res.status(502).json({
        success: false,
        message:
          "Received an empty response from the AI. Please try again.",
      });
    }

    recordOpenAiUsage(
      null,
      completion.usage,
      "faq-chat",
      model
    ).catch(() => {});

    return res.json({ success: true, reply });
  } catch (error) {
    console.error("[faqChat] error:", error?.message || error);
    return res.status(500).json({
      success: false,
      message:
        "Failed to process your question. Please try again.",
    });
  }
}

module.exports = { faqChat };
