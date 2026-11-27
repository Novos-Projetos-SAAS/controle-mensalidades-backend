import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after, afterEach, before } from 'node:test';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import { gerarMensalidadeTransacional } from '../../../src/modules/financeiro/financeiro.service.js';

const base = '/api/v1/financeiro';
const a = {
    org: randomUUID(),
    area: randomUUID(),
    admin: randomUUID(),
    cliente: randomUUID(),
    plano: randomUUID(),
    assinatura: randomUUID(),
    mensalidade: '',
};
const b = {
    org: randomUUID(),
    area: randomUUID(),
    admin: randomUUID(),
    cliente: randomUUID(),
    plano: randomUUID(),
    assinatura: randomUUID(),
    mensalidade: '',
};
const clienteUsuario = randomUUID();
const profissionalUsuario = randomUUID();
const apiKeyA = 'abc_dev_routes_qa_ficticia_a';
const apiKeyB = 'abc_dev_routes_qa_ficticia_b';
const webhookA = 'webhook-routes-qa-ficticio-org-a-00000000';
const webhookB = 'webhook-routes-qa-ficticio-org-b-00000000';
const originalFetch = globalThis.fetch;
let chamadasExternas = 0;

function headers(f = a, usuario = f.admin) {
    if (!env.JWT_SECRET) throw new Error('JWT de teste obrigatório.');
    return {
        Cookie: `token=${jwt.sign({}, env.JWT_SECRET, { subject: usuario, expiresIn: '1h' })}`,
        'x-organizacao-id': f.org,
        'x-area-negocio-id': f.area,
    };
}

type Rota = { metodo: 'get' | 'patch' | 'post'; caminho: string; body?: Record<string, unknown> };
function rotas(): Rota[] {
    return [
        { metodo: 'get', caminho: '/abacatepay/configuracao' },
        { metodo: 'patch', caminho: '/abacatepay/configuracao', body: { ativo: false } },
        { metodo: 'get', caminho: '/integracoes-pagamento' },
        { metodo: 'patch', caminho: '/provedor-padrao', body: { provedor: 'ABACATEPAY' } },
        { metodo: 'get', caminho: `/assinaturas/${a.assinatura}/recorrencia` },
        {
            metodo: 'post',
            caminho: `/assinaturas/${a.assinatura}/recorrencia`,
            body: { metodo: 'CARD' },
        },
        { metodo: 'post', caminho: `/assinaturas/${a.assinatura}/recorrencia/conciliar` },
        { metodo: 'post', caminho: `/assinaturas/${a.assinatura}/recorrencia/cancelar` },
        { metodo: 'get', caminho: `/mensalidades/${a.mensalidade}/cobranca` },
        {
            metodo: 'post',
            caminho: `/mensalidades/${a.mensalidade}/cobranca`,
            body: { provedor: 'ABACATEPAY' },
        },
    ];
}

async function chamar(rota: Rota, cabecalhos?: Record<string, string>) {
    const req = request(app)[rota.metodo](`${base}${rota.caminho}`);
    if (cabecalhos) req.set(cabecalhos);
    if (rota.body) req.send(rota.body);
    return req;
}

async function limpar() {
    const orgs = [a.org, b.org];
    const mensalidades = await connection('mensalidades')
        .whereIn('organizacao_id', orgs)
        .select('id');
    await connection('registros_auditoria').whereIn('organizacao_id', orgs).del();
    await connection('recursos_pagamento').whereIn('organizacao_id', orgs).del();
    await connection('recorrencias_pagamento').whereIn('organizacao_id', orgs).del();
    await connection('transacoes_pagamento').whereIn('organizacao_id', orgs).del();
    await connection('pagamentos').whereIn('organizacao_id', orgs).del();
    await connection('cobrancas_pagamento').whereIn('organizacao_id', orgs).del();
    if (mensalidades.length)
        await connection('historico_mensalidades')
            .whereIn(
                'mensalidade_id',
                mensalidades.map((m) => m.id as string),
            )
            .del();
    await connection('mensalidades').whereIn('organizacao_id', orgs).del();
    await connection('contas_receber').whereIn('organizacao_id', orgs).del();
    await connection('assinaturas').whereIn('organizacao_id', orgs).del();
    await connection('planos_comerciais').whereIn('organizacao_id', orgs).del();
    await connection('integracoes_pagamento').whereIn('organizacao_id', orgs).del();
    await connection('clientes_areas').whereIn('cliente_id', [a.cliente, b.cliente]).del();
    await connection('clientes').whereIn('id', [a.cliente, b.cliente]).del();
    await connection('usuarios_organizacoes').whereIn('organizacao_id', orgs).del();
    await connection('usuarios')
        .whereIn('id', [a.admin, b.admin, clienteUsuario, profissionalUsuario])
        .del();
    await connection('areas_negocio').whereIn('id', [a.area, b.area]).del();
    await connection('organizacoes').whereIn('id', orgs).del();
}

before(async () => {
    if (
        env.NODE_ENV !== 'test' ||
        process.env.AMBIENTE_BANCO !== 'teste' ||
        !process.env.DATABASE_URL_TEST ||
        process.env.DATABASE_URL_TEST === process.env.DATABASE_URL
    )
        throw new Error('Exige banco exclusivo de testes.');
    globalThis.fetch = async () => {
        chamadasExternas++;
        throw new Error('Rede externa proibida neste teste HTTP.');
    };
    for (const f of [a, b]) {
        await connection('organizacoes').insert({
            id: f.org,
            nome: `Rotas Abacate QA ${f.org}`,
            ativo: true,
        });
        await connection('areas_negocio').insert({
            id: f.area,
            organizacao_id: f.org,
            nome: 'Área fictícia',
            codigo: f.area,
            ativo: true,
        });
        await connection('usuarios').insert({
            id: f.admin,
            nome: 'Admin fictício',
            email: `${f.admin}@teste.local`,
            senha_hash: 'fixture',
            ativo: true,
        });
        await connection('usuarios_organizacoes').insert({
            usuario_id: f.admin,
            organizacao_id: f.org,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        });
        await connection('clientes').insert({
            id: f.cliente,
            organizacao_id: f.org,
            nome: 'Cliente fictício',
            ativo: true,
        });
        await connection('clientes_areas').insert({
            cliente_id: f.cliente,
            area_negocio_id: f.area,
            ativo: true,
        });
        await connection('planos_comerciais').insert({
            id: f.plano,
            organizacao_id: f.org,
            area_negocio_id: f.area,
            nome: 'Plano fictício',
            valor_base: '100.00',
            periodicidade: 'MENSAL',
            ativo: true,
        });
        await connection('assinaturas').insert({
            id: f.assinatura,
            organizacao_id: f.org,
            area_negocio_id: f.area,
            cliente_id: f.cliente,
            plano_comercial_id: f.plano,
            valor_contratado: '100.00',
            desconto_recorrente: '0.00',
            dia_vencimento: 5,
            inicio_em: '2026-01-01',
            status: 'ATIVA',
        });
        const criada = await connection.transaction((transaction) =>
            gerarMensalidadeTransacional(
                transaction,
                { organizacaoId: f.org, areaNegocioId: f.area, usuarioId: f.admin },
                f.assinatura,
                { competencia: '2026-11-01' },
            ),
        );
        f.mensalidade = criada.mensalidadeId;
    }
    for (const [id, perfil] of [
        [clienteUsuario, 'CLIENTE'],
        [profissionalUsuario, 'PROFISSIONAL'],
    ]) {
        await connection('usuarios').insert({
            id,
            nome: `Usuário fictício ${perfil}`,
            email: `${id}@teste.local`,
            senha_hash: 'fixture',
            ativo: true,
        });
        await connection('usuarios_organizacoes').insert({
            usuario_id: id,
            organizacao_id: a.org,
            perfil,
            ativo: true,
        });
    }
});

afterEach(() => assert.equal(chamadasExternas, 0, 'A rota não deveria chamar o provedor.'));
after(async () => {
    globalThis.fetch = originalFetch;
    try {
        await limpar();
    } finally {
        await connection.destroy();
    }
});

test('rotas administrativas AbacatePay exigem autenticação HTTP real', async () => {
    for (const rota of rotas()) {
        const resposta = await chamar(rota);
        assert.equal(resposta.status, 401, `${rota.metodo} ${rota.caminho}: ${resposta.text}`);
    }
});

test('cliente e profissional autenticados não administram pagamentos', async () => {
    for (const usuario of [clienteUsuario, profissionalUsuario])
        for (const rota of rotas()) {
            const resposta = await chamar(rota, headers(a, usuario));
            assert.equal(resposta.status, 403, `${rota.metodo} ${rota.caminho}: ${resposta.text}`);
            assert.equal(resposta.body.codigo, 'PERFIL_NAO_AUTORIZADO');
        }
});

test('admin configura apenas sua organização e recebe indicadores de segredo sem credenciais', async () => {
    const configurar = async (f: typeof a, api_key: string, webhook_secret: string) => {
        const resposta = await request(app)
            .patch(`${base}/abacatepay/configuracao`)
            .set(headers(f))
            .set('x-platform-origin', 'https://plataforma.example')
            .send({
                ativo: true,
                ambiente: 'TESTE',
                api_key,
                webhook_secret,
                recorrencia_habilitada: true,
            });
        assert.equal(resposta.status, 200, resposta.text);
        assert.equal(resposta.body.data.has_api_key, true);
        assert.equal(resposta.body.data.has_webhook_secret, true);
        assert.equal(resposta.text.includes(api_key), false);
        assert.equal(resposta.text.includes(webhook_secret), false);
        assert.equal('configuracao_criptografada' in resposta.body.data, false);
        return resposta.body.data.id as string;
    };
    const idA = await configurar(a, apiKeyA, webhookA);
    const vaziaB = await request(app).get(`${base}/abacatepay/configuracao`).set(headers(b));
    assert.equal(vaziaB.status, 200);
    assert.equal(vaziaB.body.data.has_api_key, false);
    assert.equal(vaziaB.body.data.id, null);
    const idB = await configurar(b, apiKeyB, webhookB);
    assert.notEqual(idA, idB);
    for (const [f, id] of [
        [a, idA],
        [b, idB],
    ] as const) {
        const resposta = await request(app).get(`${base}/abacatepay/configuracao`).set(headers(f));
        assert.equal(resposta.status, 200);
        assert.equal(resposta.body.data.id, id);
        for (const segredo of [apiKeyA, apiKeyB, webhookA, webhookB])
            assert.equal(resposta.text.includes(segredo), false);
        const row = await connection('integracoes_pagamento')
            .where({ id, organizacao_id: f.org })
            .first();
        assert.equal(typeof row.configuracao_criptografada, 'string');
        assert.equal(row.configuracao_criptografada.includes(apiKeyA), false);
        assert.equal(row.configuracao_criptografada.includes(apiKeyB), false);
    }
});

test('mensalidade e recorrência de outra organização retornam 404 sem revelar dados', async () => {
    for (const caminho of [
        `/mensalidades/${b.mensalidade}/cobranca`,
        `/assinaturas/${b.assinatura}/recorrencia`,
    ]) {
        const negada = await request(app).get(`${base}${caminho}`).set(headers(a));
        assert.equal(negada.status, 404, negada.text);
        assert.equal(negada.text.includes(b.org), false);
        assert.equal(negada.text.includes(b.cliente), false);
        const propria = await request(app).get(`${base}${caminho}`).set(headers(b));
        assert.equal(propria.status, 200, propria.text);
        assert.equal(propria.body.data, null);
    }
});

test('valores e nomes enviados pelo frontend são rejeitados antes de qualquer chamada externa', async () => {
    for (const extra of [{ valor: '0.01' }, { nome: 'Valor e identidade não confiáveis' }]) {
        const avulsa = await request(app)
            .post(`${base}/mensalidades/${a.mensalidade}/cobranca`)
            .set(headers(a))
            .send({ provedor: 'ABACATEPAY', ...extra });
        assert.equal(avulsa.status, 400, avulsa.text);
        assert.equal(avulsa.body.codigo, 'PROVEDOR_INVALIDO');
        const recorrente = await request(app)
            .post(`${base}/assinaturas/${a.assinatura}/recorrencia`)
            .set(headers(a))
            .send({ metodo: 'CARD', ...extra });
        assert.equal(recorrente.status, 400, recorrente.text);
        assert.equal(recorrente.body.codigo, 'RECORRENCIA_DADOS_INVALIDOS');
    }
    assert.equal(
        Number(
            (
                await connection('cobrancas_pagamento')
                    .where('organizacao_id', a.org)
                    .count('* as total')
                    .first()
            )?.total,
        ),
        0,
    );
    assert.equal(
        Number(
            (
                await connection('recorrencias_pagamento')
                    .where('organizacao_id', a.org)
                    .count('* as total')
                    .first()
            )?.total,
        ),
        0,
    );
});
