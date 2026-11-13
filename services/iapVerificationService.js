const fs = require("fs");
const path = require("path");
const { JWT } = require("google-auth-library");

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_ANDROID_PACKAGE_NAME =
  "com.securevpn.app.aiappspace";
const ACTIVE_V2_STATES = new Set([
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_CANCELED",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
]);

function strictVerifyEnabled() {
  return (
    process.env.IAP_ANDROID_STRICT_VERIFY === "1" ||
    process.env.IAP_ANDROID_STRICT_VERIFY === "true"
  );
}

function loadGoogleServiceAccount() {
  if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      console.warn("[iapVerify] Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    }
  }

  try {
    const p = path.join(__dirname, "..", "google-play-service-account.json");
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8"));
    }
  } catch (e) {
    console.warn("[iapVerify] Could not read google-play-service-account.json:", e.message);
  }

  return null;
}

async function getGoogleAccessToken() {
  const sa = loadGoogleServiceAccount();
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error("Google Play service account is missing");
  }

  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [GOOGLE_SCOPE],
  });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Could not create Google Play access token");
  return token;
}

function buildAndroidSubscriptionResult(data) {
  const now = Date.now();
  const expiryMs = Number(data?.expiryTimeMillis || 0);
  const paymentState = data?.paymentState;
  const paymentOk =
    paymentState === undefined ||
    paymentState === null ||
    paymentState === 1 ||
    paymentState === 2 ||
    paymentState === 3;
  const active = expiryMs > now && paymentOk;

  return {
    ok: active,
    status: active ? "active" : "expired",
    expiresAt: expiryMs ? new Date(expiryMs).toISOString() : null,
    platform: "android",
    source: "google_play",
    payload: {
      paymentState,
      cancelReason: data?.cancelReason,
      autoRenewing: data?.autoRenewing,
      orderId: data?.orderId,
      priceCurrencyCode: data?.priceCurrencyCode,
      priceAmountMicros: data?.priceAmountMicros,
      countryCode: data?.countryCode,
      purchaseType: data?.purchaseType,
      acknowledgementState: data?.acknowledgementState,
      kind: data?.kind,
    },
  };
}

function parseTime(value) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function buildAndroidSubscriptionV2Result(data, productId) {
  const now = Date.now();
  const lineItems = Array.isArray(data?.lineItems) ? data.lineItems : [];
  const matchingLine =
    lineItems.find((item) => item?.productId === productId) || lineItems[0] || null;
  const expiryMs = Math.max(
    0,
    ...lineItems
      .map((item) => parseTime(item?.expiryTime))
      .filter((ms) => Number.isFinite(ms) && ms > 0)
  );
  const subscriptionState = data?.subscriptionState;
  const active = expiryMs > now && ACTIVE_V2_STATES.has(subscriptionState);
  const autoRenewingPlan = matchingLine?.autoRenewingPlan || null;

  return {
    ok: active,
    status: active ? "active" : "expired",
    expiresAt: expiryMs ? new Date(expiryMs).toISOString() : null,
    platform: "android",
    source: "google_play_v2",
    payload: {
      subscriptionState,
      acknowledgementState: data?.acknowledgementState,
      linkedPurchaseToken: data?.linkedPurchaseToken,
      regionCode: data?.regionCode,
      latestSuccessfulOrderId: matchingLine?.latestSuccessfulOrderId,
      productId: matchingLine?.productId,
      autoRenewEnabled: autoRenewingPlan?.autoRenewEnabled,
      planType: matchingLine?.autoRenewingPlan
        ? "auto_renewing"
        : matchingLine?.prepaidPlan
        ? "prepaid"
        : null,
      kind: data?.kind,
    },
  };
}

async function verifyAndroidPurchase({ packageName, productId, purchaseToken }) {
  if (!packageName || !productId || !purchaseToken) {
    throw new Error("Missing packageName/productId/purchaseToken");
  }

  const accessToken = await getGoogleAccessToken();

  const v2Url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    packageName
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  const v2Response = await fetch(v2Url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const v2Data = await v2Response.json().catch(() => ({}));
  if (v2Response.ok) {
    return buildAndroidSubscriptionV2Result(v2Data, productId);
  }

  console.warn(
    "[iapVerify] subscriptionsv2 failed; trying legacy endpoint:",
    v2Data?.error?.message || v2Response.status
  );

  const legacyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    packageName
  )}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
    purchaseToken
  )}`;

  const response = await fetch(legacyUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Play verify failed (${response.status})`);
  }
  return buildAndroidSubscriptionResult(data);
}

async function verifyIosPurchase({ productId, purchaseToken }) {
  try {
    const { verifyAppleTransaction } = require("./appleIapService");
    // On iOS the "purchase token" is the App Store transaction id.
    const result = await verifyAppleTransaction({ transactionId: purchaseToken });
    return {
      ok: result.isActive,
      status: result.isActive ? "active" : "expired",
      platform: "ios",
      source: "app_store",
      expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      autoRenewing: result.autoRenewing,
      isTrial: result.isTrial,
      payload: {
        originalTransactionId: result.originalTransactionId,
        productId: result.productId,
        requestedProductId: productId,
        environment: result.environment,
        appleStatus: result.appleStatus,
      },
    };
  } catch (e) {
    console.warn("[iapVerify] iOS verification failed:", e.message);
    // Default to retryable: an unexpected error is not proof that the
    // subscription is inactive, so it must not revoke access.
    const retryable = e.retryable !== false;
    return {
      ok: false,
      status: retryable ? "verify_failed" : "invalid",
      retryable,
      platform: "ios",
      source: "app_store",
      expiresAt: null,
      payload: {},
      reason: e.message,
    };
  }
}

async function verifyIapPurchase({ platform, productId, purchaseToken, packageName }) {
  if (platform === "ios") {
    return verifyIosPurchase({ productId, purchaseToken });
  }

  if (platform !== "android") {
    return {
      ok: false,
      status: "unsupported_platform",
      platform,
      source: "none",
      expiresAt: null,
      payload: {},
      reason: "Only android and ios verification are implemented on this backend",
    };
  }

  const appPackage =
    packageName || process.env.ANDROID_PACKAGE_NAME || DEFAULT_ANDROID_PACKAGE_NAME;
  try {
    return await verifyAndroidPurchase({
      packageName: appPackage,
      productId,
      purchaseToken,
    });
  } catch (e) {
    const strict = strictVerifyEnabled();
    console.warn("[iapVerify] Android verification failed:", e.message);
    if (strict) {
      return {
        ok: false,
        status: "verify_failed",
        platform: "android",
        source: "google_play",
        expiresAt: null,
        payload: {},
        reason: e.message,
      };
    }

    return {
      ok: Boolean(purchaseToken && productId),
      status: purchaseToken && productId ? "active" : "verify_failed",
      platform: "android",
      source: "fallback_dev",
      expiresAt: null,
      payload: { warning: "strict verification disabled" },
      reason: "Strict verification disabled; using fallback",
    };
  }
}

module.exports = { verifyIapPurchase };
