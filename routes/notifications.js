import express from 'express';
import { body } from 'express-validator';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import * as notificationController from '../controllers/notificationController.js';

const router = express.Router();

// Register device token for push notifications
router.post('/register-token', optionalAuth, [
  body('token').notEmpty(),
  body('deviceType').optional(),
  body('deviceInfo').optional()
], notificationController.registerToken);

// Send push notification to user
router.post('/send', authenticate, [
  body('title').notEmpty(),
  body('body').notEmpty(),
  body('data').optional()
], notificationController.sendNotification);

// Get user's device tokens
router.get('/tokens', authenticate, notificationController.getTokens);

// Remove device token
router.delete('/tokens/:token', authenticate, notificationController.removeToken);

export default router;
