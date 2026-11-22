/**
 * Confere apenas a consistência matemática do CPF (dígitos verificadores).
 * Não comprova que o documento foi emitido ou pertence a determinada pessoa.
 */
export function cpfValido(valor: string): boolean {
    const cpf = valor.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

    for (let tamanho = 9; tamanho <= 10; tamanho += 1) {
        let soma = 0;
        for (let indice = 0; indice < tamanho; indice += 1) {
            soma += Number(cpf[indice]) * (tamanho + 1 - indice);
        }
        const resto = (soma * 10) % 11;
        const verificador = resto === 10 ? 0 : resto;
        if (Number(cpf[tamanho]) !== verificador) return false;
    }
    return true;
}
