import { Router } from 'express';

import saudeController from './saude.controller.js';

const rotasSaude = Router();

rotasSaude.get('/', saudeController.consultar.bind(saudeController));

export default rotasSaude;
