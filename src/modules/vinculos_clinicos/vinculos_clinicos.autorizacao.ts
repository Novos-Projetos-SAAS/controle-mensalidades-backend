import type { Knex } from 'knex';
import AppError from '../../shared/errors/AppError.js';

// A autorizacao de area do profissional, sozinha, nao permite ver todos os
// pacientes. Exige vinculo clinico ATIVO e explicito para cada atendimento.
export async function exigirVinculoPacienteProfissional(
    executor: Knex.Transaction,
    contexto: {
        organizacaoId: string;
        areaNegocioId: string;
        profissionalId: string;
        clienteId: string;
    },
): Promise<void> {
    const vinculo = await executor('vinculos_clinicos_pacientes')
        .select('id')
        .where({
            organizacao_id: contexto.organizacaoId,
            area_negocio_id: contexto.areaNegocioId,
            profissional_id: contexto.profissionalId,
            cliente_id: contexto.clienteId,
        })
        .whereNull('revogado_em')
        // Protege contra revogacao concorrente durante a transacao de atendimento.
        .forShare()
        .first();

    if (!vinculo) {
        // Nao revelar se paciente existe em outra organizacao / e de outro profissional.
        throw new AppError(
            'Paciente clínico não encontrado.',
            404,
            'PACIENTE_CLINICO_NAO_ENCONTRADO',
        );
    }
}
