const jwt = require("jsonwebtoken");
const User = require("../models/usersModel");
const { refreshStoreSubscription } = require("./vpnController");

// App Store Server Notifications V2 webhook.
//
// The payload is only DECODED here, not trusted: its signature is not checked,
// so anyone could post a forged one. The only thing taken from it is the
// original transaction id, and the real subscription state is then fetched from
// Apple's server API with our own key. A forged payload can therefore not grant
// or revoke anything, it can only make us re-check one subscription.
async function handleAppleNotification(req, res) {
  try {
    const signedPayload = req.body?.signedPayload;
    if (!signedPayload || typeof signedPayload !== "string") {
      return res.status(400).send("Missing signedPayload");
    }

    const decodedPayload = jwt.decode(signedPayload);
    if (!decodedPayload) {
      return res.status(400).send("Invalid signedPayload");
    }

    const notificationType = decodedPayload.notificationType;
    const signedTransactionInfo = decodedPayload.data?.signedTransactionInfo;
    // Notifications such as TEST carry no transaction. Nothing to do.
    if (!signedTransactionInfo) return res.status(200).send("OK");

    const transaction = jwt.decode(signedTransactionInfo);
    const originalTransactionId = transaction?.originalTransactionId;
    if (!originalTransactionId) return res.status(200).send("OK");

    const user = await User.findOne({
      "subscription.originalTransactionId": String(originalTransactionId),
      "subscription.platform": "ios",
    });
    if (!user) {
      // Unknown transaction. Answer 200 so Apple does not keep retrying.
      return res.status(200).send("OK");
    }

    const verification = await refreshStoreSubscription(user, { force: true });
    if (verification?.retryable === true) {
      // Apple could not be reached just now. 5xx makes Apple retry later.
      console.warn("[apple:webhook] could not re-verify, asking Apple to retry", {
        notificationType,
      });
      return res.status(503).send("Retry later");
    }

    console.log("[apple:webhook] processed", {
      notificationType,
      subtype: decodedPayload.subtype || null,
      active: verification?.ok === true,
    });
    return res.status(200).send("OK");
  } catch (error) {
    console.error("[apple:webhook] error:", error);
    return res.status(500).send("Internal Server Error");
  }
}

module.exports = { handleAppleNotification };
