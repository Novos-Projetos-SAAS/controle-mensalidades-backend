import { Router } from 'express';

import saudeRoutes from '../modules/saude/saude.routes.js';

const routes = Router();

routes.use('/saude', saudeRoutes);

export default routes;
