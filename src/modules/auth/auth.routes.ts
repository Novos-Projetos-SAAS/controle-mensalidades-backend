import { Router } from 'express';

import { limitadorLogin } from '../../middlewares/rateLimit.middleware.js';
import verifyUser from '../../middlewares/verifyUser.middleware.js';

import authController from './auth.controller.js';

const authRoutes = Router();

// ROTA POST /login
authRoutes.post('/login', limitadorLogin, authController.login);

// Middleware de autenticação.
// ROTA GET /me
authRoutes.get('/me', verifyUser, authController.me);

// ROTA POST /logout
authRoutes.post('/logout', authController.logout);

export default authRoutes;
