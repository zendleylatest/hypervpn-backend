import User from '../models/User.js';
import ChatUsage from '../models/ChatUsage.js';

/**
 * Record OpenAI usage for a user/request.
 * @param {string|null} userId - MongoDB user id (null for guest)
 * @param {{ prompt_tokens: number, completion_tokens: number, total_tokens: number }} usage - from OpenAI response.usage
 * @param {string} feature - 'meal-plan' | 'care-chat' | 'faq-chat'
 * @param {string} model - model name
 */
export async function recordOpenAiUsage(userId, usage, feature = 'care-chat', model = 'gpt-4o-mini') {
  if (!usage) return;

  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || 0;

  try {
    await ChatUsage.create({
      userId: userId || null,
      requestType: userId ? 'authenticated' : 'guest',
      feature,
      model,
      usage: { promptTokens, completionTokens, totalTokens },
    });

    if (userId) {
      await User.findByIdAndUpdate(userId, {
        $inc: {
          'openAiUsage.promptTokens': promptTokens,
          'openAiUsage.completionTokens': completionTokens,
          'openAiUsage.totalTokens': totalTokens,
          'openAiUsage.requestCount': 1,
        },
        $set: { 'openAiUsage.lastUsedAt': new Date() },
      });
    }
  } catch (err) {
    console.error('[trackUsage] failed to record OpenAI usage:', err.message);
  }
}
