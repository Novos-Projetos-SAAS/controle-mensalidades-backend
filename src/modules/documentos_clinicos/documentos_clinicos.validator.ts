import { z } from 'zod';
import AppError from '../../shared/errors/AppError.js';

const uuid = z.uuid();
const texto = z.string().trim().min(1).max(10000);
const opcional = z.string().trim().max(10000).optional().default('');

const anamnese = z.object({
    queixa_principal: texto,
    historia_condicao_atual: texto,
    antecedentes: opcional,
    medicamentos_alergias: opcional,
    limitacoes_funcionais: texto,
    objetivos_paciente: texto,
    avaliacao_inicial: texto,
}).strict();

const laudo = z.object({
    finalidade: texto,
    fundamentacao_avaliacao: texto,
    achados_funcionais: texto,
    diagnostico_fisioterapeutico: texto,
    conclusao: texto,
    recomendacoes: opcional,
}).strict();

const novo = z.discriminatedUnion('tipo', [
    z.object({
        tipo: z.literal('ANAMNESE'),
        cliente_id: uuid,
        conteudo: anamnese,
    }).strict(),
    z.object({
        tipo: z.literal('LAUDO'),
        cliente_id: uuid,
        conteudo: laudo,
    }).strict(),
]);

const revisao = z.object({
    conteudo: z.union([anamnese, laudo]),
    justificativa: z.string().trim().min(10).max(1000),
    ultima_versao_esperada: z.number().int().positive(),
    natureza: z.enum(['CORRECAO', 'ADENDO']),
}).strict();

const finalizar = z.object({
    ultima_versao_esperada: z.number().int().positive(),
}).strict();

export type NovoDocumentoClinico = z.infer<typeof novo>;
export type RevisaoDocumentoClinico = z.infer<typeof revisao>;
export type FinalizarDocumentoClinico = z.infer<typeof finalizar>;

function validar<T>(schema: z.ZodType<T>, valor: unknown): T {
    const resultado = schema.safeParse(valor);
    if (!resultado.success) {
        throw new AppError('Dados do documento clínico inválidos.', 400, 'DOCUMENTO_CLINICO_INVALIDO');
    }
    return resultado.data;
}

export function validarNovoDocumentoClinico(valor: unknown): NovoDocumentoClinico {
    return validar(novo, valor);
}

export function validarRevisaoDocumentoClinico(valor: unknown): RevisaoDocumentoClinico {
    return validar(revisao, valor);
}

export function validarFinalizacaoDocumentoClinico(valor: unknown): FinalizarDocumentoClinico {
    return validar(finalizar, valor);
}

export function validarDocumentoClinicoId(valor: unknown): string {
    return validar(uuid, valor);
}

export function validarClienteClinicoId(valor: unknown): string {
    return validar(uuid, valor);
}

export function validarConteudoParaTipo(tipo: 'ANAMNESE' | 'LAUDO', valor: unknown) {
    if (tipo === 'ANAMNESE') return validar(anamnese, valor);
    return validar(laudo, valor);
}
