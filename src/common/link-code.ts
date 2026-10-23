import { randomInt } from "node:crypto";

// Sin 0/O ni 1/I/L para que el código se pueda dictar sin confusiones.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateLinkCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `FLR-${code}`;
}

// Acepta el código con o sin guion, en minúsculas o con espacios.
export function normalizeLinkCode(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith("FLR") ? clean.slice(3) : clean;
  return `FLR-${body}`;
}
