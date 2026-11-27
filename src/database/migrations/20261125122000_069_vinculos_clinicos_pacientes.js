/**
 * Vinculo explicito entre paciente e fisioterapeuta responsavel na area.
 * Preparatorio: NAO publica API nem concede permissoes automaticamente.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
    await knex.schema.createTable('vinculos_clinicos_pacientes', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('organizacao_id').notNullable().references('id').inTable('organizacoes').onDelete('RESTRICT');
        table.uuid('area_negocio_id').notNullable().references('id').inTable('areas_negocio').onDelete('RESTRICT');
        table.uuid('cliente_id').notNullable().references('id').inTable('clientes').onDelete('RESTRICT');
        table.uuid('profissional_id').notNullable().references('id').inTable('profissionais').onDelete('RESTRICT');
        table.uuid('concedido_por_usuario_id').notNullable().references('id').inTable('usuarios').onDelete('RESTRICT');
        table.timestamp('concedido_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('revogado_em', { useTz: true });
        table.uuid('revogado_por_usuario_id').references('id').inTable('usuarios').onDelete('RESTRICT');
        table.text('motivo_revogacao');
        table.check(
            '(revogado_em IS NULL AND revogado_por_usuario_id IS NULL AND motivo_revogacao IS NULL) OR ' +
            '(revogado_em IS NOT NULL AND revogado_por_usuario_id IS NOT NULL AND length(btrim(motivo_revogacao)) >= 10)',
            [],
            'ck_vinculo_clinico_revogacao_completa',
        );
        table.check('revogado_em IS NULL OR revogado_em >= concedido_em', [], 'ck_vinculo_clinico_periodo');
        table.index(
            ['organizacao_id', 'area_negocio_id', 'profissional_id', 'cliente_id'],
            'idx_vinculo_clinico_escopo',
        );
    });

    await knex.raw(`
        CREATE UNIQUE INDEX uq_vinculo_clinico_ativo
            ON vinculos_clinicos_pacientes (organizacao_id, area_negocio_id, cliente_id, profissional_id)
            WHERE revogado_em IS NULL;

        CREATE FUNCTION validar_vinculo_clinico() RETURNS trigger
        LANGUAGE plpgsql AS $$
        DECLARE
            autor uuid;
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                IF OLD.revogado_em IS NOT NULL THEN
                    RAISE EXCEPTION 'Vinculo clinico ja revogado nao pode ser alterado';
                END IF;
                IF (
                    to_jsonb(NEW) - 'revogado_em' - 'revogado_por_usuario_id' - 'motivo_revogacao'
                ) IS DISTINCT FROM (
                    to_jsonb(OLD) - 'revogado_em' - 'revogado_por_usuario_id' - 'motivo_revogacao'
                ) THEN
                    RAISE EXCEPTION 'Somente revogacao do vinculo clinico e permitida';
                END IF;
                IF NEW.revogado_em IS NULL OR NEW.revogado_por_usuario_id IS NULL OR
                   length(btrim(coalesce(NEW.motivo_revogacao, ''))) < 10 THEN
                    RAISE EXCEPTION 'Revogacao clinica incompleta';
                END IF;
                autor := NEW.revogado_por_usuario_id;
            ELSE
                IF NEW.revogado_em IS NOT NULL OR NEW.revogado_por_usuario_id IS NOT NULL OR
                   NEW.motivo_revogacao IS NOT NULL THEN
                    RAISE EXCEPTION 'Novo vinculo clinico nao pode nascer revogado';
                END IF;
                autor := NEW.concedido_por_usuario_id;
                IF NOT EXISTS (
                    SELECT 1
                    FROM organizacoes o
                    JOIN areas_negocio a ON a.organizacao_id = o.id
                    JOIN clientes c ON c.organizacao_id = o.id
                    JOIN clientes_areas ca ON ca.cliente_id = c.id AND ca.area_negocio_id = a.id
                    JOIN profissionais p ON p.organizacao_id = o.id
                    JOIN profissionais_areas pa ON pa.profissional_id = p.id AND pa.area_negocio_id = a.id
                    WHERE o.id = NEW.organizacao_id
                      AND a.id = NEW.area_negocio_id
                      AND c.id = NEW.cliente_id
                      AND p.id = NEW.profissional_id
                      AND o.ativo AND a.ativo AND c.ativo AND ca.ativo AND p.ativo
                      AND pa.ativo AND pa.acesso_clinico_autorizado
                      AND o.deletado_em IS NULL AND a.deletado_em IS NULL
                      AND c.deletado_em IS NULL AND ca.deletado_em IS NULL
                      AND p.deletado_em IS NULL AND pa.deletado_em IS NULL
                ) THEN
                    RAISE EXCEPTION 'Escopo clinico inconsistente para vinculo';
                END IF;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM usuarios u
                JOIN usuarios_organizacoes uo ON uo.usuario_id = u.id
                JOIN organizacoes o ON o.id = uo.organizacao_id
                WHERE u.id = autor AND uo.organizacao_id = NEW.organizacao_id
                  AND u.ativo AND u.deletado_em IS NULL
                  AND uo.ativo AND uo.deletado_em IS NULL
                  AND uo.perfil = 'ADMINISTRADOR'
                  AND o.ativo AND o.deletado_em IS NULL
            ) THEN
                RAISE EXCEPTION 'Administrador da organizacao obrigatorio para vinculo clinico';
            END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER trg_validar_vinculo_clinico
            BEFORE INSERT OR UPDATE ON vinculos_clinicos_pacientes
            FOR EACH ROW EXECUTE FUNCTION validar_vinculo_clinico();

        CREATE FUNCTION impedir_exclusao_vinculo_clinico() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Historico de vinculos clinicos nao pode ser apagado';
        END;
        $$;
        CREATE TRIGGER trg_vinculo_clinico_sem_delete
            BEFORE DELETE ON vinculos_clinicos_pacientes
            FOR EACH ROW EXECUTE FUNCTION impedir_exclusao_vinculo_clinico();
        CREATE TRIGGER trg_vinculo_clinico_sem_truncate
            BEFORE TRUNCATE ON vinculos_clinicos_pacientes
            FOR EACH STATEMENT EXECUTE FUNCTION impedir_exclusao_vinculo_clinico();
    `);
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
    if (await knex('vinculos_clinicos_pacientes').first('id')) {
        throw new Error('Rollback bloqueado: existem vinculos clinicos (inclusive revogados).');
    }
    await knex.schema.dropTable('vinculos_clinicos_pacientes');
    await knex.raw(`
        DROP FUNCTION IF EXISTS validar_vinculo_clinico();
        DROP FUNCTION IF EXISTS impedir_exclusao_vinculo_clinico();
    `);
}
