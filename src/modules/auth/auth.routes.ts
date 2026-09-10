import { Router } from 'express';

import { limitadorLogin } from '../../middlewares/rateLimit.middleware.js';

import authController from './auth.controller.js';

const authRoutes = Router();

authRoutes.post('/login', limitadorLogin, authController.login);

export default authRoutes;
