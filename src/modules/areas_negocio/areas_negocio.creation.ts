import type { Knex } from 'knex';
import { z } from 'zod';

import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';

const areaSchema = z
    .object({
        nome: z.string().trim().min(2).max(100),
        codigo: z
            .string()
            .trim()
            .toUpperCase()
            .regex(/^[A-Z0-9][A-Z0-9_]{1,49}$/)
            .optional(),
    })
    .strict();

export type CriarAreaInput = z.infer<typeof areaSchema>;

export function validarCriacaoArea(valor: unknown): CriarAreaInput {
    const resultado = areaSchema.safeParse(valor);
    if (!resultado.success) {
        throw new AppError('Dados da área de negócio inválidos.', 400, 'DADOS_AREA_INVALIDOS');
    }
    return resultado.data;
}

export function codigoDaArea(dados: CriarAreaInput): string {
    const codigo =
        dados.codigo ??
        dados.nome
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 50);
    if (!/^[A-Z0-9][A-Z0-9_]{1,49}$/.test(codigo)) {
        throw new AppError(
            'Informe um nome que gere um código válido.',
            400,
            'CODIGO_AREA_INVALIDO',
        );
    }
    return codigo;
}

/** Apenas o módulo operacional Agenda é habilitado por padrão; módulos clínicos nunca são concedidos. */
export async function habilitarAgendaPadrao(
    transaction: Knex.Transaction,
    organizacaoId: string,
    areaId: string,
    organizacaoNova: boolean,
) {
    const agenda = await transaction('modulos')
        .select('id')
        .where({ codigo: 'AGENDA', ativo: true })
        .whereNull('deletado_em')
        .first();
    if (!agenda) return;

    if (organizacaoNova) {
        await transaction('organizacoes_modulos').insert({
            organizacao_id: organizacaoId,
            modulo_id: agenda.id,
            habilitado: true,
        });
    } else {
        const liberado = await transaction('organizacoes_modulos')
            .select('id')
            .where({ organizacao_id: organizacaoId, modulo_id: agenda.id, habilitado: true })
            .whereNull('deletado_em')
            .first();
        if (!liberado) return;
    }
    await transaction('areas_modulos').insert({
        area_negocio_id: areaId,
        modulo_id: agenda.id,
        habilitado: true,
    });
}

export async function criarAreaDaOrganizacao(
    organizacaoId: string,
    usuarioId: string,
    dados: CriarAreaInput,
) {
    try {
        return await connection.transaction(async (transaction) => {
            const organizacao = await transaction('organizacoes')
                .select('id')
                .where({ id: organizacaoId, ativo: true })
                .whereNull('deletado_em')
                .forUpdate()
                .first();
            if (!organizacao) {
                throw new AppError(
                    'Organização não encontrada.',
                    404,
                    'ORGANIZACAO_NAO_ENCONTRADA',
                );
            }
            const [area] = await transaction('areas_negocio')
                .insert({
                    organizacao_id: organizacaoId,
                    nome: dados.nome,
                    codigo: codigoDaArea(dados),
                    ativo: true,
                })
                .returning(['id', 'nome', 'codigo', 'ativo']);
            await habilitarAgendaPadrao(transaction, organizacaoId, area.id, false);
            await transaction('registros_auditoria').insert({
                organizacao_id: organizacaoId,
                area_negocio_id: area.id,
                usuario_id: usuarioId,
                acao: 'AREA_NEGOCIO.CRIADA',
                recurso: 'AREA_NEGOCIO',
                recurso_id: area.id,
                dados_contexto: { codigo: area.codigo },
            });
            return area as { id: string; nome: string; codigo: string; ativo: boolean };
        });
    } catch (error) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === '23505' &&
            'constraint' in error &&
            error.constraint === 'uq_areas_negocio_organizacao_codigo'
        ) {
            throw new AppError(
                'Já existe uma área com este código na organização.',
                409,
                'AREA_CODIGO_DUPLICADO',
            );
        }
        throw error;
    }
}
