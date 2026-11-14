import assert from 'node:assert/strict';
import test from 'node:test';

import {
    avaliarPrivilégiosPostgres,
    classificarFalhaTls,
    selecionarAlvoDiagnostico,
    type PrivilegeSnapshot,
} from '../../src/diagnostics/clinical-operations.js';

const urlTeste = 'postgresql://runtime:secret@ep-test-123.neon.tech/testdb?sslmode=require';

const ambienteTeste: NodeJS.ProcessEnv = {
    AMBIENTE_BANCO: 'teste',
    DATABASE_URL_TEST: urlTeste,
};

function snapshotSeguro(overrides: Partial<PrivilegeSnapshot> = {}): PrivilegeSnapshot {
    return {
        connectedRole: 'runtime_clinico',
        sessionRole: 'runtime_clinico',
        isSuperuser: false,
        canCreateRole: false,
        canBypassRls: false,
        canReplicate: false,
        canCreateDatabase: false,
        canUseSchema: true,
        canCreateSchema: false,
        tableExists: true,
        tableOwner: 'migrations_owner',
        ownsTable: false,
        canSetTableOwner: false,
        canSelectHistory: true,
        canInsertHistory: true,
        canUpdateHistory: false,
        canDeleteHistory: false,
        canTruncateHistory: false,
        functionExists: true,
        functionOwner: 'migrations_owner',
        ownsFunction: false,
        canSetFunctionOwner: false,
        migrationsRoleIdentified: true,
        isMigrationsMember: false,
        triggers: [
            { name: 'tg_bloquear_alteracao_historico_correcoes', enabled: 'O' },
            { name: 'tg_bloquear_truncate_historico_correcoes', enabled: 'O' },
        ],
        ...overrides,
    };
}

test('diagnóstico PostgreSQL exige alvo e confirmação explícitos', () => {
    assert.throws(() => selecionarAlvoDiagnostico([], ambienteTeste));
    assert.throws(() => selecionarAlvoDiagnostico(['--target=test'], ambienteTeste));
    assert.throws(() =>
        selecionarAlvoDiagnostico(['--target=production', '--confirm=production'], ambienteTeste),
    );

    assert.deepEqual(
        selecionarAlvoDiagnostico(['--target=test', '--confirm=test'], ambienteTeste),
        { ambiente: 'test', connectionString: urlTeste },
    );
});

test('diagnóstico não usa DATABASE_URL como fallback e bloqueia o mesmo endpoint operacional', () => {
    assert.throws(() =>
        selecionarAlvoDiagnostico(['--target=test', '--confirm=test'], {
            AMBIENTE_BANCO: 'teste',
            DATABASE_URL: urlTeste,
        }),
    );

    assert.throws(() =>
        selecionarAlvoDiagnostico(['--target=test', '--confirm=test'], {
            ...ambienteTeste,
            DATABASE_URL: 'postgres://outro:secret@ep-test-123.neon.tech/testdb',
        }),
    );
});

test('alvo remoto exige confirmação e identidade esperada sem incluir URL no erro', () => {
    const connectionString = 'postgresql://runtime:secret@ep-stage-123.neon.tech/clinic_stage';
    const vars: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        DIAGNOSTIC_DATABASE_URL: connectionString,
        DIAGNOSTIC_EXPECTED_HOST: 'ep-stage-123.neon.tech',
        DIAGNOSTIC_EXPECTED_DATABASE: 'clinic_stage',
    };

    assert.throws(
        () => selecionarAlvoDiagnostico(['--target=homologacao'], vars),
        (error: unknown) => error instanceof Error && !error.message.includes('secret'),
    );
    assert.equal(
        selecionarAlvoDiagnostico(['--target=homologacao', '--confirm=homologacao'], vars).ambiente,
        'homologacao',
    );
    assert.throws(() =>
        selecionarAlvoDiagnostico(['--target=homologacao', '--confirm=homologacao'], {
            ...vars,
            DIAGNOSTIC_EXPECTED_HOST: 'wrong-stage.neon.tech',
        }),
    );
    assert.throws(() =>
        selecionarAlvoDiagnostico(['--target=homologacao', '--confirm=homologacao'], {
            ...vars,
            DIAGNOSTIC_EXPECTED_DATABASE: 'clinic_prod',
        }),
    );
    assert.throws(() =>
        selecionarAlvoDiagnostico(['--target=homologacao', '--confirm=homologacao'], {
            ...vars,
            NODE_ENV: 'production',
        }),
    );
});

test('avalia privilégios mínimos e sinaliza capacidades perigosas', () => {
    const seguro = avaliarPrivilégiosPostgres('test', snapshotSeguro());
    assert.equal(seguro.estado, 'APROVADO');
    assert.equal(
        JSON.stringify(seguro).includes('postgresql://'),
        false,
        'o relatório não inclui a connection string',
    );

    const dono = avaliarPrivilégiosPostgres(
        'test',
        snapshotSeguro({
            ownsTable: true,
            canTruncateHistory: true,
            canCreateRole: true,
        }),
    );
    assert.equal(dono.estado, 'REPROVADO');
    assert.equal(
        dono.verificacoes.find((item) => item.id === 'capacidade_efetiva_de_alterar_protecao')
            ?.estado,
        'REPROVADO',
    );
    assert.equal(dono.verificacoes.find((item) => item.id === 'create_role')?.estado, 'REPROVADO');

    const incompleto = avaliarPrivilégiosPostgres(
        'test',
        snapshotSeguro({ migrationsRoleIdentified: false, isMigrationsMember: null }),
    );
    assert.equal(incompleto.estado, 'NÃO VERIFICADO');
});

test('trigger em modo replica não é considerado ativo para sessões normais', () => {
    const resultado = avaliarPrivilégiosPostgres(
        'test',
        snapshotSeguro({
            triggers: [
                { name: 'tg_bloquear_alteracao_historico_correcoes', enabled: 'R' },
                { name: 'tg_bloquear_truncate_historico_correcoes', enabled: 'O' },
            ],
        }),
    );

    assert.equal(
        resultado.verificacoes.find((item) => item.id === 'triggers_de_immutabilidade')?.estado,
        'REPROVADO',
    );
});

test('falhas de certificado ou hostname são reprovadas e erros de conexão ficam não verificados', () => {
    assert.deepEqual(classificarFalhaTls('ERR_TLS_CERT_ALTNAME_INVALID'), {
        estado: 'REPROVADO',
        categoria: 'certificado_ou_hostname_rejeitado',
    });
    assert.deepEqual(classificarFalhaTls('ETIMEDOUT'), {
        estado: 'NÃO VERIFICADO',
        categoria: 'handshake_nao_concluido',
    });
});
