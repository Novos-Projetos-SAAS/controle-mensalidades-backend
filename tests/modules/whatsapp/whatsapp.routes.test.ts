import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';

const ids = {
    organizacao: crypto.randomUUID(),
    outraOrganizacao: crypto.randomUUID(),
    area: crypto.randomUUID(),
    areaOutra: crypto.randomUUID(),
    admin: crypto.randomUUID(),
    operador: crypto.randomUUID(),
};

function cabecalhos(usuarioId: string, organizacaoId = ids.organizacao) {
    assert.ok(env.JWT_SECRET);
    const token = jwt.sign({}, env.JWT_SECRET, { subject: usuarioId, expiresIn: '1h' });
    return {
        Cookie: `token=${token}`,
        'x-organizacao-id': organizacaoId,
    };
}

async function limpar() {
    await connection('registros_auditoria')
        .whereIn('organizacao_id', [ids.organizacao, ids.outraOrganizacao])
        .del();
    await connection('integracoes_whatsapp')
        .whereIn('organizacao_id', [ids.organizacao, ids.outraOrganizacao])
        .del();
    await connection('usuarios_organizacoes')
        .whereIn('usuario_id', [ids.admin, ids.operador])
        .del();
    await connection('areas_negocio').whereIn('id', [ids.area, ids.areaOutra]).del();
    await connection('usuarios').whereIn('id', [ids.admin, ids.operador]).del();
    await connection('organizacoes').whereIn('id', [ids.organizacao, ids.outraOrganizacao]).del();
}

before(async () => {
    if (env.NODE_ENV !== 'test' || process.env.AMBIENTE_BANCO !== 'teste') {
        throw new Error('Testes WhatsApp exigem o banco exclusivo de testes.');
    }

    await connection('organizacoes').insert([
        { id: ids.organizacao, nome: `WhatsApp teste ${ids.organizacao}`, ativo: true },
        { id: ids.outraOrganizacao, nome: `WhatsApp outra ${ids.outraOrganizacao}`, ativo: true },
    ]);
    await connection('areas_negocio').insert([
        {
            id: ids.area,
            organizacao_id: ids.organizacao,
            nome: 'Área WhatsApp Teste',
            codigo: `WPP-${ids.area.slice(0, 8)}`,
            ativo: true,
        },
        {
            id: ids.areaOutra,
            organizacao_id: ids.outraOrganizacao,
            nome: 'Área WhatsApp Externa',
            codigo: `WPP-${ids.areaOutra.slice(0, 8)}`,
            ativo: true,
        },
    ]);
    await connection('usuarios').insert([
        {
            id: ids.admin,
            nome: 'Admin WhatsApp Teste',
            email: `whatsapp-admin-${ids.admin}@teste.local`,
            senha_hash: 'fixture',
            ativo: true,
        },
        {
            id: ids.operador,
            nome: 'Operador WhatsApp Teste',
            email: `whatsapp-operador-${ids.operador}@teste.local`,
            senha_hash: 'fixture',
            ativo: true,
        },
    ]);
    await connection('usuarios_organizacoes').insert([
        {
            usuario_id: ids.admin,
            organizacao_id: ids.organizacao,
            perfil: 'ADMINISTRADOR',
            ativo: true,
        },
        {
            usuario_id: ids.operador,
            organizacao_id: ids.organizacao,
            perfil: 'OPERADOR',
            ativo: true,
        },
    ]);
});

after(async () => {
    await limpar();
    await connection.destroy();
});

test('admin registra metadados sem ativar Meta nem expor referências a segredos', async () => {
    const resposta = await request(app)
        .put('/api/v1/whatsapp/configuracoes')
        .set(cabecalhos(ids.admin))
        .send({
            areaNegocioId: ids.area,
            whatsappBusinessAccountId: 'waba-fixture',
            phoneNumberId: 'phone-fixture',
            numeroExibido: '+5511999999999',
            nomeNegocio: 'Orbe Teste',
        });

    assert.equal(resposta.status, 200, JSON.stringify(resposta.body));
    assert.equal(resposta.body.data.situacao_conexao, 'PENDENTE_AUTORIZACAO');
    assert.equal(resposta.body.data.situacao_autorizacao, 'PENDENTE');
    assert.equal(resposta.body.data.ativo, false);
    assert.equal('credencial_referencia' in resposta.body.data, false);
    assert.equal('configuracao_criptografada' in resposta.body.data, false);

    const persistida = await connection('integracoes_whatsapp')
        .where({ organizacao_id: ids.organizacao, area_negocio_id: ids.area })
        .first();
    assert.equal(persistida.credencial_referencia, null);
    assert.equal(persistida.ativo, false);
    const auditoria = await connection('registros_auditoria')
        .where({ organizacao_id: ids.organizacao, acao: 'WHATSAPP.CONFIGURACAO_ATUALIZADA' })
        .first();
    assert.ok(auditoria);
    assert.equal(auditoria.dados_contexto.segredo_incluido, false);
});

test('rejeita campos de credencial, área de outra organização e perfil sem permissão', async () => {
    const comCredencial = await request(app)
        .put('/api/v1/whatsapp/configuracoes')
        .set(cabecalhos(ids.admin))
        .send({
            whatsappBusinessAccountId: 'waba-fixture',
            phoneNumberId: 'phone-fixture',
            numeroExibido: '+5511999999999',
            nomeNegocio: 'Orbe Teste',
            accessToken: 'não deve ser recebido',
        });
    assert.equal(comCredencial.status, 400);

    const areaExterna = await request(app)
        .put('/api/v1/whatsapp/configuracoes')
        .set(cabecalhos(ids.admin))
        .send({
            areaNegocioId: ids.areaOutra,
            whatsappBusinessAccountId: 'waba-fixture',
            phoneNumberId: 'phone-fixture',
            numeroExibido: '+5511999999999',
            nomeNegocio: 'Orbe Teste',
        });
    assert.equal(areaExterna.status, 404);

    const operador = await request(app)
        .get('/api/v1/whatsapp/configuracoes')
        .set(cabecalhos(ids.operador));
    assert.equal(operador.status, 403);
});

test('templates listados permanecem não submetidos e não aprovados', async () => {
    const resposta = await request(app)
        .get('/api/v1/whatsapp/modelos')
        .set(cabecalhos(ids.admin))
        .set('x-area-negocio-id', ids.area);

    assert.equal(resposta.status, 200, JSON.stringify(resposta.body));
    assert.deepEqual(
        resposta.body.data.map((modelo: { chave: string }) => modelo.chave),
        ['cobranca_vespera', 'cobranca_vencimento', 'cobranca_atraso_3d'],
    );
    assert.ok(
        resposta.body.data.every(
            (modelo: { aprovadoMeta: boolean; situacaoMeta: string; ativo: boolean }) =>
                !modelo.aprovadoMeta && modelo.situacaoMeta === 'NAO_SUBMETIDO' && !modelo.ativo,
        ),
    );
});
