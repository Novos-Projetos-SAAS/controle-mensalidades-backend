import type { Knex } from 'knex';
import { z } from 'zod';
import { gerarMensalidadeTransacional } from './financeiro.service.js';

type AssinaturaRotina = {
    id: string;
    organizacao_id: string;
    area_negocio_id: string;
    inicio_em: Date | string;
    fim_em: Date | string | null;
};

function mes(data: Date | string): string {
    return data instanceof Date ? data.toISOString().slice(0, 7) : data.slice(0, 7);
}

function assinaturasAtivas(db: Knex) {
    return db('assinaturas as a')
        .innerJoin('organizacoes as o', 'o.id', 'a.organizacao_id')
        .innerJoin('areas_negocio as an', function () {
            this.on('an.id', 'a.area_negocio_id').andOn('an.organizacao_id', 'a.organizacao_id');
        })
        .where('a.status', 'ATIVA')
        .where('o.ativo', true)
        .where('an.ativo', true);
}

export async function gerarCompetenciasAutomaticas(db: Knex, hoje: string): Promise<void> {
    z.iso.date().parse(hoje);
    const atual = `${hoje.slice(0, 7)}-01`;
    const proximaData = new Date(`${atual}T00:00:00.000Z`);
    proximaData.setUTCMonth(proximaData.getUTCMonth() + 1);
    const proxima = proximaData.toISOString().slice(0, 10);
    proximaData.setUTCMonth(proximaData.getUTCMonth() + 1);
    const fimJanela = proximaData.toISOString().slice(0, 10);
    const ultima = await assinaturasAtivas(db)
        .select('a.id')
        .orderBy('a.id', 'desc')
        .first<{ id: string }>();
    if (!ultima) return;
    let cursor: string | undefined;

    for (;;) {
        const query = assinaturasAtivas(db)
            .select<AssinaturaRotina[]>(
                'a.id',
                'a.organizacao_id',
                'a.area_negocio_id',
                'a.inicio_em',
                'a.fim_em',
            )
            .where('a.id', '<=', ultima.id)
            .where('a.inicio_em', '<', fimJanela)
            .where(function () {
                this.whereNull('a.fim_em').orWhere('a.fim_em', '>=', atual);
            })
            .orderBy('a.id')
            .limit(100);
        if (cursor) query.where('a.id', '>', cursor);
        const assinaturas = await query;
        if (!assinaturas.length) return;

        for (const assinatura of assinaturas) {
            await db.transaction(async (transaction) => {
                const vigente = await assinaturasAtivas(transaction)
                    .select<AssinaturaRotina[]>(
                        'a.id',
                        'a.organizacao_id',
                        'a.area_negocio_id',
                        'a.inicio_em',
                        'a.fim_em',
                    )
                    .where('a.id', assinatura.id)
                    .where('a.organizacao_id', assinatura.organizacao_id)
                    .where('a.area_negocio_id', assinatura.area_negocio_id)
                    .forUpdate('a')
                    .first();
                if (!vigente) return;

                for (const competencia of [atual, proxima]) {
                    const competenciaMes = competencia.slice(0, 7);
                    if (
                        competenciaMes < mes(vigente.inicio_em) ||
                        (vigente.fim_em && competenciaMes > mes(vigente.fim_em))
                    )
                        continue;
                    await gerarMensalidadeTransacional(
                        transaction,
                        {
                            organizacaoId: vigente.organizacao_id,
                            areaNegocioId: vigente.area_negocio_id,
                            usuarioId: null,
                        },
                        vigente.id,
                        { competencia },
                    );
                }
            });
        }
        cursor = assinaturas.at(-1)!.id;
    }
}
