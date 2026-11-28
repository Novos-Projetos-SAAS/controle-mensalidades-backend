import type { NextFunction, Request, Response } from 'express';

import { env } from '../../configuration/env.js';
import connection from '../../database/connection.js';
import AppError from '../../shared/errors/AppError.js';

const migrationsObrigatorias = [
    '20261125121000_068_documentos_clinicos_versionados.js',
    '20261125122000_069_vinculos_clinicos_pacientes.js',
    '20261125130000_070_campos_evolucao_fisioterapia.js',
] as const;

type ConfigHomologacao = {
    NODE_ENV?: string;
    AMBIENTE_BANCO?: string;
    CLINICAL_HOMOLOGATION_ENABLED?: string;
    CLINICAL_HOMOLOGATION_CONFIRMATION?: string;
};

/**
 * O uso de prontuário persistido só é permitido em desenvolvimento
 * explicitamente habilitado ou teste isolado. Nunca em NODE_ENV=production.
 *
 * Flags NÃO substituem autenticação, permissão clínica ou vínculo paciente.
 * Os próprios serviços conferem autorização novamente dentro da transação.
 */
export function homologacaoClinicaAtiva(config: ConfigHomologacao = process.env): boolean {
    const ambiente = config.NODE_ENV ?? env.NODE_ENV;
    return (
        (ambiente === 'development' && ['homologacao', 'desenv'].includes(config.AMBIENTE_BANCO ?? '') ||
            ambiente === 'test' && config.AMBIENTE_BANCO === 'teste') &&
        config.CLINICAL_HOMOLOGATION_ENABLED === 'true' &&
        config.CLINICAL_HOMOLOGATION_CONFIRMATION === 'SOMENTE_DADOS_FICTICIOS'
    );
}

function acessoIndisponivel() {
    return new AppError(
        'Prontuário em homologação indisponível neste ambiente.',
        403,
        'ACESSO_CLINICO_NAO_CONFIGURADO',
    );
}

/** Fail-closed mesmo quando um roteador for montado por engano. */
export async function exigirAcessoClinicoDeHomologacao(
    _req: Request,
    _res: Response,
    next: NextFunction,
): Promise<void> {
    if (!homologacaoClinicaAtiva()) {
        next(acessoIndisponivel());
        return;
    }

    try {
        const migrations = await connection('knex_migrations')
            .whereIn('name', [...migrationsObrigatorias])
            .select('name') as Array<{ name: string }>;
        const aplicadas = new Set(migrations.map((row) => row.name));
        if (migrationsObrigatorias.some((name) => !aplicadas.has(name))) {
            next(new AppError(
                'Estrutura de prontuário ainda não preparada neste banco.',
                503,
                'ESTRUTURA_CLINICA_INDISPONIVEL',
            ));
            return;
        }
        next();
    } catch {
        next(new AppError(
            'Não foi possível verificar a estrutura do prontuário.',
            503,
            'ESTRUTURA_CLINICA_INDISPONIVEL',
        ));
    }
}
