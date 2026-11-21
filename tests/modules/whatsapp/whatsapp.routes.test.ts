import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { after, before } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import app from '../../../src/app.js';
import { env } from '../../../src/configuration/env.js';
import connection from '../../../src/database/connection.js';
import AppError from '../../../src/shared/errors/AppError.js';
import { ErroOnboardingMeta } from '../../../src/modules/whatsapp/whatsapp.onboarding.meta.js';
import whatsappRepository from '../../../src/modules/whatsapp/whatsapp.repository.js';
import whatsappOnboardingRepository from '../../../src/modules/whatsapp/whatsapp.onboarding.repository.js';
import { criarServicoOnboardingWhatsapp } from '../../../src/modules/whatsapp/whatsapp.onboarding.service.js';
import { criarCofreCredenciaisWhatsapp } from '../../../src/modules/whatsapp/whatsapp.credentials.js';

const ids = {
    organizacao: crypto.randomUUID(),
    outraOrganizacao: crypto.randomUUID(),
    area: crypto.randomUUID(),
    outraArea: crypto.randomUUID(),
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
    await connection('integracoes_whatsapp_onboarding')
        .whereIn('organizacao_id', [ids.organizacao, ids.outraOrganizacao])
        .del();
    await connection('registros_auditoria')
        .whereIn('organizacao_id', [ids.organizacao, ids.outraOrganizacao])
        .del();
    await connection('integracoes_whatsapp')
        .whereIn('organizacao_id', [ids.organizacao, ids.outraOrganizacao])
        .del();
    await connection('usuarios_organizacoes')
        .whereIn('usuario_id', [ids.admin, ids.operador])
        .del();
    await connection('areas_negocio').whereIn('id', [ids.area, ids.outraArea, ids.areaOutra]).del();
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
            id: ids.outraArea,
            organizacao_id: ids.organizacao,
            nome: 'Outra Área WhatsApp Teste',
            codigo: `WPP-${ids.outraArea.slice(0, 8)}`,
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

test('credencial Meta fica cifrada e só pode ser recuperada no escopo da integração', async () => {
    const integracao = await connection('integracoes_whatsapp')
        .where({ organizacao_id: ids.organizacao, area_negocio_id: ids.area })
        .first();
    assert.ok(integracao);

    const chaveAnterior = process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
    const chaveTeste = Buffer.alloc(32, 31).toString('base64');
    process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = chaveTeste;
    const token = 'token-privado-fixture-com-tamanho-suficiente';
    try {
        const retorno = await whatsappRepository.armazenarCredenciaisMeta(
            ids.organizacao,
            integracao.id,
            ids.admin,
            { accessToken: token },
            criarCofreCredenciaisWhatsapp(chaveTeste),
        );
        assert.equal('credencial_referencia' in retorno, false);
        assert.equal(JSON.stringify(retorno).includes(token), false);

        const persistida = await connection('integracoes_whatsapp')
            .where({ id: integracao.id })
            .first();
        assert.ok(persistida.credenciais_meta_criptografadas);
        assert.equal(persistida.credenciais_meta_criptografadas.includes(token), false);
        assert.equal(persistida.configuracao_criptografada, null);

        const contexto = {
            organizacaoId: ids.organizacao,
            areaNegocioId: ids.area,
            whatsappBusinessAccountId: 'waba-fixture',
            phoneNumberId: 'phone-fixture',
            numeroExibido: '+5511999999999',
            nomeNegocio: 'Orbe Teste',
            credencial: { referencia: `db-aesgcm:v1:${integracao.id}` },
        };
        assert.deepEqual(await whatsappRepository.obterCredenciaisMeta(contexto), {
            accessToken: token,
        });
        assert.equal(
            await whatsappRepository.obterCredenciaisMeta({
                ...contexto,
                organizacaoId: ids.outraOrganizacao,
            }),
            null,
        );
        const auditada = await connection('registros_auditoria')
            .where({ recurso_id: integracao.id, acao: 'WHATSAPP.CREDENCIAL_META_ARMAZENADA' })
            .first();
        assert.ok(auditada);
        assert.equal(JSON.stringify(auditada.dados_contexto).includes(token), false);
    } finally {
        if (chaveAnterior === undefined) delete process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
        else process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = chaveAnterior;
    }
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

test('repositório vincula state ao escopo, consome código uma vez e bloqueia ativos de outra organização', async () => {
    const agora = new Date();
    const expiraEm = new Date(agora.valueOf() + 60_000);
    const novoOnboarding = (organizacaoId: string, areaNegocioId: string, validade = expiraEm) =>
        whatsappOnboardingRepository.iniciar({
            organizacaoId,
            areaNegocioId,
            usuarioId: ids.admin,
            stateHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
            expiraEm: validade,
        });
    const consumir = async (
        onboarding: { correlacaoId: string },
        organizacaoId: string,
        areaNegocioId: string,
        codigo: string,
    ) => {
        const stateHash = await connection('integracoes_whatsapp_onboarding')
            .select('state_hash')
            .where({ id: onboarding.correlacaoId })
            .first()
            .then((row) => row.state_hash as string);
        await whatsappOnboardingRepository.consumirCallback({
            correlacaoId: onboarding.correlacaoId,
            organizacaoId,
            areaNegocioId,
            usuarioId: ids.admin,
            stateHash,
            codigoHash: crypto.createHash('sha256').update(codigo).digest('hex'),
            cancelado: false,
            agora,
        });
    };

    const expirado = await novoOnboarding(
        ids.organizacao,
        ids.area,
        new Date(agora.valueOf() - 1_000),
    );
    await assert.rejects(
        whatsappOnboardingRepository.consumirCallback({
            correlacaoId: expirado.correlacaoId,
            organizacaoId: ids.organizacao,
            areaNegocioId: ids.area,
            usuarioId: ids.admin,
            stateHash: await connection('integracoes_whatsapp_onboarding')
                .select('state_hash')
                .where({ id: expirado.correlacaoId })
                .first()
                .then((row) => row.state_hash as string),
            cancelado: false,
            codigoHash: 'a'.repeat(64),
            agora,
        }),
        (erro: unknown) => erro instanceof AppError && erro.statusCode === 410,
    );
    assert.equal(
        (
            await connection('integracoes_whatsapp_onboarding')
                .select('status')
                .where({ id: expirado.correlacaoId })
                .first()
        )?.status,
        'EXPIRADO',
    );

    const foraDoEscopo = await novoOnboarding(ids.organizacao, ids.area);
    const hashForaDoEscopo = await connection('integracoes_whatsapp_onboarding')
        .select('state_hash')
        .where({ id: foraDoEscopo.correlacaoId })
        .first()
        .then((row) => row.state_hash as string);
    await assert.rejects(
        whatsappOnboardingRepository.consumirCallback({
            correlacaoId: foraDoEscopo.correlacaoId,
            organizacaoId: ids.outraOrganizacao,
            areaNegocioId: ids.areaOutra,
            usuarioId: ids.admin,
            stateHash: hashForaDoEscopo,
            cancelado: false,
            codigoHash: 'b'.repeat(64),
            agora,
        }),
        (erro: unknown) => erro instanceof AppError && erro.statusCode === 404,
    );

    const primeiroCodigo = await novoOnboarding(ids.organizacao, ids.area);
    const segundoCodigo = await novoOnboarding(ids.organizacao, ids.area);
    const hashesCodigo = await connection('integracoes_whatsapp_onboarding')
        .select('id', 'state_hash')
        .whereIn('id', [primeiroCodigo.correlacaoId, segundoCodigo.correlacaoId]);
    const hashPorId = new Map(
        hashesCodigo.map((row) => [row.id as string, row.state_hash as string]),
    );
    const codigoHash = crypto.createHash('sha256').update('codigo-unico-fixture').digest('hex');
    for (const item of [primeiroCodigo, segundoCodigo]) {
        if (item.correlacaoId === segundoCodigo.correlacaoId) {
            await assert.rejects(
                whatsappOnboardingRepository.consumirCallback({
                    correlacaoId: item.correlacaoId,
                    organizacaoId: ids.organizacao,
                    areaNegocioId: ids.area,
                    usuarioId: ids.admin,
                    stateHash: hashPorId.get(item.correlacaoId)!,
                    codigoHash,
                    cancelado: false,
                    agora,
                }),
                (erro: unknown) =>
                    erro instanceof AppError && erro.code === 'CODIGO_AUTORIZACAO_REUTILIZADO',
            );
        } else {
            await whatsappOnboardingRepository.consumirCallback({
                correlacaoId: item.correlacaoId,
                organizacaoId: ids.organizacao,
                areaNegocioId: ids.area,
                usuarioId: ids.admin,
                stateHash: hashPorId.get(item.correlacaoId)!,
                codigoHash,
                cancelado: false,
                agora,
            });
        }
    }

    const chaveAnterior = process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
    const chaveTeste = Buffer.alloc(32, 43).toString('base64');
    process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = chaveTeste;
    try {
        const primeiroAtivo = await novoOnboarding(ids.organizacao, ids.area);
        await consumir(primeiroAtivo, ids.organizacao, ids.area, 'codigo-ativo-fixture');
        const ativos = {
            messagingAccountId: 'messaging-account-shared-fixture',
            whatsappAccountId: null,
            metaBusinessId: 'meta-business-fixture',
            phoneNumberId: 'phone-shared-fixture',
            numeroExibido: '+5511999999999',
            nomeNegocio: 'Orbe Fixture',
        };
        const registrar = (
            onboarding: { correlacaoId: string },
            organizacaoId: string,
            areaNegocioId: string,
            ativosMeta = ativos,
            accessToken = 'token-meta-comprido-suficiente-fixture',
        ) =>
            whatsappOnboardingRepository.registrarAutorizacao({
                escopo: {
                    correlacaoId: onboarding.correlacaoId,
                    organizacaoId,
                    areaNegocioId,
                },
                usuarioId: ids.admin,
                modo: 'CLOUD_API',
                ativos: ativosMeta,
                credenciais: { accessToken, expiresAt: null },
            });
        const primeiraAutorizacao = await registrar(primeiroAtivo, ids.organizacao, ids.area);
        const integracaoInicial = await connection('integracoes_whatsapp')
            .where({ organizacao_id: ids.organizacao, area_negocio_id: ids.area })
            .first();
        assert.ok(integracaoInicial);
        assert.equal(primeiraAutorizacao.integracaoId, integracaoInicial.id);

        const reautorizacao = await novoOnboarding(ids.organizacao, ids.area);
        await consumir(reautorizacao, ids.organizacao, ids.area, 'codigo-reautorizacao-fixture');
        const autorizacaoRepetida = await registrar(
            reautorizacao,
            ids.organizacao,
            ids.area,
            ativos,
            'token-atualizado-fixture-comprido',
        );
        assert.equal(autorizacaoRepetida.integracaoId, integracaoInicial.id);
        const integracoesDoNumero = await connection('integracoes_whatsapp').where({
            organizacao_id: ids.organizacao,
            area_negocio_id: ids.area,
            phone_number_id: ativos.phoneNumberId,
        });
        assert.equal(integracoesDoNumero.length, 1);
        const persistidaReautorizacao = integracoesDoNumero[0];
        assert.equal(persistidaReautorizacao.ativo, false);
        assert.equal(persistidaReautorizacao.ativada_em, null);
        assert.notEqual(persistidaReautorizacao.credenciais_meta_criptografadas, null);
        assert.equal(
            await whatsappRepository
                .obterCredenciaisMeta({
                    organizacaoId: ids.organizacao,
                    areaNegocioId: ids.area,
                    whatsappBusinessAccountId: ativos.messagingAccountId,
                    phoneNumberId: ativos.phoneNumberId,
                    numeroExibido: ativos.numeroExibido,
                    nomeNegocio: ativos.nomeNegocio,
                    credencial: { referencia: `db-aesgcm:v1:${integracaoInicial.id}` },
                })
                .then((credencial) => credencial?.accessToken),
            'token-atualizado-fixture-comprido',
        );
        const auditoriaReautorizacao = await connection('registros_auditoria')
            .where({
                recurso_id: integracaoInicial.id,
                acao: 'WHATSAPP.EMBEDDED_SIGNUP_REAUTORIZADO',
            })
            .orderBy('criado_em', 'desc')
            .first();
        assert.ok(auditoriaReautorizacao);
        assert.equal(auditoriaReautorizacao.dados_contexto.reautorizacao, true);
        assert.equal(
            JSON.stringify(auditoriaReautorizacao.dados_contexto).includes(
                'token-atualizado-fixture-comprido',
            ),
            false,
        );

        const novoOnboardingProcessando = async (codigo: string) => {
            const onboarding = await novoOnboarding(ids.organizacao, ids.area);
            await consumir(onboarding, ids.organizacao, ids.area, codigo);
            return onboarding;
        };
        const concorrentes = await Promise.all([
            novoOnboardingProcessando('codigo-concorrente-a-fixture'),
            novoOnboardingProcessando('codigo-concorrente-b-fixture'),
        ]);
        const resultadosConcorrentes = await Promise.all(
            concorrentes.map((onboarding, indice) =>
                registrar(
                    onboarding,
                    ids.organizacao,
                    ids.area,
                    ativos,
                    `token-concorrente-fixture-${indice}-comprido`,
                ),
            ),
        );
        assert.equal(resultadosConcorrentes[0]?.integracaoId, integracaoInicial.id);
        assert.equal(resultadosConcorrentes[1]?.integracaoId, integracaoInicial.id);
        assert.equal(
            await connection('integracoes_whatsapp')
                .where({
                    organizacao_id: ids.organizacao,
                    area_negocio_id: ids.area,
                    phone_number_id: ativos.phoneNumberId,
                })
                .count('* as total')
                .first()
                .then((row) => Number(row?.total)),
            1,
        );

        const outraArea = await novoOnboarding(ids.organizacao, ids.outraArea);
        await consumir(outraArea, ids.organizacao, ids.outraArea, 'codigo-outra-area-fixture');
        await assert.rejects(
            registrar(outraArea, ids.organizacao, ids.outraArea),
            (erro: unknown) =>
                erro instanceof AppError && erro.code === 'NUMERO_META_JA_VINCULADO_NA_ORGANIZACAO',
        );

        const segundoAtivo = await novoOnboarding(ids.outraOrganizacao, ids.areaOutra);
        await consumir(segundoAtivo, ids.outraOrganizacao, ids.areaOutra, 'codigo-outro-fixture');
        const autorizarAtivo = (overrides: Partial<typeof ativos>) =>
            registrar(segundoAtivo, ids.outraOrganizacao, ids.areaOutra, {
                ...ativos,
                ...overrides,
            });
        await assert.rejects(
            autorizarAtivo({ phoneNumberId: 'phone-distinto-fixture' }),
            (erro: unknown) =>
                erro instanceof AppError && erro.code === 'ATIVO_META_VINCULADO_OUTRA_ORGANIZACAO',
        );
        await assert.rejects(
            autorizarAtivo({ messagingAccountId: 'messaging-account-distinto-fixture' }),
            (erro: unknown) =>
                erro instanceof AppError && erro.code === 'ATIVO_META_VINCULADO_OUTRA_ORGANIZACAO',
        );

        const configuracaoPersistida = {
            organizacaoId: ids.organizacao,
            areaNegocioId: ids.area,
            whatsappBusinessAccountId: ativos.messagingAccountId,
            phoneNumberId: ativos.phoneNumberId,
            numeroExibido: ativos.numeroExibido,
            nomeNegocio: ativos.nomeNegocio,
            credencial: { referencia: `db-aesgcm:v1:${integracaoInicial.id}` },
        };
        const credencialAnterior =
            await whatsappRepository.obterCredenciaisMeta(configuracaoPersistida);
        assert.ok(credencialAnterior);
        const serviceComFalha = criarServicoOnboardingWhatsapp({
            repositorio: whatsappOnboardingRepository,
            gateway: {
                async trocarCodigo() {
                    throw new ErroOnboardingMeta('META_PERMISSAO_INSUFICIENTE');
                },
                async validarAtivos() {
                    return ativos;
                },
                async confirmarCoexistencia() {},
                async registrarNumero() {},
                async assinarWebhooks() {},
            },
            appId: 'app-id-fixture',
            configurationId: 'configuration-id-fixture',
            appSecret: 'app-secret-fixture',
            graphApiVersion: 'v27.0',
        });
        const iniciadoComFalha = await serviceComFalha.iniciar({
            organizacaoId: ids.organizacao,
            areaNegocioId: ids.area,
            usuarioId: ids.admin,
        });
        await assert.rejects(
            serviceComFalha.concluir(
                {
                    organizacaoId: ids.organizacao,
                    areaNegocioId: ids.area,
                    usuarioId: ids.admin,
                },
                {
                    resultado: 'AUTORIZADO',
                    correlacaoId: iniciadoComFalha.correlacaoId,
                    state: iniciadoComFalha.state,
                    codigo: 'codigo-falha-fixture-autorizacao',
                    wabaId: ativos.messagingAccountId,
                    phoneNumberId: ativos.phoneNumberId,
                    modoOnboarding: 'CLOUD_API',
                    registrationPin: '123456',
                },
            ),
            (erro: unknown) =>
                erro instanceof AppError && erro.code === 'META_PERMISSAO_INSUFICIENTE',
        );
        assert.deepEqual(
            await whatsappRepository.obterCredenciaisMeta(configuracaoPersistida),
            credencialAnterior,
        );
    } finally {
        if (chaveAnterior === undefined) delete process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY;
        else process.env.WHATSAPP_CREDENTIALS_ENCRYPTION_KEY = chaveAnterior;
    }
});
