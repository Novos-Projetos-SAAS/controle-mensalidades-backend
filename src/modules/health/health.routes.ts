import { Router } from 'express';

import healthController from './health.controller.js';

const rotasSaude = Router();

rotasSaude.get('/', healthController.consultar.bind(healthController));

export default rotasSaude;
