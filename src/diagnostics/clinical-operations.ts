export type EstadoDiagnostico = 'APROVADO' | 'REPROVADO' | 'NÃO VERIFICADO';
export type AmbienteDiagnostico = 'test' | 'homologacao';

export type AlvoDiagnostico = {
    ambiente: AmbienteDiagnostico;
    connectionString: string;
};

export type VerificacaoDiagnostica = {
    id: string;
    estado: EstadoDiagnostico;
    evidencia: Record<string, boolean | string | null>;
};

export type ResultadoDiagnostico = {
    ambiente: AmbienteDiagnostico;
    estado: EstadoDiagnostico;
    verificacoes: VerificacaoDiagnostica[];
};

export type TriggerProtection = {
    name: string;
    enabled: 'O' | 'A' | 'R' | 'D';
};

export type PrivilegeSnapshot = {
    connectedRole: string | null;
    sessionRole: string | null;
    isSuperuser: boolean | null;
    canCreateRole: boolean | null;
    canBypassRls: boolean | null;
    canReplicate: boolean | null;
    canCreateDatabase: boolean | null;
    canUseSchema: boolean | null;
    canCreateSchema: boolean | null;
    tableExists: boolean;
    tableOwner: string | null;
    ownsTable: boolean | null;
    canSetTableOwner: boolean | null;
    canSelectHistory: boolean | null;
    canInsertHistory: boolean | null;
    canUpdateHistory: boolean | null;
    canDeleteHistory: boolean | null;
    canTruncateHistory: boolean | null;
    functionExists: boolean;
    functionOwner: string | null;
    ownsFunction: boolean | null;
    canSetFunctionOwner: boolean | null;
    migrationsRoleIdentified: boolean;
    isMigrationsMember: boolean | null;
    triggers: TriggerProtection[];
};

const nomesAlvos = new Set<AmbienteDiagnostico>(['test', 'homologacao']);
const triggersEsperados = [
    'tg_bloquear_alteracao_historico_correcoes',
    'tg_bloquear_truncate_historico_correcoes',
];

function lerOpcao(args: string[], nome: string): string | undefined {
    const prefixo = `--${nome}=`;
    const valores = args.filter((arg) => arg.startsWith(prefixo));

    if (valores.length > 1) {
        throw new Error(`A opção --${nome} deve aparecer uma única vez.`);
    }

    return valores[0]?.slice(prefixo.length);
}

function analisarUrlPostgres(value: string): URL {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        throw new Error('A URL de diagnóstico não está em formato PostgreSQL válido.');
    }

    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
        throw new Error('A URL de diagnóstico não é uma conexão PostgreSQL válida.');
    }

    return url;
}

function nomeBanco(url: URL): string {
    return decodeURIComponent(url.pathname.replace(/^\/+/, '')).split('/')[0] ?? '';
}

function pareceProducao(value: string): boolean {
    return /(^|[-_.])(prod|production|live)([-_.]|$)/i.test(value);
}

function mesmoEndpoint(a: URL, b: URL): boolean {
    return a.hostname.toLowerCase() === b.hostname.toLowerCase() && nomeBanco(a) === nomeBanco(b);
}

function exigirUrlDiferenteDeUrlsOperacionais(url: URL, vars: NodeJS.ProcessEnv): void {
    for (const valor of [vars.DATABASE_URL, vars.DATABASE_URL_MIGRATIONS]) {
        if (!valor) {
            continue;
        }

        let operacional: URL;
        try {
            operacional = analisarUrlPostgres(valor);
        } catch {
            continue;
        }

        if (mesmoEndpoint(url, operacional)) {
            throw new Error(
                'O diagnóstico foi bloqueado porque corresponde a um endpoint operacional.',
            );
        }
    }
}

export function selecionarAlvoDiagnostico(
    args: string[],
    vars: NodeJS.ProcessEnv,
): AlvoDiagnostico {
    if (vars.NODE_ENV === 'production') {
        throw new Error('Diagnósticos de operação são bloqueados quando NODE_ENV=production.');
    }

    const target = lerOpcao(args, 'target');
    const confirmation = lerOpcao(args, 'confirm');
    const opcoesPermitidas = new Set(['target', 'confirm']);

    if (args.some((arg) => ![...opcoesPermitidas].some((nome) => arg.startsWith(`--${nome}=`)))) {
        throw new Error(
            'Use somente --target e --confirm para selecionar o ambiente do diagnóstico.',
        );
    }

    if (!target || !nomesAlvos.has(target as AmbienteDiagnostico) || confirmation !== target) {
        throw new Error(
            'Selecione explicitamente test ou homologacao e confirme o mesmo ambiente.',
        );
    }

    if (target === 'test') {
        if (vars.AMBIENTE_BANCO !== 'teste' || !vars.DATABASE_URL_TEST) {
            throw new Error('O diagnóstico test exige AMBIENTE_BANCO=teste e DATABASE_URL_TEST.');
        }

        const url = analisarUrlPostgres(vars.DATABASE_URL_TEST);

        if (vars.DATABASE_URL) {
            try {
                if (mesmoEndpoint(url, analisarUrlPostgres(vars.DATABASE_URL))) {
                    throw new Error('O banco selecionado coincide com DATABASE_URL.');
                }
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message === 'O banco selecionado coincide com DATABASE_URL.'
                ) {
                    throw error;
                }
            }
        }

        exigirUrlDiferenteDeUrlsOperacionais(url, vars);

        if (pareceProducao(`${url.hostname} ${nomeBanco(url)}`)) {
            throw new Error(
                'O diagnóstico foi bloqueado porque o endpoint aparenta ser de produção.',
            );
        }

        return { ambiente: 'test', connectionString: vars.DATABASE_URL_TEST };
    }

    const connectionString = vars.DIAGNOSTIC_DATABASE_URL;
    const expectedHost = vars.DIAGNOSTIC_EXPECTED_HOST?.toLowerCase();
    const expectedDatabase = vars.DIAGNOSTIC_EXPECTED_DATABASE;

    if (!connectionString || !expectedHost || !expectedDatabase) {
        throw new Error(
            'Homologacao exige DIAGNOSTIC_DATABASE_URL e a confirmação do host e banco esperados.',
        );
    }

    const url = analisarUrlPostgres(connectionString);

    if (url.hostname.toLowerCase() !== expectedHost || nomeBanco(url) !== expectedDatabase) {
        throw new Error('O endpoint não corresponde à identificação aprovada para homologacao.');
    }

    if (
        pareceProducao(`${url.hostname} ${nomeBanco(url)}`) ||
        pareceProducao(`${expectedHost} ${expectedDatabase}`)
    ) {
        throw new Error('O diagnóstico foi bloqueado porque o endpoint aparenta ser de produção.');
    }

    exigirUrlDiferenteDeUrlsOperacionais(url, vars);

    return { ambiente: 'homologacao', connectionString };
}

function estadoBooleano(
    valor: boolean | null,
    esperado: boolean,
    evidenceKey: string,
): VerificacaoDiagnostica {
    return {
        id: evidenceKey,
        estado: valor === null ? 'NÃO VERIFICADO' : valor === esperado ? 'APROVADO' : 'REPROVADO',
        evidencia: { observado: valor },
    };
}

export function avaliarPrivilégiosPostgres(
    ambiente: AmbienteDiagnostico,
    snapshot: PrivilegeSnapshot,
): ResultadoDiagnostico {
    const verificacoes: VerificacaoDiagnostica[] = [
        {
            id: 'identidade_da_role',
            estado: snapshot.connectedRole ? 'APROVADO' : 'NÃO VERIFICADO',
            evidencia: {
                roleEfetiva: snapshot.connectedRole,
                roleDeSessao: snapshot.sessionRole,
            },
        },
        estadoBooleano(snapshot.isSuperuser, false, 'superuser'),
        estadoBooleano(snapshot.canCreateRole, false, 'create_role'),
        estadoBooleano(snapshot.canBypassRls, false, 'bypass_rls'),
        estadoBooleano(snapshot.canReplicate, false, 'replication'),
        estadoBooleano(snapshot.canUseSchema, true, 'uso_do_schema'),
        estadoBooleano(snapshot.canCreateSchema, false, 'create_no_schema'),
        estadoBooleano(snapshot.canCreateDatabase, false, 'create_no_banco'),
        {
            id: 'tabela_de_historico_encontrada',
            estado: snapshot.tableExists ? 'APROVADO' : 'NÃO VERIFICADO',
            evidencia: { existe: snapshot.tableExists },
        },
        {
            ...estadoBooleano(snapshot.ownsTable, false, 'proprietario_da_tabela_de_historico'),
            evidencia: {
                roleProprietaria: snapshot.tableOwner,
                roleConectadaEProprietaria: snapshot.ownsTable,
            },
        },
        estadoBooleano(snapshot.canSelectHistory, true, 'select_no_historico'),
        estadoBooleano(snapshot.canInsertHistory, true, 'insert_no_historico'),
        estadoBooleano(snapshot.canUpdateHistory, false, 'update_no_historico'),
        estadoBooleano(snapshot.canDeleteHistory, false, 'delete_no_historico'),
        estadoBooleano(snapshot.canTruncateHistory, false, 'truncate_no_historico'),
        {
            id: 'membro_da_role_de_migrations',
            estado: snapshot.migrationsRoleIdentified
                ? snapshot.isMigrationsMember === null
                    ? 'NÃO VERIFICADO'
                    : snapshot.isMigrationsMember
                      ? 'REPROVADO'
                      : 'APROVADO'
                : 'NÃO VERIFICADO',
            evidencia: {
                roleMigrationsIdentificada: snapshot.migrationsRoleIdentified,
                membro: snapshot.isMigrationsMember,
            },
        },
        {
            id: 'triggers_de_immutabilidade',
            estado: !snapshot.tableExists
                ? 'NÃO VERIFICADO'
                : triggersEsperados.every((name) =>
                        snapshot.triggers.some(
                            (trigger) =>
                                trigger.name === name &&
                                (trigger.enabled === 'O' || trigger.enabled === 'A'),
                        ),
                    )
                  ? 'APROVADO'
                  : 'REPROVADO',
            evidencia: Object.fromEntries(
                triggersEsperados.map((name) => [
                    name,
                    snapshot.triggers.find((trigger) => trigger.name === name)?.enabled ?? null,
                ]),
            ),
        },
    ];

    const capabilityKnown =
        snapshot.isSuperuser !== null &&
        snapshot.tableExists &&
        snapshot.ownsTable !== null &&
        snapshot.canSetTableOwner !== null &&
        snapshot.functionExists &&
        snapshot.ownsFunction !== null &&
        snapshot.canSetFunctionOwner !== null;
    const canAlterProtection = Boolean(
        snapshot.isSuperuser ||
        snapshot.ownsTable ||
        snapshot.canSetTableOwner ||
        snapshot.ownsFunction ||
        snapshot.canSetFunctionOwner ||
        snapshot.isMigrationsMember,
    );

    verificacoes.push({
        id: 'capacidade_efetiva_de_alterar_protecao',
        estado: canAlterProtection ? 'REPROVADO' : capabilityKnown ? 'APROVADO' : 'NÃO VERIFICADO',
        evidencia: {
            roleSuperuser: snapshot.isSuperuser,
            proprietariaDaTabela: snapshot.ownsTable,
            podeAssumirRoleProprietariaDaTabela: snapshot.canSetTableOwner,
            proprietariaDaFuncao: snapshot.ownsFunction,
            podeAssumirRoleProprietariaDaFuncao: snapshot.canSetFunctionOwner,
            membroDaRoleMigrations: snapshot.isMigrationsMember,
        },
    });

    const estado: EstadoDiagnostico = verificacoes.some((item) => item.estado === 'REPROVADO')
        ? 'REPROVADO'
        : verificacoes.some((item) => item.estado === 'NÃO VERIFICADO')
          ? 'NÃO VERIFICADO'
          : 'APROVADO';

    return { ambiente, estado, verificacoes };
}

const errosCertificado = new Set([
    'CERT_HAS_EXPIRED',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
]);

export function classificarFalhaTls(code: string | undefined): {
    estado: EstadoDiagnostico;
    categoria: string;
} {
    return errosCertificado.has(code ?? '')
        ? { estado: 'REPROVADO', categoria: 'certificado_ou_hostname_rejeitado' }
        : { estado: 'NÃO VERIFICADO', categoria: 'handshake_nao_concluido' };
}
