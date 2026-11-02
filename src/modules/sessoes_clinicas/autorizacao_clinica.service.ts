import type { Knex } from 'knex';

import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';

type ExecutorBanco = Knex | Knex.Transaction;

export type IdentidadeClinica = {
    profissionalId: string;
};

function acessoNegado(): AppError {
    return new AppError(
        'Usuário não possui autorização para acessar informações clínicas nesta área.',
        403,
        'ACESSO_CLINICO_NEGADO',
    );
}

function sessaoNaoEncontrada(): AppError {
    return new AppError('Sessão clínica não encontrada.', 404, 'SESSAO_CLINICA_NAO_ENCONTRADA');
}

class AutorizacaoClinicaService {
    // Identifica um único profissional habilitado para este usuário, organização e área.
    // O perfil ADMINISTRADOR/OPERADOR, isoladamente, não concede permissão clínica.
    async identificarProfissional(
        usuarioId: string | undefined,
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        executor: ExecutorBanco = connection,
        bloquearDuranteTransacao = false,
    ): Promise<IdentidadeClinica> {
        if (!usuarioId || !organizacaoId || !areaNegocioId) {
            throw acessoNegado();
        }

        const consulta = executor('profissionais as p')
            .innerJoin('profissionais_areas as pa', function () {
                this.on('pa.profissional_id', '=', 'p.id').andOnVal(
                    'pa.area_negocio_id',
                    areaNegocioId,
                );
            })
            .innerJoin('usuarios as u', 'u.id', 'p.usuario_id')
            .innerJoin('usuarios_organizacoes as uo', function () {
                this.on('uo.usuario_id', '=', 'u.id').andOnVal('uo.organizacao_id', organizacaoId);
            })
            .innerJoin('areas_negocio as a', 'a.id', 'pa.area_negocio_id')
            .innerJoin('organizacoes as o', 'o.id', 'p.organizacao_id')
            .select('p.id')
            .where({
                'p.usuario_id': usuarioId,
                'p.organizacao_id': organizacaoId,
                'p.ativo': true,
                'pa.ativo': true,
                'pa.acesso_clinico_autorizado': true,
                'u.ativo': true,
                'uo.ativo': true,
                'a.organizacao_id': organizacaoId,
                'a.ativo': true,
                'o.ativo': true,
            })
            .whereNull('p.deletado_em')
            .whereNull('pa.deletado_em')
            .whereNull('u.deletado_em')
            .whereNull('uo.deletado_em')
            .whereNull('a.deletado_em')
            .whereNull('o.deletado_em')
            .limit(2);

        if (bloquearDuranteTransacao) {
            consulta.forShare();
        }

        const profissionais = await consulta;

        // Múltiplos profissionais para a mesma identidade na mesma área são ambíguos.
        const profissional = profissionais[0];

        if (profissionais.length !== 1 || !profissional) {
            throw acessoNegado();
        }

        return { profissionalId: profissional.id as string };
    }

    // Para leitura, correção e histórico: somente a sessão do próprio profissional.
    // Retorna 404 em caso de sessão alheia para não revelar sua existência.
    async exigirTitularidadeSessao(
        usuarioId: string | undefined,
        organizacaoId: string | undefined,
        areaNegocioId: string | undefined,
        sessaoClinicaId: string,
        executor: ExecutorBanco = connection,
    ): Promise<IdentidadeClinica> {
        const identidade = await this.identificarProfissional(
            usuarioId,
            organizacaoId,
            areaNegocioId,
            executor,
        );

        const sessao = await executor('sessoes_clinicas')
            .select('id')
            .where({
                id: sessaoClinicaId,
                organizacao_id: organizacaoId,
                area_negocio_id: areaNegocioId,
                profissional_id: identidade.profissionalId,
            })
            .whereNull('deletado_em')
            .first();

        if (!sessao) {
            throw sessaoNaoEncontrada();
        }

        return identidade;
    }
}

export default new AutorizacaoClinicaService();
