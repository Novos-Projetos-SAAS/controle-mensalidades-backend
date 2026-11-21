import { z } from 'zod';

import connection from '../../database/connection.js';
import {
    codigoDaArea,
    habilitarAgendaPadrao,
    validarCriacaoArea,
} from '../areas_negocio/areas_negocio.creation.js';
import AppError from '../../shared/errors/AppError.js';

const criarOrganizacaoSchema = z
    .object({
        nome: z.string().trim().min(2).max(150),
        areaInicial: z.unknown(),
    })
    .strict();

export function validarCriacaoOrganizacao(valor: unknown) {
    const resultado = criarOrganizacaoSchema.safeParse(valor);
    if (!resultado.success) {
        throw new AppError('Dados da organização inválidos.', 400, 'DADOS_ORGANIZACAO_INVALIDOS');
    }
    return { nome: resultado.data.nome, areaInicial: validarCriacaoArea(resultado.data.areaInicial) };
}

/** A conta autenticada torna-se administradora somente da organização recém-criada. */
export async function criarOrganizacaoDoUsuario(
    usuarioId: string,
    dados: ReturnType<typeof validarCriacaoOrganizacao>,
) {
    return connection.transaction(async (transaction) => {
        const usuario = await transaction('usuarios')
            .select('id')
            .where({ id: usuarioId, ativo: true })
            .whereNull('deletado_em')
            .forUpdate()
            .first();
        if (!usuario) throw new AppError('Usuário não encontrado.', 401, 'AUTENTICACAO_INVALIDA');

        const [organizacao] = await transaction('organizacoes')
            .insert({ nome: dados.nome, ativo: true })
            .returning(['id', 'nome']);
        await transaction('usuarios_organizacoes').insert({
            usuario_id: usuarioId,
            organizacao_id: organizacao.id,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        });
        const [area] = await transaction('areas_negocio')
            .insert({
                organizacao_id: organizacao.id,
                nome: dados.areaInicial.nome,
                codigo: codigoDaArea(dados.areaInicial),
                ativo: true,
            })
            .returning(['id', 'nome', 'codigo', 'ativo']);
        await habilitarAgendaPadrao(transaction, organizacao.id, area.id, true);
        await transaction('registros_auditoria').insert({
            organizacao_id: organizacao.id,
            area_negocio_id: area.id,
            usuario_id: usuarioId,
            acao: 'ORGANIZACAO.CRIADA',
            recurso: 'ORGANIZACAO',
            recurso_id: organizacao.id,
            dados_contexto: { areaInicialId: area.id },
        });
        return {
            organizacao: { id: organizacao.id as string, nome: organizacao.nome as string, perfil: 'ADMINISTRADOR' as const },
            area: area as { id: string; nome: string; codigo: string; ativo: boolean },
        };
    });
}
