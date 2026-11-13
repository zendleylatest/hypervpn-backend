const User = require("../models/usersModel");
const ChatUsage = require("../models/chatUsageModel");

async function recordOpenAiUsage(
  userId,
  usage,
  feature = "business-idea",
  model = "gpt-4o-mini"
) {
  if (!usage) return;

  const promptTokens =
    Number(usage.promptTokens ?? usage.prompt_tokens) || 0;
  const completionTokens =
    Number(usage.completionTokens ?? usage.completion_tokens) || 0;
  const totalTokens =
    Number(usage.totalTokens ?? usage.total_tokens) || 0;

  try {
    await ChatUsage.create({
      userId: userId || null,
      requestType: userId ? "authenticated" : "guest",
      feature,
      model,
      usage: { promptTokens, completionTokens, totalTokens },
    });

    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $inc: {
          "openAiUsage.promptTokens": promptTokens,
          "openAiUsage.completionTokens": completionTokens,
          "openAiUsage.totalTokens": totalTokens,
          "openAiUsage.requestCount": 1,
        },
        $set: { "openAiUsage.lastUsedAt": new Date() },
      });
    }
  } catch (error) {
    console.error(
      "[trackUsage] failed to record OpenAI usage:",
      error.message
    );
  }
}

module.exports = { recordOpenAiUsage };