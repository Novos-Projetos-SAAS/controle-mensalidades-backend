import assert from 'node:assert/strict';
import test from 'node:test';

import { validarDestinoProntuarioDesenv } from '../../src/diagnostics/migrar-prontuario-desenv.js';

const certo = {
    NODE_ENV: 'development',
    AMBIENTE_BANCO: 'desenv',
    DB_SSL: 'true',
    CLINICAL_DESENV_MIGRATION_CONFIRMATION: 'APLICAR_PRONTUARIO_SOMENTE_DESENV',
};
const host = 'ep-lively-wildflower-ac3t3qcu.sa-east-1.aws.neon.tech';
const destino = `postgresql://usuario:senha@${host}/neondb?sslmode=require`;

test('migração do prontuário aceita exclusivamente conexão direta com Neon desenv', () => {
    const url = validarDestinoProntuarioDesenv(certo, destino);
    assert.equal(url.hostname, host);
    assert.equal(url.pathname, '/neondb');
});

test('migração do prontuário recusa hosts de outros projetos/branches Neon', () => {
    for (const url of [
        'postgresql://u:p@ep-calm-leaf-acrljc08.sa-east-1.aws.neon.tech/neondb',
        'postgresql://u:p@ep-lively-wildflower-ac3t3qcu-pooler.sa-east-1.aws.neon.tech/neondb',
        'postgresql://u:p@localhost:5432/neondb',
        `postgresql://u:p@${host}/outro_banco`,
        `http://u:p@${host}/neondb`,
    ]) assert.throws(() => validarDestinoProntuarioDesenv(certo, url), /Destino não autorizado/);
});

test('migração do prontuário recusa produção ou ausência de confirmação explícita', () => {
    for (const opts of [
        { ...certo, NODE_ENV: 'production' },
        { ...certo, AMBIENTE_BANCO: 'teste' },
        { ...certo, AMBIENTE_BANCO: 'homologacao' },
        { ...certo, DB_SSL: 'false' },
        { ...certo, CLINICAL_DESENV_MIGRATION_CONFIRMATION: undefined },
    ]) assert.throws(
        () => validarDestinoProntuarioDesenv(opts, destino),
        /Exigidos NODE_ENV/,
    );
    assert.throws(() => validarDestinoProntuarioDesenv(certo, undefined), /Exigidos NODE_ENV/);
});
