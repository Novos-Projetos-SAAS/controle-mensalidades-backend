import { Client } from 'pg';

import { normalizarSslConnectionString } from '../database/ssl-connection-string.js';
import {
    avaliarPrivilégiosPostgres,
    selecionarAlvoDiagnostico,
    type PrivilegeSnapshot,
    type TriggerProtection,
} from './clinical-operations.js';

const tabelaHistorico = 'historico_correcoes_sessoes_clinicas';
const funcaoProtecao = 'impedir_alteracao_historico_correcoes';

function exigirIdentificador(nome: string, valor: string): string {
    if (!/^[a-z_][a-z0-9_$]*$/.test(valor)) {
        throw new Error(`${nome} deve conter somente um identificador PostgreSQL simples.`);
    }

    return valor;
}

function booleano(value: unknown): boolean | null {
    return typeof value === 'boolean' ? value : null;
}

function texto(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

async function executar(): Promise<void> {
    const alvo = selecionarAlvoDiagnostico(process.argv.slice(2), process.env);
    const schema = exigirIdentificador(
        'DIAGNOSTIC_APP_SCHEMA',
        process.env.DIAGNOSTIC_APP_SCHEMA ?? 'public',
    );
    const roleMigrations = process.env.DIAGNOSTIC_MIGRATIONS_ROLE
        ? exigirIdentificador('DIAGNOSTIC_MIGRATIONS_ROLE', process.env.DIAGNOSTIC_MIGRATIONS_ROLE)
        : null;

    const client = new Client({
        connectionString: normalizarSslConnectionString(alvo.connectionString, true),
        connectionTimeoutMillis: 8000,
        statement_timeout: 8000,
    });

    let transacaoAberta = false;

    try {
        await client.connect();
        await client.query('BEGIN READ ONLY');
        transacaoAberta = true;

        const principal = await client.query<Record<string, unknown>>(
            `
                SELECT
                    current_user::text AS connected_role,
                    session_user::text AS session_role,
                    current_setting('server_version_num')::integer AS server_version_num,
                    role_atual.rolsuper AS is_superuser,
                    role_atual.rolcreaterole AS can_create_role,
                    role_atual.rolbypassrls AS can_bypass_rls,
                    role_atual.rolreplication AS can_replicate,
                    to_regnamespace($1)::oid IS NOT NULL AS schema_exists,
                    has_schema_privilege(current_user, to_regnamespace($1), 'USAGE') AS can_use_schema,
                    has_schema_privilege(current_user, to_regnamespace($1), 'CREATE') AS can_create_schema,
                    has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database,
                    tabela.oid IS NOT NULL AS table_exists,
                    role_tabela.rolname::text AS table_owner,
                    CASE WHEN tabela.oid IS NULL THEN NULL ELSE role_tabela.oid = role_atual.oid END AS owns_table,
                    CASE
                        WHEN tabela.oid IS NULL OR role_tabela.oid IS NULL THEN NULL
                        WHEN current_setting('server_version_num')::integer >= 160000
                            THEN pg_has_role(current_user, role_tabela.oid, 'SET')
                        ELSE pg_has_role(current_user, role_tabela.oid, 'MEMBER')
                    END AS can_set_table_owner,
                    CASE WHEN tabela.oid IS NULL THEN NULL
                        ELSE has_table_privilege(current_user, tabela.oid, 'SELECT') END AS can_select_history,
                    CASE WHEN tabela.oid IS NULL THEN NULL
                        ELSE has_table_privilege(current_user, tabela.oid, 'INSERT') END AS can_insert_history,
                    CASE WHEN tabela.oid IS NULL THEN NULL ELSE (
                        has_table_privilege(current_user, tabela.oid, 'UPDATE') OR EXISTS (
                            SELECT 1
                            FROM pg_attribute AS coluna
                            WHERE coluna.attrelid = tabela.oid
                              AND coluna.attnum > 0
                              AND NOT coluna.attisdropped
                              AND has_column_privilege(current_user, tabela.oid, coluna.attnum, 'UPDATE')
                        )
                    ) END AS can_update_history,
                    CASE WHEN tabela.oid IS NULL THEN NULL
                        ELSE has_table_privilege(current_user, tabela.oid, 'DELETE') END AS can_delete_history,
                    CASE WHEN tabela.oid IS NULL THEN NULL
                        ELSE has_table_privilege(current_user, tabela.oid, 'TRUNCATE') END AS can_truncate_history,
                    funcao.oid IS NOT NULL AS function_exists,
                    role_funcao.rolname::text AS function_owner,
                    CASE WHEN funcao.oid IS NULL THEN NULL ELSE role_funcao.oid = role_atual.oid END AS owns_function,
                    CASE
                        WHEN funcao.oid IS NULL OR role_funcao.oid IS NULL THEN NULL
                        WHEN current_setting('server_version_num')::integer >= 160000
                            THEN pg_has_role(current_user, role_funcao.oid, 'SET')
                        ELSE pg_has_role(current_user, role_funcao.oid, 'MEMBER')
                    END AS can_set_function_owner,
                    role_migrations.oid IS NOT NULL AS migrations_role_identified,
                    CASE WHEN role_migrations.oid IS NULL THEN NULL
                        ELSE pg_has_role(current_user, role_migrations.oid, 'MEMBER') END AS is_migrations_member
                FROM pg_roles AS role_atual
                LEFT JOIN pg_class AS tabela
                    ON tabela.oid = to_regclass(format('%I.%I', $1::text, $2::text))
                LEFT JOIN pg_roles AS role_tabela ON role_tabela.oid = tabela.relowner
                LEFT JOIN LATERAL (
                    SELECT p.oid, p.proowner
                    FROM pg_proc AS p
                    JOIN pg_namespace AS n ON n.oid = p.pronamespace
                    WHERE n.nspname = $1
                      AND p.proname = $3
                      AND p.pronargs = 0
                    ORDER BY p.oid
                    LIMIT 1
                ) AS funcao ON true
                LEFT JOIN pg_roles AS role_funcao ON role_funcao.oid = funcao.proowner
                LEFT JOIN pg_roles AS role_migrations ON role_migrations.rolname = $4
                WHERE role_atual.rolname = current_user
            `,
            [schema, tabelaHistorico, funcaoProtecao, roleMigrations],
        );

        const linha = principal.rows[0];
        if (!linha) {
            throw new Error('A consulta de identidade não retornou resultado.');
        }

        const triggersResult = await client.query<{ tgname: string; tgenabled: string }>(
            `
                SELECT t.tgname, t.tgenabled::text
                FROM pg_trigger AS t
                JOIN pg_class AS c ON c.oid = t.tgrelid
                JOIN pg_namespace AS n ON n.oid = c.relnamespace
                WHERE n.nspname = $1
                  AND c.relname = $2
                  AND t.tgname = ANY($3::text[])
                  AND NOT t.tgisinternal
            `,
            [
                schema,
                tabelaHistorico,
                [
                    'tg_bloquear_alteracao_historico_correcoes',
                    'tg_bloquear_truncate_historico_correcoes',
                ],
            ],
        );

        await client.query('COMMIT');
        transacaoAberta = false;

        const triggers: TriggerProtection[] = triggersResult.rows.flatMap((trigger) =>
            ['O', 'A', 'R', 'D'].includes(trigger.tgenabled)
                ? [
                      {
                          name: trigger.tgname,
                          enabled: trigger.tgenabled as TriggerProtection['enabled'],
                      },
                  ]
                : [],
        );

        const snapshot: PrivilegeSnapshot = {
            connectedRole: texto(linha.connected_role),
            sessionRole: texto(linha.session_role),
            isSuperuser: booleano(linha.is_superuser),
            canCreateRole: booleano(linha.can_create_role),
            canBypassRls: booleano(linha.can_bypass_rls),
            canReplicate: booleano(linha.can_replicate),
            canCreateDatabase: booleano(linha.can_create_database),
            canUseSchema: booleano(linha.schema_exists) ? booleano(linha.can_use_schema) : null,
            canCreateSchema: booleano(linha.schema_exists)
                ? booleano(linha.can_create_schema)
                : null,
            tableExists: booleano(linha.table_exists) ?? false,
            tableOwner: texto(linha.table_owner),
            ownsTable: booleano(linha.owns_table),
            canSetTableOwner: booleano(linha.can_set_table_owner),
            canSelectHistory: booleano(linha.can_select_history),
            canInsertHistory: booleano(linha.can_insert_history),
            canUpdateHistory: booleano(linha.can_update_history),
            canDeleteHistory: booleano(linha.can_delete_history),
            canTruncateHistory: booleano(linha.can_truncate_history),
            functionExists: booleano(linha.function_exists) ?? false,
            functionOwner: texto(linha.function_owner),
            ownsFunction: booleano(linha.owns_function),
            canSetFunctionOwner: booleano(linha.can_set_function_owner),
            migrationsRoleIdentified: booleano(linha.migrations_role_identified) ?? false,
            isMigrationsMember: booleano(linha.is_migrations_member),
            triggers,
        };

        const resultado = avaliarPrivilégiosPostgres(alvo.ambiente, snapshot);
        console.log(JSON.stringify(resultado, null, 2));
    } catch {
        console.log(
            JSON.stringify(
                {
                    ambiente: alvo.ambiente,
                    estado: 'NÃO VERIFICADO',
                    verificacoes: [
                        {
                            id: 'diagnostico_postgres',
                            estado: 'NÃO VERIFICADO',
                            evidencia: {
                                erro: 'conexao_ou_consulta_nao_concluida',
                                urlOuDetalhesOmitidos: true,
                            },
                        },
                    ],
                },
                null,
                2,
            ),
        );
    } finally {
        if (transacaoAberta) {
            await client.query('ROLLBACK').catch(() => undefined);
        }
        await client.end().catch(() => undefined);
    }
}

await executar();
