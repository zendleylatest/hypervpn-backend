import OpenAI from 'openai';

const KEY_URL = 'https://openaikeysecret.oxmite.com/api-key';
const KEY_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10000;

let cachedKey = null;
let cachedAtMs = 0;
let inflight = null;
let client = null;
let clientKey = null;
let warnedMissing = false;

async function getOpenAiApiKey() {
  const response = await fetch(KEY_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch API key: ${response.status}`);
  }

  return (await response.text()).trim();
}

/**
 * Returns the OpenAI key from the key service, cached for a few minutes so we
 * don't call it on every request. If a refresh fails, the last good key is
 * reused; returns null only when no key has ever been fetched.
 */
export async function getOpenAiKey() {
  const now = Date.now();
  if (cachedKey && now - cachedAtMs < KEY_TTL_MS) return cachedKey;

  if (!inflight) {
    inflight = getOpenAiApiKey()
      .then((key) => {
        if (!key) throw new Error('Key service returned an empty key');
        cachedKey = key;
        cachedAtMs = Date.now();
        return key;
      })
      .catch((e) => {
        console.warn('⚠️  OpenAI key fetch failed:', e.message);
        return cachedKey;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Shared OpenAI client; rebuilt automatically if the key changes. */
export async function getOpenAI() {
  const key = await getOpenAiKey();
  if (!key) {
    if (!warnedMissing) {
      console.warn('⚠️  OpenAI key unavailable. AI features will use fallback responses.');
      warnedMissing = true;
    }
    return null;
  }
  warnedMissing = false;
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key });
    clientKey = key;
    console.log('🤖 OpenAI client initialised (key …' + key.slice(-4) + ')');
  }
  return client;
}
