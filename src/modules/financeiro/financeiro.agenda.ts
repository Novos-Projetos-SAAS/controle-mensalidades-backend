import { createHash, timingSafeEqual } from 'node:crypto';
import type { Knex } from 'knex';
import { gerarCompetenciasAutomaticas } from './financeiro.rotina.js';
import { janelaWhatsappAberta } from '../whatsapp/whatsapp.janela.js';

export function geracaoProgramadaAtiva() {
    return process.env.FINANCEIRO_GERACAO_PROGRAMADA_ENABLED === 'true';
}
export function autorizarRotina(header: string | undefined, segredo = process.env.FINANCEIRO_ROTINA_TOKEN) {
    if (!segredo || segredo.length < 32 || !header?.startsWith('Bearer ')) return false;
    const hash = (value: string) => createHash('sha256').update(value).digest();
    return timingSafeEqual(hash(header.slice(7)), hash(segredo));
}
export function diaGeracao(agora: Date): string {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(agora);
    const get = (key: string) => partes.find((p) => p.type === key)?.value;
    return [get('year'), get('month'), get('day')].join('-');
}

/** Uma execução bem-sucedida por dia. Sem timers ou keep-alive. */
export async function executarGeracaoProgramada(db: Knex, agora = new Date()) {
    if (!janelaWhatsappAberta(agora, '07:00', '19:00')) return { status: 'FORA_DA_JANELA' };
    const dia = diaGeracao(agora);
    return db.transaction(async (trx) => {
        const lock = await trx.raw('SELECT pg_try_advisory_xact_lock(hashtextextended(?, 0)) AS adquirido', ['financeiro-geracao-programada']);
        if (!lock.rows[0]?.adquirido) return { status: 'EM_EXECUCAO' };
        const existente = await trx('financeiro_rotinas_diarias').where({ dia }).first();
        if (existente) return { status: 'JA_EXECUTADA' };
        await gerarCompetenciasAutomaticas(trx, dia);
        await trx('financeiro_rotinas_diarias').insert({ dia, concluida_em: trx.fn.now() });
        return { status: 'CONCLUIDA' };
    });
}
