import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test, { after } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import { protecaoCpfAtiva } from '../../../src/utils/cpf.crypto.js';

after(async () => {
    await connection.destroy();
});

function cookieDeAdmin(usuarioId: string): string {
    if (!env.JWT_SECRET) throw new Error('JWT_SECRET_TEST obrigatória.');
    const token = jwt.sign({}, env.JWT_SECRET, { subject: usuarioId, expiresIn: '1h' });
    return 'token=' + token;
}

function validarAmbienteIsolado(): void {
    if (
        env.NODE_ENV !== 'test' ||
        process.env.AMBIENTE_BANCO !== 'teste' ||
        !process.env.DATABASE_URL_TEST ||
        process.env.DATABASE_URL_TEST === process.env.DATABASE_URL
    ) {
        throw new Error('Teste HTTP exige banco exclusivo de testes.');
    }
}

test(
    'HTTP: CPF cifrado em criação, detalhe, busca, edição e duplicidade entre organizações',
    { skip: !protecaoCpfAtiva() },
    async () => {
        validarAmbienteIsolado();

        const orgA = randomUUID();
        const orgB = randomUUID();
        const adminA = randomUUID();
        const adminB = randomUUID();
        const areaA = randomUUID();
        const areaB = randomUUID();

        const cabecalho = (userId: string, orgId: string) => ({
            Cookie: cookieDeAdmin(userId),
            'x-organizacao-id': orgId,
        });

        try {
            await connection('organizacoes').insert([
                { id: orgA, nome: 'QA API Criptografia A', ativo: true },
                { id: orgB, nome: 'QA API Criptografia B', ativo: true },
            ]);
            await connection('usuarios').insert([
                {
                    id: adminA,
                    nome: 'Admin CPF A',
                    email: `qa-cpf-${adminA}@example.invalid`,
                    senha_hash: 'teste-sem-login',
                    ativo: true,
                },
                {
                    id: adminB,
                    nome: 'Admin CPF B',
                    email: `qa-cpf-${adminB}@example.invalid`,
                    senha_hash: 'teste-sem-login',
                    ativo: true,
                },
            ]);
            await connection('usuarios_organizacoes').insert([
                { usuario_id: adminA, organizacao_id: orgA, perfil: 'ADMINISTRADOR', ativo: true },
                { usuario_id: adminB, organizacao_id: orgB, perfil: 'ADMINISTRADOR', ativo: true },
            ]);
            await connection('areas_negocio').insert([
                { id: areaA, organizacao_id: orgA, nome: 'QA CPF A', codigo: 'CPF-' + areaA, ativo: true },
                { id: areaB, organizacao_id: orgB, nome: 'QA CPF B', codigo: 'CPF-' + areaB, ativo: true },
            ]);

            const primeiro = await request(app)
                .post('/api/v1/clientes')
                .set(cabecalho(adminA, orgA))
                .send({ nome: 'Cliente API QA', cpf: '529.982.247-25', areas: [areaA] });
            assert.equal(primeiro.status, 201, JSON.stringify(primeiro.body));
            const clienteId = primeiro.body.data.id as string;
            assert.equal(primeiro.body.data.cpf, '52998224725');
            assert.equal('cpf_cifrado' in primeiro.body.data, false);
            assert.equal('cpf_indice' in primeiro.body.data, false);

            const registro = await connection('clientes')
                .where({ id: clienteId, organizacao_id: orgA }).first();
            assert.equal(registro.cpf, null);
            assert.ok(registro.cpf_cifrado);
            assert.match(registro.cpf_indice, /^[a-f\d]{64}$/);

            const detalhe = await request(app)
                .get('/api/v1/clientes/' + clienteId)
                .set(cabecalho(adminA, orgA));
            assert.equal(detalhe.status, 200, JSON.stringify(detalhe.body));
            assert.equal(detalhe.body.data.cpf, '52998224725');
            assert.equal('cpf_cifrado' in detalhe.body.data, false);
            assert.equal('cpf_indice' in detalhe.body.data, false);

            const lista = await request(app)
                .get('/api/v1/clientes')
                .query({ busca: '52998224725' })
                .set(cabecalho(adminA, orgA));
            assert.equal(lista.status, 200, JSON.stringify(lista.body));
            assert.equal(lista.body.data.length, 1);
            assert.equal(lista.body.data[0].id, clienteId);
            assert.equal('cpf_indice' in lista.body.data[0], false);

            const repetido = await request(app)
                .post('/api/v1/clientes')
                .set(cabecalho(adminA, orgA))
                .send({ nome: 'Cliente Duplicado QA', cpf: '52998224725', areas: [areaA] });
            assert.equal(repetido.status, 409, JSON.stringify(repetido.body));
            assert.equal(repetido.body.codigo, 'CLIENTE_CPF_JA_CADASTRADO');

            const outroTenant = await request(app)
                .post('/api/v1/clientes')
                .set(cabecalho(adminB, orgB))
                .send({ nome: 'Cliente Outra Org QA', cpf: '52998224725', areas: [areaB] });
            assert.equal(outroTenant.status, 201, JSON.stringify(outroTenant.body));

            const acessoCruzado = await request(app)
                .get('/api/v1/clientes/' + clienteId)
                .set(cabecalho(adminB, orgB));
            assert.equal(acessoCruzado.status, 404);

            const atualizacao = await request(app)
                .patch('/api/v1/clientes/' + clienteId)
                .set(cabecalho(adminA, orgA))
                .send({ cpf: '111.444.777-35' });
            assert.equal(atualizacao.status, 200, JSON.stringify(atualizacao.body));
            assert.equal(atualizacao.body.data.cpf, '11144477735');
            assert.equal('cpf_cifrado' in atualizacao.body.data, false);
            assert.equal('cpf_indice' in atualizacao.body.data, false);

            const atualizado = await connection('clientes').where('id', clienteId).first();
            assert.equal(atualizado.cpf, null);
            assert.notEqual(atualizado.cpf_indice, registro.cpf_indice);

            const invalidacao = await request(app)
                .post('/api/v1/clientes')
                .set(cabecalho(adminA, orgA))
                .send({ nome: 'CPF Invalido QA', cpf: '11111111111', areas: [areaA] });
            assert.equal(invalidacao.status, 400);
        } finally {
            await connection('registros_auditoria')
                .whereIn('organizacao_id', [orgA, orgB]).del();
            const ids = (await connection('clientes')
                .whereIn('organizacao_id', [orgA, orgB]).select('id'))
                .map((item) => item.id as string);
            if (ids.length > 0) {
                await connection('tarefas_mensagem').whereIn('cliente_id', ids).del();
                await connection('clientes_areas').whereIn('cliente_id', ids).del();
                await connection('clientes').whereIn('id', ids).del();
            }
            await connection('usuarios_organizacoes')
                .whereIn('usuario_id', [adminA, adminB]).del();
            await connection('areas_negocio').whereIn('id', [areaA, areaB]).del();
            await connection('usuarios').whereIn('id', [adminA, adminB]).del();
            await connection('organizacoes').whereIn('id', [orgA, orgB]).del();
        }
    },
);
