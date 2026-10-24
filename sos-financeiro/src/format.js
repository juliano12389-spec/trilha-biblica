const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Formats an integer amount of centavos as BRL, e.g. 4850 -> "R$ 48,50". */
export const formatBRL = (cents) => brl.format(cents / 100);

/** Turns the digits typed into a BRL mask into centavos: "4850" -> 4850. */
export const inputToCents = (text) => Number(text.replace(/\D/g, '') || 0);

/** Renders centavos as the bare BRL input text: 4850 -> "48,50". */
export const centsToInput = (cents) => (cents / 100).toFixed(2).replace('.', ',');
