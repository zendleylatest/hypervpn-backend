// Where the OpenAI API key comes from.
//
// If ADMIN_TOKEN (or OPENAI_KEY_SERVICE_TOKEN) is set, the key is
// read from the key service (OPENAI_KEY_SERVICE_URL, default
// https://openaikeysecret.oxmite.com; openai-key-service/ on Render) with
// `GET <url>/api-key` and `Authorization: Bearer <token>`. That way the key can
// be rotated with one POST to the service, without redeploying this backend.
// Otherwise it falls back to the OPENAI_API_KEY environment variable.
//
// The key is cached for a few minutes. If the service is down, the last key
// that worked is kept, then the environment variable.

const CACHE_MS = 5 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 30 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

let cachedKey = "";
let cachedAt = 0;
let lastFailureAt = 0;

const DEFAULT_SERVICE_URL = "https://openaikeysecret.oxmite.com";

function serviceConfig() {
  // The token is the service's ADMIN_TOKEN. Either name works here.
  const token = String(
    process.env.OPENAI_KEY_SERVICE_TOKEN || process.env.ADMIN_TOKEN || ""
  ).trim();
  if (!token) return null;
  const url = String(process.env.OPENAI_KEY_SERVICE_URL || DEFAULT_SERVICE_URL)
    .trim()
    .replace(/\/+$/, "")
    // Accept either the base URL or the full ".../api-key" URL.
    .replace(/\/api-key$/, "");
  return { url, token };
}

async function getOpenAiApiKey() {
  const envKey = String(process.env.OPENAI_API_KEY || "").trim();
  const service = serviceConfig();
  if (!service) return envKey;

  const now = Date.now();
  if (cachedKey && now - cachedAt < CACHE_MS) return cachedKey;
  if (now - lastFailureAt < RETRY_AFTER_FAILURE_MS) return cachedKey || envKey;

  try {
    const response = await fetch(`${service.url}/api-key`, {
      headers: { Authorization: `Bearer ${service.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`key service answered ${response.status}`);
    const key = (await response.text()).trim();
    if (!key) throw new Error("key service has no key set");
    cachedKey = key;
    cachedAt = now;
    return key;
  } catch (e) {
    lastFailureAt = now;
    console.warn("[openai-key] could not read the key service:", e.message);
    return cachedKey || envKey;
  }
}

function resetOpenAiKeyCacheForTests() {
  cachedKey = "";
  cachedAt = 0;
  lastFailureAt = 0;
}

module.exports = { getOpenAiApiKey, resetOpenAiKeyCacheForTests };
