import jwt from 'jsonwebtoken';

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'change-this-in-production';
const KNOWLEDGE_API_KEY = process.env.KNOWLEDGE_API_KEY || '';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

/**
 * Protects write routes on /api/knowledge.
 *
 * Accepts any of three auth methods (checked in order):
 *   1. X-Service-Key header — matches INTERNAL_SERVICE_KEY env var.
 *      Used by the universal admin backend when proxying AI-learning submissions.
 *      No per-app KNOWLEDGE_API_KEY is needed for this flow.
 *   2. X-Knowledge-Key header (or Bearer matching KNOWLEDGE_API_KEY) — legacy.
 *   3. Bearer JWT — valid admin JWT token.
 *
 * GET routes remain public (no auth needed).
 */
export function requireKnowledgeAuth(req, res, next) {
  // Method 1: Internal service key (from universal admin backend)
  const serviceKey = req.get('X-Service-Key')?.trim();
  if (INTERNAL_SERVICE_KEY && serviceKey === INTERNAL_SERVICE_KEY) {
    req.knowledgeAuthMethod = 'service-key';
    return next();
  }

  // Method 2: Dedicated knowledge API key
  const knowledgeKey = req.get('X-Knowledge-Key')?.trim();
  if (KNOWLEDGE_API_KEY && knowledgeKey === KNOWLEDGE_API_KEY) {
    req.knowledgeAuthMethod = 'api-key';
    return next();
  }

  // Method 3: Bearer token — either KNOWLEDGE_API_KEY or admin JWT
  const bearer = req.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (bearer) {
    if (KNOWLEDGE_API_KEY && bearer === KNOWLEDGE_API_KEY) {
      req.knowledgeAuthMethod = 'api-key';
      return next();
    }
    try {
      const decoded = jwt.verify(bearer, ADMIN_JWT_SECRET);
      req.adminId = decoded.adminId;
      req.knowledgeAuthMethod = 'admin-jwt';
      return next();
    } catch {
      // JWT invalid — fall through
    }
  }

  return res.status(401).json({
    success: false,
    message: 'Unauthorized. Provide X-Service-Key, X-Knowledge-Key, or a valid admin Bearer token.',
  });
}
