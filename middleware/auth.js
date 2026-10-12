import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Verify JWT token
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    console.log('[authenticate] Request path:', req.path);
    console.log('[authenticate] Authorization header:', authHeader ? 'present' : 'missing');
    
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      console.log('[authenticate] ❌ No token provided');
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authentication required.'
      });
    }

    console.log('[authenticate] Token received, verifying...');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('[authenticate] Token decoded successfully. UserId:', decoded.userId);
    
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      console.log('[authenticate] ❌ User not found for userId:', decoded.userId);
      return res.status(401).json({
        success: false,
        message: 'User not found. Invalid token.'
      });
    }

    if (user.active === false) {
      console.log('[authenticate] ❌ User account inactive:', decoded.userId);
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated.'
      });
    }

    console.log('[authenticate] ✓ Authentication successful. User:', user.email);
    req.user = user;
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      console.log('[authenticate] ❌ Invalid token:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      console.log('[authenticate] ❌ Token expired:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }
    console.error('[authenticate] ❌ Authentication error:', error);
    console.error('[authenticate] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Authentication error.',
      error: error.message
    });
  }
};

// Optional authentication (for guest users)
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (user) {
        req.user = user;
        req.userId = decoded.userId;
      }
    }
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

// Generate JWT token
export const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
};
