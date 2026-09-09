import { Router } from 'express';

import healthRoutes from '../../modules/health/health.routes.js';
import areasNegocioRoutes from '../../modules/areas_negocio/areas_negocio.routes.js';
import modulosRoutes from '../../modules/modulos/modulos.routes.js';

const v1Routes = Router();

v1Routes.use('/health', healthRoutes);
v1Routes.use('/areas-negocio', areasNegocioRoutes);
v1Routes.use('/modulos', modulosRoutes);

export default v1Routes;
