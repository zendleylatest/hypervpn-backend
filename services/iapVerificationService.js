import axios from 'axios';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AMAZON_RVS_PRODUCTION_URL = 'https://appstore-sdk.amazon.com';
const AMAZON_RVS_SANDBOX_URL = 'https://appstore-sdk.amazon.com/sandbox';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_ANDROID_PACKAGE_NAME = 'com.wellorahealth.app.aiappspace';
const ACTIVE_V2_STATES = new Set([
  'SUBSCRIPTION_STATE_ACTIVE',
  'SUBSCRIPTION_STATE_CANCELED',
  'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
]);

let cachedAccessToken = null;
let cachedAccessTokenExpMs = 0;

function strictVerifyEnabled() {
  return (
    process.env.IAP_ANDROID_STRICT_VERIFY === '1' ||
    process.env.IAP_ANDROID_STRICT_VERIFY === 'true'
  );
}

function loadGoogleServiceAccount() {
  if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      console.warn('[iapVerify] Invalid GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
    }
  }

  try {
    const p = path.join(__dirname, '..', 'google-play-service-account.json');
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    console.warn('[iapVerify] Could not read google-play-service-account.json:', e.message);
  }

  return null;
}

async function getGoogleAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessTokenExpMs - 60 * 1000) {
    return cachedAccessToken;
  }

  const sa = loadGoogleServiceAccount();
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('Google Play service account is missing');
  }

  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const assertion = jwt.sign(
    {
      iss: sa.client_email,
      scope: GOOGLE_SCOPE,
      aud: GOOGLE_OAUTH_TOKEN_URL,
      iat,
      exp,
    },
    sa.private_key,
    { algorithm: 'RS256' }
  );

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const { data } = await axios.post(GOOGLE_OAUTH_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpMs = now + (Number(data.expires_in || 3600) * 1000);
  return cachedAccessToken;
}

function buildAndroidSubscriptionResult(data) {
  const now = Date.now();
  const expiryMs = Number(data?.expiryTimeMillis || 0);
  const paymentState = data?.paymentState;
  const cancelReason = data?.cancelReason;
  const autoRenewing = data?.autoRenewing;

  // paymentState: 0 pending, 1 received, 2 free trial, 3 deferred upgrade/downgrade
  const paymentOk =
    paymentState === undefined ||
    paymentState === null ||
    paymentState === 1 ||
    paymentState === 2 ||
    paymentState === 3;

  const active = expiryMs > now && paymentOk;
  const status = active ? 'active' : 'expired';

  return {
    ok: active,
    status,
    expiresAt: expiryMs ? new Date(expiryMs).toISOString() : null,
    autoRenewing: typeof autoRenewing === 'boolean' ? autoRenewing : null,
    // paymentState 2 = free trial.
    isTrial: paymentState === 2,
    platform: 'android',
    source: 'google_play',
    payload: {
      paymentState,
      cancelReason,
      autoRenewing,
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
    status: active ? 'active' : 'expired',
    expiresAt: expiryMs ? new Date(expiryMs).toISOString() : null,
    autoRenewing:
      typeof autoRenewingPlan?.autoRenewEnabled === 'boolean'
        ? autoRenewingPlan.autoRenewEnabled
        : null,
    // The v2 payload has no simple trial flag; leave unknown rather than guess.
    isTrial: null,
    platform: 'android',
    source: 'google_play_v2',
    payload: {
      subscriptionState,
      acknowledgementState: data?.acknowledgementState,
      linkedPurchaseToken: data?.linkedPurchaseToken,
      regionCode: data?.regionCode,
      latestSuccessfulOrderId: matchingLine?.latestSuccessfulOrderId,
      productId: matchingLine?.productId,
      autoRenewEnabled: autoRenewingPlan?.autoRenewEnabled,
      planType: matchingLine?.autoRenewingPlan
        ? 'auto_renewing'
        : matchingLine?.prepaidPlan
          ? 'prepaid'
          : null,
      kind: data?.kind,
    },
  };
}

function amazonSandboxEnabled() {
  const value = String(process.env.AMAZON_RVS_SANDBOX || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function amazonSharedSecret() {
  return (
    process.env.AMAZON_RVS_SHARED_SECRET ||
    process.env.AMAZON_DEVELOPER_SECRET ||
    ''
  ).trim();
}

export function buildAmazonSubscriptionResult(data, productId, receiptId) {
  const cancelDateMs = Number(data?.cancelDate || 0);
  const renewalDateMs = Number(data?.renewalDate || 0);
  const purchaseDateMs = Number(data?.purchaseDate || 0);
  const now = Date.now();

  // Current Amazon RVS responses identify the SKU in `productId`. Some older/
  // legacy payloads reportedly used `sku` instead, so fall back to that only
  // when `productId` is absent from the response.
  const usedLegacySkuField = !data?.productId && Boolean(data?.sku);
  const responseProductId = data?.productId || data?.sku;

  const productMatches = Boolean(responseProductId) && responseProductId === productId;
  const receiptMatches = Boolean(data?.receiptId) && data.receiptId === receiptId;
  const isSubscription = data?.productType === 'SUBSCRIPTION';
  const notCancelled = !cancelDateMs;
  const notExpired = !renewalDateMs || renewalDateMs > now;

  const identityValid = productMatches && receiptMatches && isSubscription;
  const active = identityValid && notCancelled && notExpired;

  let status;
  if (!identityValid) {
    status = 'invalid';
  } else if (!active) {
    status = 'expired';
  } else {
    status = 'active';
  }

  return {
    ok: active,
    status,
    retryable: false,
    expiresAt: renewalDateMs ? new Date(renewalDateMs).toISOString() : null,
    autoRenewing:
      typeof data?.autoRenewing === 'boolean' ? data.autoRenewing : !cancelDateMs,
    isTrial: Number(data?.freeTrialEndDate || 0) > now,
    platform: 'amazon',
    source: 'amazon_rvs',
    payload: {
      receiptId,
      productId: responseProductId,
      sku: data?.sku,
      usedLegacySkuField,
      productMatches,
      receiptMatches,
      productType: data?.productType,
      purchaseDate: purchaseDateMs ? new Date(purchaseDateMs).toISOString() : null,
      cancelDate: cancelDateMs ? new Date(cancelDateMs).toISOString() : null,
      renewalDate: renewalDateMs ? new Date(renewalDateMs).toISOString() : null,
      autoRenewing: data?.autoRenewing,
      term: data?.term,
      betaProduct: data?.betaProduct,
      testTransaction: data?.testTransaction,
    },
  };
}

async function verifyAmazonPurchase({ productId, purchaseToken, storeUserId }) {
  const secret = amazonSharedSecret();
  if (!secret) {
    const err = new Error('Amazon RVS shared secret is missing');
    err.retryable = true; // configuration problem, not proof the subscription is inactive
    throw err;
  }
  if (!productId || !purchaseToken || !storeUserId) {
    const err = new Error('Missing productId/purchaseToken/storeUserId');
    err.retryable = true;
    throw err;
  }

  const baseUrl = amazonSandboxEnabled()
    ? AMAZON_RVS_SANDBOX_URL
    : AMAZON_RVS_PRODUCTION_URL;
  const url = `${baseUrl}/version/1.0/verifyReceiptId/developer/${encodeURIComponent(
    secret
  )}/user/${encodeURIComponent(storeUserId)}/receiptId/${encodeURIComponent(
    purchaseToken
  )}`;

  let response;
  try {
    response = await axios.get(url, {
      headers: { Accept: 'application/json' },
      timeout: 15000,
      validateStatus: () => true,
    });
  } catch (e) {
    const err = new Error(`Amazon RVS request failed: ${e.message}`);
    err.retryable = true;
    throw err;
  }

  const data = response.data && typeof response.data === 'object' ? response.data : {};
  if (response.status < 200 || response.status >= 300) {
    const err = new Error(data?.message || `Amazon RVS verify failed (${response.status})`);
    err.httpStatus = response.status;
    // 400/404/410 are Amazon's documented invalid/cancelled/not-found receipt
    // responses - treat those as definitive. Throttling (429), server errors
    // (5xx), and anything else unexpected are transient/configuration issues
    // that must not be treated as proof the subscription is inactive.
    err.retryable = !(
      response.status === 400 ||
      response.status === 404 ||
      response.status === 410
    );
    throw err;
  }

  return buildAmazonSubscriptionResult(data, productId, purchaseToken);
}

async function verifyAndroidPurchase({ packageName, productId, purchaseToken }) {
  if (!packageName || !productId || !purchaseToken) {
    throw new Error('Missing packageName/productId/purchaseToken');
  }

  const accessToken = await getGoogleAccessToken();

  const v2Url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    packageName
  )}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  try {
    const { data } = await axios.get(v2Url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    });
    return buildAndroidSubscriptionV2Result(data, productId);
  } catch (e) {
    const status = e?.response?.status;
    const message = e?.response?.data?.error?.message || e.message;
    console.warn('[iapVerify] subscriptionsv2 failed; trying legacy endpoint:', message || status);
  }

  const legacyUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    packageName
  )}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(
    purchaseToken
  )}`;

  const { data } = await axios.get(legacyUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });

  return buildAndroidSubscriptionResult(data);
}

export async function verifyIapPurchase({
  platform,
  productId,
  purchaseToken,
  packageName,
  storeUserId,
}) {
  if (platform === 'amazon') {
    try {
      return await verifyAmazonPurchase({ productId, purchaseToken, storeUserId });
    } catch (e) {
      console.warn('[iapVerify] Amazon verification failed:', e.message);
      // Default to retryable when unclassified: an unexpected error is never
      // proof that a subscription is inactive, so it must not revoke access.
      const retryable = e.retryable !== false;
      return {
        ok: false,
        status: retryable ? 'verify_failed' : 'invalid',
        retryable,
        platform: 'amazon',
        source: 'amazon_rvs',
        expiresAt: null,
        payload: {},
        reason: e.message,
      };
    }
  }

  if (platform !== 'android') {
    return {
      ok: false,
      status: 'unsupported_platform',
      platform,
      source: 'none',
      expiresAt: null,
      payload: {},
      reason: 'Only android verification is implemented on this backend',
    };
  }

  const appPackage = packageName || process.env.ANDROID_PACKAGE_NAME || DEFAULT_ANDROID_PACKAGE_NAME;
  try {
    return await verifyAndroidPurchase({
      packageName: appPackage,
      productId,
      purchaseToken,
    });
  } catch (e) {
    const strict = strictVerifyEnabled();
    console.warn('[iapVerify] Android verification failed:', e.message);
    if (strict) {
      return {
        ok: false,
        status: 'verify_failed',
        retryable: true,
        platform: 'android',
        source: 'google_play',
        expiresAt: null,
        payload: {},
        reason: e.message,
      };
    }

    // Development fallback: allows end-to-end UI testing when Play API is not configured.
    return {
      ok: Boolean(purchaseToken && productId),
      status: purchaseToken && productId ? 'active' : 'verify_failed',
      platform: 'android',
      source: 'fallback_dev',
      expiresAt: null,
      payload: { warning: 'strict verification disabled' },
      reason: strict ? e.message : 'Strict verification disabled; using fallback',
    };
  }
}
