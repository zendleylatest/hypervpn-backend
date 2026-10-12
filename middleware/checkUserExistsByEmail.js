import User from '../models/User.js';
import { AUTH_MESSAGES } from '../utils/authMessages.js';

/**
 * Reject signup when email is already registered (sample_backend pattern).
 */
export async function checkUserExistsByEmail(req, res, next) {
  const { email } = req.body;

  if (!email?.trim()) {
    return res.status(400).json({ error: AUTH_MESSAGES.EMAIL_REQUIRED });
  }

  const user = await User.findOne({ email: email.trim().toLowerCase() });
  if (user) {
    return res.status(409).json({ error: AUTH_MESSAGES.USER_EXISTS });
  }

  next();
}
