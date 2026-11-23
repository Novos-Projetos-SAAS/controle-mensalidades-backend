/**
 * Estrutura preparatoria de anamnese e laudo de fisioterapia.
 * Somente persistencia: nenhuma rota clinica e publicada por esta migration.
 * As versoes sao append-only, com isolamento de referencias no banco.
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
    await knex.schema.createTable('registros_clinicos_documentais', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('organizacao_id').notNullable().references('id').inTable('organizacoes').onDelete('RESTRICT');
        table.uuid('area_negocio_id').notNullable().references('id').inTable('areas_negocio').onDelete('RESTRICT');
        table.uuid('cliente_id').notNullable().references('id').inTable('clientes').onDelete('RESTRICT');
        table.uuid('profissional_id').notNullable().references('id').inTable('profissionais').onDelete('RESTRICT');
        table.string('tipo', 20).notNullable();
        table.timestamp('criado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.check("tipo IN ('ANAMNESE', 'LAUDO')", [], 'ck_registro_documental_tipo');
        table.unique(['id', 'organizacao_id', 'area_negocio_id', 'cliente_id'], 'uq_registro_documental_escopo');
        table.index(['organizacao_id', 'area_negocio_id', 'cliente_id', 'criado_em'], 'idx_documentais_paciente');
    });

    await knex.schema.createTable('versoes_registros_clinicos', (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
        table.uuid('registro_id').notNullable().references('id').inTable('registros_clinicos_documentais').onDelete('RESTRICT');
        table.uuid('organizacao_id').notNullable();
        table.uuid('area_negocio_id').notNullable();
        table.uuid('cliente_id').notNullable();
        table.foreign(['registro_id', 'organizacao_id', 'area_negocio_id', 'cliente_id'], 'fk_versao_registro_escopo')
            .references(['id', 'organizacao_id', 'area_negocio_id', 'cliente_id'])
            .inTable('registros_clinicos_documentais').onDelete('RESTRICT');
        table.uuid('autor_usuario_id').notNullable().references('id').inTable('usuarios').onDelete('RESTRICT');
        table.integer('versao').notNullable();
        table.string('natureza', 16).notNullable();
        table.string('estado', 16).notNullable();
        table.jsonb('conteudo').notNullable();
        table.text('justificativa');
        table.timestamp('registrado_em', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.check('versao > 0', [], 'ck_versao_clinica_positiva');
        table.check("natureza IN ('INICIAL', 'CORRECAO', 'ADENDO')", [], 'ck_versao_clinica_natureza');
        table.check("estado IN ('RASCUNHO', 'FINALIZADO')", [], 'ck_versao_clinica_estado');
        table.check("jsonb_typeof(conteudo) = 'object'", [], 'ck_versao_clinica_conteudo');
        table.unique(['registro_id', 'versao'], 'uq_versoes_clinicas_numero');
        table.index(['organizacao_id', 'area_negocio_id', 'cliente_id', 'registrado_em'], 'idx_versoes_clinicas_timeline');
    });

    await knex.raw(`
        CREATE FUNCTION validar_registro_documental() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM clientes c
                JOIN clientes_areas ca ON ca.cliente_id = c.id
                JOIN areas_negocio a ON a.id = ca.area_negocio_id
                WHERE c.id = NEW.cliente_id
                  AND c.organizacao_id = NEW.organizacao_id
                  AND ca.area_negocio_id = NEW.area_negocio_id
                  AND a.organizacao_id = NEW.organizacao_id
            ) THEN
                RAISE EXCEPTION 'Escopo de paciente invalido para documento clinico';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM profissionais p
                JOIN profissionais_areas pa ON pa.profissional_id = p.id
                WHERE p.id = NEW.profissional_id
                  AND p.organizacao_id = NEW.organizacao_id
                  AND pa.area_negocio_id = NEW.area_negocio_id
            ) THEN
                RAISE EXCEPTION 'Escopo de profissional invalido para documento clinico';
            END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER trg_registro_documental_escopo
        BEFORE INSERT ON registros_clinicos_documentais
        FOR EACH ROW EXECUTE FUNCTION validar_registro_documental();

        CREATE FUNCTION validar_versao_documental() RETURNS trigger
        LANGUAGE plpgsql AS $$
        DECLARE
            registro RECORD;
            ultima RECORD;
        BEGIN
            SELECT r.id, p.usuario_id INTO registro
              FROM registros_clinicos_documentais r
              JOIN profissionais p ON p.id = r.profissional_id
             WHERE r.id = NEW.registro_id
             FOR UPDATE OF r;

            IF NOT FOUND OR registro.usuario_id IS DISTINCT FROM NEW.autor_usuario_id THEN
                RAISE EXCEPTION 'Autor nao corresponde ao profissional responsavel';
            END IF;

            SELECT v.versao, v.estado INTO ultima
              FROM versoes_registros_clinicos v
             WHERE v.registro_id = NEW.registro_id
             ORDER BY v.versao DESC LIMIT 1;

            IF NOT FOUND THEN
                IF NEW.versao <> 1 OR NEW.natureza <> 'INICIAL' THEN
                    RAISE EXCEPTION 'Primeira versao deve ser INICIAL e numero 1';
                END IF;
            ELSE
                IF NEW.versao <> ultima.versao + 1 OR NEW.natureza = 'INICIAL' THEN
                    RAISE EXCEPTION 'Numero ou natureza de versao invalido';
                END IF;
                IF ultima.estado = 'FINALIZADO' AND NEW.natureza <> 'ADENDO' THEN
                    RAISE EXCEPTION 'Documento finalizado so aceita adendos';
                END IF;
            END IF;
            RETURN NEW;
        END;
        $$;
        CREATE TRIGGER trg_validar_versao_documental
        BEFORE INSERT ON versoes_registros_clinicos
        FOR EACH ROW EXECUTE FUNCTION validar_versao_documental();

        CREATE FUNCTION impedir_alteracao_documental() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Registro clinico append-only: UPDATE, DELETE e TRUNCATE proibidos';
        END;
        $$;
        CREATE TRIGGER trg_documental_imutavel
        BEFORE UPDATE OR DELETE ON registros_clinicos_documentais
        FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_documental();
        CREATE TRIGGER trg_versao_documental_imutavel
        BEFORE UPDATE OR DELETE ON versoes_registros_clinicos
        FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_documental();
        CREATE TRIGGER trg_documental_sem_truncate
        BEFORE TRUNCATE ON registros_clinicos_documentais
        FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_documental();
        CREATE TRIGGER trg_versao_documental_sem_truncate
        BEFORE TRUNCATE ON versoes_registros_clinicos
        FOR EACH STATEMENT EXECUTE FUNCTION impedir_alteracao_documental();
    `);
}

/**
 * Desfaz somente esquema ainda vazio, para nunca apagar historico de pacientes.
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
    if (await knex('versoes_registros_clinicos').first('id') ||
        await knex('registros_clinicos_documentais').first('id')) {
        throw new Error('Rollback bloqueado: existem documentos clinicos ou versoes.');
    }

    await knex.schema.dropTable('versoes_registros_clinicos');
    await knex.schema.dropTable('registros_clinicos_documentais');
    await knex.raw(`
        DROP FUNCTION IF EXISTS validar_registro_documental();
        DROP FUNCTION IF EXISTS validar_versao_documental();
        DROP FUNCTION IF EXISTS impedir_alteracao_documental();
    `);
}
