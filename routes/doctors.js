import express from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import * as doctorController from '../controllers/doctorController.js';

const router = express.Router();

// Get all doctors with optional filters
router.get('/', optionalAuth, doctorController.getAllDoctors);

// Search doctors (must be before `/:id` or "search" is captured as an id)
router.get('/search/:query', optionalAuth, doctorController.searchDoctors);

// Get doctor by ID
router.get('/:id', optionalAuth, doctorController.getDoctorById);

// Admin: Create doctor (for seeding database)
router.post('/', authenticate, doctorController.createDoctor);

// Seed sample doctors (for development)
router.post('/seed', doctorController.seedDoctors);

export default router;
