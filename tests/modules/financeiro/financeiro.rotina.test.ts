import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import knex, { type Knex } from 'knex';
import connection from '../../../src/database/connection.js';
import * as financeiro from '../../../src/modules/financeiro/financeiro.service.js';
import type { ContextoFinanceiro } from '../../../src/modules/financeiro/financeiro.service.js';
import type { GerarMensalidadeInput } from '../../../src/modules/financeiro/financeiro.validator.js';

test('recebimento externo mantém compatibilidade InfinitePay e distingue a origem AbacatePay na idempotência', async () => {
    for (const provedor of ['INFINITEPAY', 'ABACATEPAY'] as const) {
        const f = await fixture();
        const contexto = { organizacaoId: f.organizacao, areaNegocioId: f.area, usuarioId: null };
        const helper = Reflect.get(financeiro, 'gerarMensalidadeTransacional') as GerarTransacional;
        const { mensalidadeId } = await db.transaction((transaction) =>
            helper(transaction, contexto, f.assinatura, { competencia: '2024-01-01' }),
        );
        const mensalidade = await db('mensalidades').where('id', mensalidadeId).first();
        const cobrancaId = randomUUID();
        await db('cobrancas_pagamento').insert({
            id: cobrancaId,
            organizacao_id: f.organizacao,
            conta_receber_id: mensalidade.conta_receber_id,
            provedor,
            valor: '90.00',
            tipo: 'PIX',
            status: 'AGUARDANDO_PAGAMENTO',
        });
        const externo = {
            cobrancaId,
            transactionNsu: `txn-${randomUUID()}`,
            ...(provedor === 'ABACATEPAY' ? { provedor } : {}),
        };
        const dados = { valor: '90.00', forma_pagamento: 'PIX', pago_em: '2024-01-31T12:00:00Z' };
        const chave = `provedor-${randomUUID()}`;
        const receber = () =>
            db.transaction((transaction) =>
                financeiro.registrarRecebimentoTransacional(
                    transaction,
                    contexto,
                    mensalidadeId,
                    chave,
                    dados,
                    externo,
                ),
            );
        const primeiro = await receber();
        const repetido = await receber();
        assert.equal(primeiro.pagamento.origem, provedor);
        assert.equal(primeiro.repetido, false);
        assert.equal(repetido.repetido, true);
        assert.equal(repetido.pagamento.id, primeiro.pagamento.id);
        await assert.rejects(
            db.transaction((transaction) =>
                financeiro.registrarRecebimentoTransacional(
                    transaction,
                    contexto,
                    mensalidadeId,
                    chave,
                    dados,
                    {
                        ...externo,
                        provedor: provedor === 'ABACATEPAY' ? 'INFINITEPAY' : 'ABACATEPAY',
                    },
                ),
            ),
            (error: unknown) =>
                error instanceof Error &&
                'code' in error &&
                error.code === 'CHAVE_IDEMPOTENCIA_REUTILIZADA',
        );
        assert.equal(await total('pagamentos', f.organizacao), 1);
    }
});

const schema = `financeiro_rotina_${randomUUID().replaceAll('-', '')}`;
const db = knex({
    ...connection.client.config,
    searchPath: [schema, 'public'],
    pool: { min: 0, max: 8 },
});
type Fixture = {
    organizacao: string;
    area: string;
    cliente: string;
    plano: string;
    assinatura: string;
};
type GerarRotina = (database: Knex, hoje: string) => Promise<void>;
type GerarTransacional = (
    transaction: Knex.Transaction,
    contexto: ContextoFinanceiro,
    assinaturaId: string,
    dados: GerarMensalidadeInput,
) => Promise<{ mensalidadeId: string; criada: boolean }>;

async function gerar(hoje: string) {
    const modulo = await import(
        new URL('../../../src/modules/financeiro/financeiro.rotina.js', import.meta.url).href
    ).catch((error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND')
            return undefined;
        throw error;
    });
    assert.equal(
        typeof modulo?.gerarCompetenciasAutomaticas,
        'function',
        'Rotina automática ausente.',
    );
    await (modulo.gerarCompetenciasAutomaticas as GerarRotina)(db, hoje);
}

async function fixture(
    opcoes: {
        inicio?: string;
        fim?: string;
        status?: string;
        organizacaoAtiva?: boolean;
        areaAtiva?: boolean;
    } = {},
): Promise<Fixture> {
    const f = {
        organizacao: randomUUID(),
        area: randomUUID(),
        cliente: randomUUID(),
        plano: randomUUID(),
        assinatura: randomUUID(),
    };
    await db('organizacoes').insert({
        id: f.organizacao,
        nome: `Rotina ${f.organizacao}`,
        ativo: opcoes.organizacaoAtiva ?? true,
    });
    await db('areas_negocio').insert({
        id: f.area,
        organizacao_id: f.organizacao,
        nome: 'Área fictícia',
        codigo: f.area,
        ativo: opcoes.areaAtiva ?? true,
    });
    await db('clientes').insert({
        id: f.cliente,
        organizacao_id: f.organizacao,
        nome: 'Cliente fictício',
        ativo: true,
    });
    await db('clientes_areas').insert({
        cliente_id: f.cliente,
        area_negocio_id: f.area,
        ativo: true,
    });
    await db('planos_comerciais').insert({
        id: f.plano,
        organizacao_id: f.organizacao,
        area_negocio_id: f.area,
        nome: 'Plano fictício',
        valor_base: '100.00',
        periodicidade: 'MENSAL',
        ativo: true,
    });
    await db('assinaturas').insert({
        id: f.assinatura,
        organizacao_id: f.organizacao,
        area_negocio_id: f.area,
        cliente_id: f.cliente,
        plano_comercial_id: f.plano,
        valor_contratado: '100.00',
        desconto_recorrente: '10.00',
        dia_vencimento: 31,
        inicio_em: opcoes.inicio ?? '2024-01-01',
        fim_em: opcoes.fim ?? null,
        status: opcoes.status ?? 'ATIVA',
    });
    return f;
}

async function competencias(f: Fixture) {
    const rows = await db('mensalidades')
        .where('assinatura_id', f.assinatura)
        .select(db.raw("to_char(competencia, 'YYYY-MM-DD') as competencia"))
        .orderBy('competencia');
    return rows.map((row) => row.competencia as string);
}

async function total(tabela: string, organizacao: string) {
    return Number(
        (await db(tabela).where('organizacao_id', organizacao).count('* as total').first())?.total,
    );
}

before(async () => {
    if (process.env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste')
        throw new Error('Rotina financeira exige banco exclusivo de testes.');
    await connection.raw('CREATE SCHEMA ??', [schema]);
    const migrationsUrl = new URL('../../../src/database/migrations/', import.meta.url);
    const migrations = (await readdir(migrationsUrl)).filter((name) => name.endsWith('.js')).sort();
    await db.migrate.latest({
        schemaName: schema,
        migrationSource: {
            getMigrations: () => Promise.resolve(migrations),
            getMigrationName: (name) => name as string,
            getMigration: (name) => import(new URL(name as string, migrationsUrl).href),
        },
    });
});

after(async () => {
    await db.destroy();
    if (!/^financeiro_rotina_[a-f0-9]{32}$/.test(schema))
        throw new Error('Schema de teste inválido.');
    await connection.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [schema]);
    await connection.destroy();
});

test('geração repetida e concorrente mantém uma mensalidade e conta por competência e tenant', async () => {
    const a = await fixture();
    const b = await fixture();
    await Promise.all([gerar('2024-01-30'), gerar('2024-01-30'), gerar('2024-01-30')]);
    await gerar('2024-01-30');
    for (const f of [a, b]) {
        assert.deepEqual(await competencias(f), ['2024-01-01', '2024-02-01']);
        const rows = await db('mensalidades as m')
            .join('contas_receber as cr', 'cr.id', 'm.conta_receber_id')
            .where('m.assinatura_id', f.assinatura)
            .select(
                'm.organizacao_id',
                'm.area_negocio_id',
                'cr.cliente_id',
                'cr.status',
                'cr.recebido_em',
                'm.valor_final',
                db.raw("to_char(m.vencimento_em, 'YYYY-MM-DD') as vencimento"),
            )
            .orderBy('m.competencia');
        assert.deepEqual(
            rows.map((row) => row.vencimento),
            ['2024-01-31', '2024-02-29'],
        );
        for (const row of rows) {
            assert.equal(row.organizacao_id, f.organizacao);
            assert.equal(row.area_negocio_id, f.area);
            assert.equal(row.cliente_id, f.cliente);
            assert.equal(row.status, 'PENDENTE');
            assert.equal(row.recebido_em, null);
            assert.equal(row.valor_final, '90.00');
        }
        assert.equal(await total('contas_receber', f.organizacao), 2);
        assert.equal(await total('pagamentos', f.organizacao), 0);
        assert.equal(await total('registros_auditoria', f.organizacao), 2);
    }
});

test('rotina respeita período mensal e ignora assinatura, organização e área inativas', async () => {
    const futura = await fixture({ inicio: '2024-02-15', fim: '2024-02-20' });
    const encerrada = await fixture({ fim: '2024-01-15' });
    const fora = await fixture({ inicio: '2024-03-01' });
    const cancelada = await fixture({ status: 'CANCELADA' });
    const organizacaoInativa = await fixture({ organizacaoAtiva: false });
    const areaInativa = await fixture({ areaAtiva: false });
    await gerar('2024-01-30');
    assert.deepEqual(await competencias(futura), ['2024-02-01']);
    assert.deepEqual(await competencias(encerrada), ['2024-01-01']);
    for (const f of [fora, cancelada, organizacaoInativa, areaInativa])
        assert.deepEqual(await competencias(f), []);
});

test('rotina atravessa a virada do ano e limita vencimento ao último dia do mês', async () => {
    const f = await fixture({ inicio: '2024-12-01' });
    await gerar('2024-12-30');
    assert.deepEqual(await competencias(f), ['2024-12-01', '2025-01-01']);
    await gerar('2025-02-01');
    const row = await db('mensalidades')
        .where('assinatura_id', f.assinatura)
        .where('competencia', '2025-02-01')
        .select(db.raw("to_char(vencimento_em, 'YYYY-MM-DD') as vencimento"))
        .first();
    assert.equal(row.vencimento, '2025-02-28');
});

test('rotina não gera competências anteriores à janela atual', async () => {
    const f = await fixture();
    await gerar('2024-06-01');
    assert.deepEqual(await competencias(f), ['2024-06-01', '2024-07-01']);
});

test('datas inválidas são rejeitadas sem geração financeira', async () => {
    const f = await fixture();
    for (const hoje of ['2024-02-30', '2024-13-01', '2024-01-01T00:00:00Z', 'hoje'])
        await assert.rejects(gerar(hoje));
    assert.deepEqual(await competencias(f), []);
});

test('helper transacional preserva isolamento e reverte geração, conta, histórico e auditoria juntos', async () => {
    const f = await fixture();
    const outro = await fixture();
    const helper = Reflect.get(financeiro, 'gerarMensalidadeTransacional') as
        GerarTransacional | undefined;
    assert.equal(typeof helper, 'function', 'Helper transacional ausente.');
    const contexto = { organizacaoId: f.organizacao, areaNegocioId: f.area, usuarioId: null };
    await assert.rejects(
        db.transaction((transaction) =>
            helper!(transaction, { ...contexto, organizacaoId: outro.organizacao }, f.assinatura, {
                competencia: '2024-01-01',
            }),
        ),
        (error: unknown) =>
            error instanceof Error && 'code' in error && error.code === 'ASSINATURA_NAO_ENCONTRADA',
    );
    const rollback = new Error('ROLLBACK_INTENCIONAL_ROTINA');
    await assert.rejects(
        db.transaction(async (transaction) => {
            const primeira = await helper!(transaction, contexto, f.assinatura, {
                competencia: '2024-01-01',
            });
            const repetida = await helper!(transaction, contexto, f.assinatura, {
                competencia: '2024-01-01',
            });
            assert.equal(primeira.criada, true);
            assert.deepEqual(repetida, { mensalidadeId: primeira.mensalidadeId, criada: false });
            throw rollback;
        }),
        rollback,
    );
    assert.deepEqual(await competencias(f), []);
    assert.equal(await total('contas_receber', f.organizacao), 0);
    assert.equal(await total('registros_auditoria', f.organizacao), 0);
});

test('paginação processa assinaturas além do primeiro lote sem duplicação', async () => {
    const f = await fixture();
    await db('assinaturas').insert(
        Array.from({ length: 100 }, () => ({
            id: randomUUID(),
            organizacao_id: f.organizacao,
            area_negocio_id: f.area,
            cliente_id: f.cliente,
            plano_comercial_id: f.plano,
            valor_contratado: '100.00',
            desconto_recorrente: '10.00',
            dia_vencimento: 5,
            inicio_em: '2024-01-01',
            status: 'ATIVA',
        })),
    );
    await gerar('2024-01-30');
    await gerar('2024-01-30');
    assert.equal(await total('mensalidades', f.organizacao), 202);
});
