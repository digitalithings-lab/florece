// Limpieza de texto escrito por personas, para que nunca llegue a una página, un correo o un aviso como código.
// Se aplica en el servidor aunque el formulario ya lo valide: quien llama a la API directamente no pasa por el formulario.

/** Caracteres de control (menos salto de línea y tabulador), cero-anchos y marcas de dirección de texto que sirven para engañar. */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
/** Etiquetas HTML completas (<b>, </a>, <script …>, <!-- -->) y comentarios. */
const TAGS = /<\/?[a-zA-Z!][^>]*>|<!--[\s\S]*?-->/g;

/** Quita etiquetas, caracteres invisibles y signos < > sueltos. `multiline` conserva los saltos de línea. */
export function cleanText(value: string, multiline = false): string {
  let text = value.normalize("NFC").replace(INVISIBLE, "");
  // Se repite por si quedan etiquetas escondidas dentro de otras («<scr<b>ipt>»).
  for (let i = 0; i < 3 && TAGS.test(text); i++) text = text.replace(TAGS, "");
  text = text.replace(/[<>]/g, "");
  text = multiline ? text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : text.replace(/\s+/g, " ");
  return text.trim();
}

/** Para `@Transform`: limpia si es texto y deja pasar cualquier otra cosa (la validación la rechazará). */
export const cleaned =
  (multiline = false) =>
  ({ value }: { value: unknown }) =>
    typeof value === "string" ? cleanText(value, multiline) : value;
