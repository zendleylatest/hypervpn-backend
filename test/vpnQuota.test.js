const test = require("node:test");
const assert = require("node:assert/strict");
const {
  recordVpnUsage,
  usagePeriodFor,
  nextResetAt,
  vpnQuotaForUser,
} = require("../utils/vpnQuota");

const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
const NOV = new Date("2026-11-15T12:00:00Z");
const DEC = new Date("2026-12-01T00:00:01Z");

test("usage period is the UTC calendar month", () => {
  assert.equal(usagePeriodFor(new Date("2026-11-30T23:59:59Z")), "2026-11");
  assert.equal(usagePeriodFor(new Date("2026-12-01T00:00:00Z")), "2026-12");
  assert.equal(usagePeriodFor(new Date("2027-01-01T00:00:00Z")), "2027-01");
  assert.equal(nextResetAt(NOV).toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(
    nextResetAt(new Date("2026-12-20T00:00:00Z")).toISOString(),
    "2027-01-01T00:00:00.000Z"
  );
});

test("a user over the limit this month is blocked and told when it resets", () => {
  const user = { vpnUsageBytes: 10 * GB, vpnUsagePeriod: "2026-11" };
  const quota = vpnQuotaForUser(user, NOV);
  assert.equal(quota.limitReached, true);
  assert.equal(quota.remainingBytes, 0);
  assert.equal(quota.resetsAt, "2026-12-01T00:00:00.000Z");
});

test("in the new month the counter starts at zero and nothing carries over", () => {
  const user = { vpnUsageBytes: 10 * GB, vpnUsagePeriod: "2026-11" };
  const quota = vpnQuotaForUser(user, DEC);
  assert.equal(quota.usedBytes, 0);
  assert.equal(quota.limitReached, false);
  assert.equal(quota.remainingBytes, 10 * GB);

  // Unused data is not added to the next month either.
  const light = { vpnUsageBytes: 1 * MB, vpnUsagePeriod: "2026-11" };
  assert.equal(vpnQuotaForUser(light, DEC).remainingBytes, 10 * GB);
});

test("a user with no usage month yet starts from zero", () => {
  const quota = vpnQuotaForUser({ vpnUsageBytes: 9 * GB }, NOV);
  assert.equal(quota.usedBytes, 0);
});

test("limits per plan: guest 100 MB, free 10 GB, pro 30 GB", () => {
  const base = { vpnUsagePeriod: "2026-11", vpnUsageBytes: 0 };
  assert.equal(vpnQuotaForUser({ ...base, isGuest: true }, NOV).limitBytes, 100 * MB);
  assert.equal(vpnQuotaForUser({ ...base }, NOV).limitBytes, 10 * GB);
  assert.equal(vpnQuotaForUser({ ...base, isPro: true }, NOV).limitBytes, 30 * GB);
  assert.equal(
    vpnQuotaForUser({ ...base, isGuest: true, vpnUsageBytes: 100 * MB }, NOV).limitReached,
    true
  );
});

// Small in-memory stand-in for the two Mongo calls recordVpnUsage makes.
function fakeUserModel(doc) {
  return {
    async updateOne(filter, update) {
      if (filter.vpnUsagePeriod?.$ne !== undefined && doc.vpnUsagePeriod === filter.vpnUsagePeriod.$ne) {
        return { modifiedCount: 0 };
      }
      Object.assign(doc, update.$set);
      return { modifiedCount: 1 };
    },
    async findByIdAndUpdate(_id, update) {
      doc.vpnUsageBytes += update.$inc.vpnUsageBytes;
      return { ...doc };
    },
  };
}

test("recording usage in a new month resets first, then adds", async () => {
  const doc = { vpnUsageBytes: 9 * GB, vpnUsagePeriod: "2026-11" };
  const user = await recordVpnUsage(fakeUserModel(doc), "u1", 5 * MB, DEC);
  assert.equal(user.vpnUsagePeriod, "2026-12");
  assert.equal(user.vpnUsageBytes, 5 * MB);
  assert.equal(vpnQuotaForUser(user, DEC).limitReached, false);
});

test("recording usage in the same month just adds", async () => {
  const doc = { vpnUsageBytes: 1 * GB, vpnUsagePeriod: "2026-11" };
  const user = await recordVpnUsage(fakeUserModel(doc), "u1", 1 * GB, NOV);
  assert.equal(user.vpnUsageBytes, 2 * GB);
});

test("hitting the limit through reports blocks the user", async () => {
  const doc = { vpnUsageBytes: 10 * GB - MB, vpnUsagePeriod: "2026-11" };
  const user = await recordVpnUsage(fakeUserModel(doc), "u1", 2 * MB, NOV);
  assert.equal(vpnQuotaForUser(user, NOV).limitReached, true);
});

test("negative or junk deltas never reduce usage", async () => {
  const doc = { vpnUsageBytes: 100, vpnUsagePeriod: "2026-11" };
  const user = await recordVpnUsage(fakeUserModel(doc), "u1", -500, NOV);
  assert.equal(user.vpnUsageBytes, 100);
});
