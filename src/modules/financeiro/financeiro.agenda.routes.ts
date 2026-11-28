import { Router } from 'express';
import db from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';
import { autorizarRotina, executarGeracaoProgramada, geracaoProgramadaAtiva } from './financeiro.agenda.js';

const router = Router();
router.post('/gerar-mensalidades', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!geracaoProgramadaAtiva()) throw new AppError('Rotina indisponível.', 404, 'ROTINA_DESABILITADA');
    if (!autorizarRotina(req.get('authorization'))) throw new AppError('Não autorizado.', 401, 'ROTINA_NAO_AUTORIZADA');
    const data = await executarGeracaoProgramada(db);
    return res.status(data.status === 'EM_EXECUCAO' ? 409 : 200).json({ status: 'success', data });
});
export default router;
