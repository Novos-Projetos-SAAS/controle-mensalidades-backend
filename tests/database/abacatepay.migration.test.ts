import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import knex from 'knex';

const migration = (await import(
    new URL(
        '../../src/database/migrations/20261125180000_071_abacatepay_recorrencias.js',
        import.meta.url,
    ).href
)) as { up: (db: ReturnType<typeof knex>) => Promise<void>; config?: { transaction: boolean } };

type LegacyIntegration = {
    id: string;
    organizacao_id: string;
    provedor: string;
    ativo: boolean;
    tem_credencial: boolean;
    tem_handle: boolean;
};
type Statement = { sql: string; bindings: unknown[]; response?: unknown };

// Compile real PostgreSQL statements, but replace the connection and executor: no database is opened.
function sandbox(
    t: TestContext,
    integrations: LegacyIntegration[] = [],
    conflicts: { charges?: number; events?: number; invalid?: number } = {},
) {
    const db = knex({ client: 'pg' });
    const statements: Statement[] = [];
    const connection = Object.freeze({ offline: true });
    Object.assign(db.client, {
        acquireConnection: async () => connection,
        releaseConnection: async () => undefined,
        _query: async (received: unknown, query: Statement) => {
            assert.equal(received, connection);
            const sql = query.sql.replace(/\s+/g, ' ').trim();
            statements.push({ sql, bindings: [...(query.bindings ?? [])] });
            let rows: unknown[] = [];
            if (/^select/i.test(sql) && sql.includes('cobrancas_pagamento'))
                rows = [{ total: String(conflicts.charges ?? 0) }];
            else if (/^select/i.test(sql) && sql.includes('eventos_webhook'))
                rows = [
                    {
                        total: String(
                            sql.includes('HAVING')
                                ? (conflicts.events ?? 0)
                                : (conflicts.invalid ?? 0),
                        ),
                    },
                ];
            else if (/^select/i.test(sql) && sql.includes('integracoes_pagamento'))
                rows = integrations;
            query.response = { command: 'SELECT', rowCount: rows.length, rows };
            return query;
        },
    });
    t.after(() => db.destroy());
    return { db, statements };
}

const integration = (
    id: string,
    org: string,
    provider: string,
    changes: Partial<LegacyIntegration> = {},
): LegacyIntegration => ({
    id,
    organizacao_id: org,
    provedor: provider,
    ativo: true,
    tem_credencial: true,
    tem_handle: true,
    ...changes,
});
const updates = (statements: Statement[]) => statements.filter((q) => /^update /i.test(q.sql));
const ddl = (statements: Statement[]) =>
    statements.filter((q) => /^(alter table|create|drop)/i.test(q.sql));

test('071 preserva integrações legadas em produção e define teste apenas para novos cadastros', async (t) => {
    const s = sandbox(t, [integration('legada', 'org', 'INFINITEPAY')]);
    await migration.up(s.db);
    const add = s.statements.find(
        (q) => /^alter table "integracoes_pagamento"/i.test(q.sql) && q.sql.includes('"ambiente"'),
    )!;
    assert.match(add.sql, /"ambiente".*default 'PRODUCAO'/i);
    const setDefault = s.statements.find((q) =>
        /ALTER COLUMN ambiente SET DEFAULT 'TESTE'/i.test(q.sql),
    );
    assert.ok(setDefault);
    assert.ok(s.statements.indexOf(add) < s.statements.indexOf(setDefault));
    assert.equal(
        updates(s.statements).some((q) =>
            /"(?:ativo|configuracao_criptografada|handle|ambiente)"\s*=/.test(q.sql),
        ),
        false,
    );
});

test('071 escolhe um único provedor elegível por organização com preferência pela InfinitePay ativa', async (t) => {
    const s = sandbox(t, [
        integration('aba-a', 'org-a', 'ABACATEPAY'),
        integration('inf-a', 'org-a', 'INFINITEPAY'),
        integration('aba-b', 'org-b', 'ABACATEPAY'),
    ]);
    await migration.up(s.db);
    const ids = updates(s.statements).flatMap((q) =>
        q.bindings.filter((v) => typeof v === 'string'),
    );
    assert.deepEqual(ids.sort(), ['aba-b', 'inf-a']);
    assert.ok(updates(s.statements).every((q) => /where "id" in/i.test(q.sql)));
});

test('071 não promove InfinitePay inativa nem contas sem credenciais ou identificação', async (t) => {
    const s = sandbox(t, [
        integration('inf-inativa', 'org-a', 'INFINITEPAY', { ativo: false }),
        integration('aba-a', 'org-a', 'ABACATEPAY'),
        integration('inf-sem-chave', 'org-b', 'INFINITEPAY', { tem_credencial: false }),
        integration('inf-sem-handle', 'org-c', 'INFINITEPAY', { tem_handle: false }),
        integration('outro', 'org-d', 'OUTRO'),
    ]);
    await migration.up(s.db);
    assert.deepEqual(
        updates(s.statements).flatMap((q) => q.bindings.filter((v) => typeof v === 'string')),
        ['aba-a'],
    );
});

test('071 deixa organização sem padrão quando não há integração elegível', async (t) => {
    const s = sandbox(t, [integration('inativa', 'org', 'INFINITEPAY', { ativo: false })]);
    await migration.up(s.db);
    assert.equal(updates(s.statements).length, 0);
});

test('071 distingue webhooks de teste e produção e impede chaves nulas de contornar unicidade', async (t) => {
    const s = sandbox(t);
    await migration.up(s.db);
    const index = s.statements.find((q) =>
        q.sql.includes('CREATE UNIQUE INDEX uq_abacatepay_evento'),
    )!;
    assert.match(
        index.sql,
        /organizacao_id\s*,\s*provedor\s*,\s*\(payload\s*->>\s*'devMode'\)\s*,\s*identificador_externo/i,
    );
    assert.match(index.sql, /WHERE provedor\s*=\s*'ABACATEPAY'/i);
    const check = s.statements.find((q) => q.sql.includes('chk_abacatepay_evento_identidade'))!;
    assert.ok(check);
    assert.match(check.sql, /organizacao_id IS NOT NULL/);
    assert.match(check.sql, /identificador_externo/);
    assert.match(check.sql, /jsonb_typeof\(payload\s*->\s*'devMode'\)/);
    assert.match(check.sql, /IS TRUE/);
});

test('071 trava escritas e verifica conflitos antes de qualquer alteração de esquema', async (t) => {
    const s = sandbox(t);
    await migration.up(s.db);
    assert.equal(migration.config?.transaction, true);
    assert.match(
        s.statements[0]!.sql,
        /^LOCK TABLE integracoes_pagamento, cobrancas_pagamento, eventos_webhook IN SHARE ROW EXCLUSIVE MODE$/i,
    );
    const firstDDL = s.statements.indexOf(ddl(s.statements)[0]!);
    const chargeCheck = s.statements.find(
        (q) => /^SELECT/i.test(q.sql) && q.sql.includes('cobrancas_pagamento'),
    )!;
    assert.ok(chargeCheck);
    assert.match(chargeCheck.sql, /HAVING COUNT\(\*\) > 1/);
    assert.match(chargeCheck.sql, /GROUP BY conta_receber_id/);
    for (const token of [
        'INFINITEPAY',
        'ABACATEPAY',
        'AGUARDANDO_CRIACAO',
        'CRIANDO',
        'CRIACAO_INCERTA',
        'AGUARDANDO_PAGAMENTO',
        'PAGO_EM_REVISAO',
    ])
        assert.ok(chargeCheck.sql.includes(`'${token}'`));
    assert.ok(s.statements.indexOf(chargeCheck) < firstDDL);
});

for (const [name, conflicts, pattern] of [
    ['cobranças ativas conflitantes', { charges: 2 }, /2.*contas.*cobranças ativas/i],
    ['webhooks duplicados no mesmo ambiente', { events: 3 }, /3.*webhooks duplicados/i],
    [
        'webhooks sem organização, ambiente válido ou identificador',
        { invalid: 4 },
        /4.*webhooks.*inválid/i,
    ],
] as const) {
    test(`071 interrompe sem modificar dados quando encontra ${name}`, async (t) => {
        const s = sandbox(t, [integration('preservada', 'org', 'INFINITEPAY')], conflicts);
        await assert.rejects(migration.up(s.db), pattern);
        assert.equal(ddl(s.statements).length, 0);
        assert.equal(updates(s.statements).length, 0);
    });
}

test('071 verifica duplicidade dos webhooks com a mesma chave usada no índice', async (t) => {
    const s = sandbox(t);
    await migration.up(s.db);
    const query = s.statements.find(
        (q) =>
            /^SELECT/i.test(q.sql) && q.sql.includes('eventos_webhook') && q.sql.includes('HAVING'),
    )!;
    assert.ok(query);
    assert.match(
        query.sql,
        /GROUP BY organizacao_id, provedor, \(payload ->> 'devMode'\), identificador_externo/,
    );
});
