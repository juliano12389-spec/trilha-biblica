const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formata um valor inteiro em centavos como BRL, ex.: 4850 -> "R$ 48,50". */
export const formatBRL = (cents) => brl.format(cents / 100);

/** Converte os dígitos digitados em uma máscara BRL para centavos: "4850" -> 4850. */
export const inputToCents = (text) => Number(text.replace(/\D/g, '') || 0);

/** Converte centavos para o texto do campo BRL, sem o símbolo: 4850 -> "48,50". */
export const centsToInput = (cents) => (cents / 100).toFixed(2).replace('.', ',');
