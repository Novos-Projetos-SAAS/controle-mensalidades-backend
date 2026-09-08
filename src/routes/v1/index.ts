import { Router } from 'express';

import saudeRoutes from '../../modules/saude/saude.routes.js';

const v1Routes = Router();

v1Routes.use('/saude', saudeRoutes);

export default v1Routes;
