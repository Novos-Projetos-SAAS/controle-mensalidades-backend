import { Router } from 'express';

import healthRoutes from '../../modules/health/health.routes.js';
import areasNegocioRoutes from '../../modules/areas_negocio/areas_negocio.routes.js';

const v1Routes = Router();

v1Routes.use('/health', healthRoutes);
v1Routes.use('/areas-negocio', areasNegocioRoutes);

export default v1Routes;
