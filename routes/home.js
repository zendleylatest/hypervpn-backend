import express from 'express';
import { authenticate } from '../middleware/auth.js';
import * as homeController from '../controllers/homeController.js';

const router = express.Router();

router.get('/dashboard', authenticate, homeController.getHomeDashboard);

export default router;
