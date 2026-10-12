import express from 'express';
import { verifyAdmin, verifyAdminOrServiceKey } from '../middleware/adminAuth.js';
import {
  getUsers,
  updateUser,
  setUserBanState,
  toggleUserActive,
  getAllMealPlans,
  broadcastNotification,
  getUsageOverview,
  getChatUsageOverview,
  getUserChatUsage,
  getGuestChatStats,
} from '../controllers/adminController.js';

const router = express.Router();

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Admin routes are working' });
});

// Routes callable by both admin JWT and service key
router.get('/usage', verifyAdminOrServiceKey, getUsageOverview);
router.get('/users', verifyAdminOrServiceKey, getUsers);
router.patch('/users/:id/ban', verifyAdminOrServiceKey, setUserBanState);
router.patch('/users/:id/toggle', verifyAdminOrServiceKey, toggleUserActive);

// Routes that require a full admin JWT only
router.use((req, res, next) => {
  if (req.method === 'OPTIONS') return next();
  return verifyAdmin(req, res, next);
});

router.put('/users/:id', updateUser);
router.get('/meal-plans', getAllMealPlans);
router.post('/notifications/broadcast', broadcastNotification);

// Chat usage tracking
router.get('/chat/usage', getChatUsageOverview);
router.get('/chat/usage/user/:userId', getUserChatUsage);
router.get('/chat/usage/guest', getGuestChatStats);

export default router;
