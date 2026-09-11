import connection from '../../database/connection.js';

export type OrganizacaoAtual = {
    id: string;
    nome: string;
    nome_fantasia: string | null;
    razao_social: string | null;
    cpf_cnpj: string | null;
    email: string | null;
    telefone: string | null;
    fuso_horario: string;
};

export type DadosAtualizacaoOrganizacao = {
    nome?: string;
    nome_fantasia?: string | null;
    razao_social?: string | null;
    cpf_cnpj?: string | null;
    email?: string | null;
    telefone?: string | null;
    fuso_horario?: string;
};

const camposOrganizacaoAtual = [
    'id',
    'nome',
    'nome_fantasia',
    'razao_social',
    'cpf_cnpj',
    'email',
    'telefone',
    'fuso_horario',
] as const;

class OrganizacoesRepository {
    async buscarAtual(organizacaoId: string): Promise<OrganizacaoAtual | undefined> {
        return connection<OrganizacaoAtual>('organizacoes')
            .select(...camposOrganizacaoAtual)
            .where('id', organizacaoId)
            .andWhere('ativo', true)
            .whereNull('deletado_em')
            .first();
    }

    async atualizarAtual(
        organizacaoId: string,
        dados: DadosAtualizacaoOrganizacao,
    ): Promise<OrganizacaoAtual | undefined> {
        const [organizacao] = await connection<OrganizacaoAtual>('organizacoes')
            .where('id', organizacaoId)
            .andWhere('ativo', true)
            .whereNull('deletado_em')
            .update(dados)
            .returning(camposOrganizacaoAtual);

        return organizacao;
    }
}

export default new OrganizacoesRepository();
