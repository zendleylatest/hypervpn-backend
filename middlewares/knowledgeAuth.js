const jwt = require("jsonwebtoken");

const ADMIN_JWT_SECRET =
  process.env.ADMIN_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "change-this-admin-secret";
const KNOWLEDGE_API_KEY = process.env.KNOWLEDGE_API_KEY || "";
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || "";

function requireKnowledgeAuth(req, res, next) {
  const serviceKey = req.get("X-Service-Key")?.trim();
  if (INTERNAL_SERVICE_KEY && serviceKey === INTERNAL_SERVICE_KEY) {
    req.knowledgeAuthMethod = "service-key";
    console.log("[knowledge:auth]", {
      accepted: true,
      method: "service-key",
      request: req.method + " " + req.originalUrl,
    });
    return next();
  }

  const knowledgeKey = req.get("X-Knowledge-Key")?.trim();
  if (KNOWLEDGE_API_KEY && knowledgeKey === KNOWLEDGE_API_KEY) {
    req.knowledgeAuthMethod = "api-key";
    console.log("[knowledge:auth]", {
      accepted: true,
      method: "api-key",
      request: req.method + " " + req.originalUrl,
    });
    return next();
  }

  const bearer = req
    .get("Authorization")
    ?.replace(/^Bearers+/i, "")
    .trim();
  if (bearer) {
    if (KNOWLEDGE_API_KEY && bearer === KNOWLEDGE_API_KEY) {
      req.knowledgeAuthMethod = "api-key";
      return next();
    }
    try {
      const decoded = jwt.verify(bearer, ADMIN_JWT_SECRET);
      req.adminId = decoded.adminId;
      req.knowledgeAuthMethod = "admin-jwt";
      console.log("[knowledge:auth]", {
        accepted: true,
        method: "admin-jwt",
        request: req.method + " " + req.originalUrl,
      });
      return next();
    } catch (_) {
      // Fall through to the unauthorized response.
    }
  }

  console.warn("[knowledge:auth]", {
    accepted: false,
    request: req.method + " " + req.originalUrl,
    hasServiceKey: Boolean(serviceKey),
    serviceKeyConfigured: Boolean(INTERNAL_SERVICE_KEY),
    hasKnowledgeKey: Boolean(knowledgeKey),
    knowledgeKeyConfigured: Boolean(KNOWLEDGE_API_KEY),
    hasBearer: Boolean(bearer),
  });
  return res.status(401).json({
    success: false,
    message:
      "Unauthorized. Provide X-Service-Key, X-Knowledge-Key, or a valid admin Bearer token.",
  });
}

module.exports = { requireKnowledgeAuth };
