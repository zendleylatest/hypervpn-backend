import { signAdminToken } from '../middleware/adminAuth.js';

/**
 * Simple admin login using environment variables.
 * DO NOT use this in production without proper hardening.
 */
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin@gmail.com';

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials',
      });
    }

    const token = signAdminToken('nutriguide-admin');

    res.json({
      success: true,
      message: 'Admin login successful',
      token,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Admin login failed',
      error: error.message,
    });
  }
};

