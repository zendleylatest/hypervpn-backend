const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const {
  getOpenAiApiKey,
  resetOpenAiKeyCacheForTests,
} = require("../services/openAiKeyService");

const PORT = 39000 + Math.floor(Math.random() * 500);
const TOKEN = "test-admin-token";
let child;

function startService(env) {
  return new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "..", "openai-key-service", "server.js")],
      { env: { ...process.env, PORT: String(PORT), ...env } }
    );
    child.stdout.on("data", (d) => {
      if (String(d).includes("listening")) resolve();
    });
    child.on("error", reject);
  });
}

test.before(async () => {
  await startService({ ADMIN_TOKEN: TOKEN, OPENAI_API_KEY: "sk-from-service" });
});
test.after(() => child && child.kill());

function useService() {
  process.env.OPENAI_KEY_SERVICE_URL = `http://127.0.0.1:${PORT}/`;
  process.env.OPENAI_KEY_SERVICE_TOKEN = TOKEN;
  process.env.OPENAI_API_KEY = "sk-from-env";
  resetOpenAiKeyCacheForTests();
}

test("reads the key from the key service", async () => {
  useService();
  assert.equal(await getOpenAiApiKey(), "sk-from-service");
});

test("falls back to the env key when the service is not configured", async () => {
  delete process.env.OPENAI_KEY_SERVICE_URL;
  delete process.env.OPENAI_KEY_SERVICE_TOKEN;
  delete process.env.ADMIN_TOKEN;
  process.env.OPENAI_API_KEY = "sk-from-env";
  resetOpenAiKeyCacheForTests();
  assert.equal(await getOpenAiApiKey(), "sk-from-env");
});

test("a wrong token falls back to the env key", async () => {
  useService();
  process.env.OPENAI_KEY_SERVICE_TOKEN = "wrong";
  assert.equal(await getOpenAiApiKey(), "sk-from-env");
});

test("keeps the last good key when the service goes down", async () => {
  useService();
  assert.equal(await getOpenAiApiKey(), "sk-from-service");
  process.env.OPENAI_KEY_SERVICE_URL = "http://127.0.0.1:1"; // nothing listens
  // cached, so it never even calls the dead service
  assert.equal(await getOpenAiApiKey(), "sk-from-service");
});

test("a dead service with nothing cached uses the env key", async () => {
  useService();
  process.env.OPENAI_KEY_SERVICE_URL = "http://127.0.0.1:1";
  assert.equal(await getOpenAiApiKey(), "sk-from-env");
});

test("the key service itself: rotate with POST, protected by the token", async () => {
  const base = `http://127.0.0.1:${PORT}`;
  const auth = { Authorization: `Bearer ${TOKEN}` };

  assert.equal((await fetch(`${base}/api-key`)).status, 401);
  assert.equal(
    (await fetch(`${base}/api-key`, { headers: { Authorization: "Bearer nope" } })).status,
    401
  );

  const rotated = await fetch(`${base}/api-key`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "  sk-rotated  " }),
  });
  assert.equal(rotated.status, 200);
  assert.equal(await (await fetch(`${base}/api-key`, { headers: auth })).text(), "sk-rotated");

  const bad = await fetch(`${base}/api-key`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "" }),
  });
  assert.equal(bad.status, 400);

  // and the backend picks the rotated key up once its cache is refreshed
  useService();
  assert.equal(await getOpenAiApiKey(), "sk-rotated");
});
