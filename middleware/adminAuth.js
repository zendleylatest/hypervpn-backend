import jwt from 'jsonwebtoken';

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'change-this-in-production';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export const signAdminToken = (adminId) => {
  return jwt.sign({ adminId }, ADMIN_JWT_SECRET, { expiresIn: '7d' });
};

export const verifyAdmin = (req, res, next) => {
  try {
    const header = req.header('Authorization');
    const token = header?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No admin token provided',
      });
    }

    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired admin token',
    });
  }
};

/**
 * Accepts either an admin JWT or the X-Service-Key header (from uni_admin_backend).
 * Use this on routes that the universal admin panel needs to proxy to.
 */
export const verifyAdminOrServiceKey = (req, res, next) => {
  // Check X-Service-Key first (inter-service calls from uni_admin_backend)
  const serviceKey = req.get('X-Service-Key')?.trim();
  if (INTERNAL_SERVICE_KEY && serviceKey === INTERNAL_SERVICE_KEY) {
    console.log(`[auth] service-key accepted for ${req.method} ${req.path}`);
    req.authMethod = 'service-key';
    return next();
  }

  // Fall back to admin JWT
  try {
    const header = req.header('Authorization');
    const token = header?.replace('Bearer ', '');
    if (!token) {
      console.warn(`[auth] rejected ${req.method} ${req.path} — no token or service key`);
      return res.status(401).json({ success: false, message: 'No admin token provided' });
    }
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    req.adminId = decoded.adminId;
    req.authMethod = 'admin-jwt';
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin token' });
  }
};

