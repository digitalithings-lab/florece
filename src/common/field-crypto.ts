import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

// Cifrado de datos personales de las citas (AES-256-GCM).
// Se guarda "enc1:v1:iv:tag:texto". Los datos se cifran al escribir y se descifran al leer, así que el resto del
// sistema (y el CRM) ve el texto normal, pero en la base de datos solo queda texto cifrado.
// Los valores que aún están sin cifrar (citas anteriores) se siguen leyendo normal hasta que se cifren.

export const ENC_PREFIX = "enc1:";

// Campos de Appointment que se cifran. Los marcados "determinista" siempre dan el mismo texto cifrado para el mismo valor,
// para poder buscar por igualdad (por ejemplo, evitar dos citas activas con el mismo correo).
export const APPOINTMENT_FIELDS: Record<string, { deterministic?: boolean }> = {
  patientFullName: {},
  patientIdNumber: {},
  guestEmail: { deterministic: true },
  guestPhone: {},
  partnerFullName: {},
  partnerIdNumber: {},
  partnerEmail: {},
  partnerPhone: {},
  notesForPsychologist: {},
  cancelReason: {},
};

type KeySet = { enc: Buffer; mac: Buffer };
let keySets: KeySet[] | null = null;

const derive = (base: Buffer, info: string) => Buffer.from(hkdfSync("sha256", base, Buffer.alloc(0), info, 32));
const toKeySet = (raw: string | undefined): KeySet | null => {
  const base = Buffer.from(raw || "", "base64");
  return base.length === 32 ? { enc: derive(base, "florece/appointments/enc"), mac: derive(base, "florece/appointments/iv") } : null;
};

// Para cifrar se usa DATA_ENCRYPTION_KEY (32 bytes en base64) si existe; si no, una llave derivada de JOURNAL_ENCRYPTION_KEY.
// Para descifrar se prueban las dos: así se puede añadir DATA_ENCRYPTION_KEY después sin perder lo ya cifrado.
const getKeySets = (): KeySet[] => {
  if (keySets) return keySets;
  const list = [toKeySet(process.env.DATA_ENCRYPTION_KEY), toKeySet(process.env.JOURNAL_ENCRYPTION_KEY)].filter((k): k is KeySet => !!k);
  if (!list.length) throw new Error("Falta DATA_ENCRYPTION_KEY (o JOURNAL_ENCRYPTION_KEY) de 32 bytes en base64");
  return (keySets = list);
};

export const isEncrypted = (v: unknown): v is string => typeof v === "string" && v.startsWith(ENC_PREFIX);

export function encryptField(plain: string, deterministic = false): string {
  if (!plain || isEncrypted(plain)) return plain;
  const { enc, mac } = getKeySets()[0];
  const iv = deterministic ? createHmac("sha256", mac).update(plain, "utf8").digest().subarray(0, 12) : randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", enc, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ENC_PREFIX + ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value;
  const [, iv, tag, ct] = value.slice(ENC_PREFIX.length).split(":");
  for (const { enc } of getKeySets()) {
    try {
      const d = createDecipheriv("aes-256-gcm", enc, Buffer.from(iv, "base64"));
      d.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
    } catch { /* prueba la siguiente llave */ }
  }
  console.error("No se pudo descifrar un dato (¿cambió la llave de cifrado?)");
  return value;
}

const isPlainObject = (v: unknown): v is Record<string, any> =>
  typeof v === "object" && v !== null && Object.getPrototypeOf(v) === Object.prototype;

// Recorre el resultado de una consulta y descifra cualquier texto cifrado (también en relaciones anidadas).
export function decryptDeep<T>(value: T): T {
  if (typeof value === "string") return (isEncrypted(value) ? decryptField(value) : value) as T;
  if (Array.isArray(value)) { const arr = value as any[]; for (let i = 0; i < arr.length; i++) arr[i] = decryptDeep(arr[i]); return value; }
  if (isPlainObject(value)) { const obj = value as Record<string, any>; for (const k of Object.keys(obj)) obj[k] = decryptDeep(obj[k]); return value; }
  return value;
}

const encValue = (key: string, v: any) => {
  const spec = APPOINTMENT_FIELDS[key];
  if (typeof v === "string") return encryptField(v, spec.deterministic);
  if (isPlainObject(v) && typeof v.set === "string") return { ...v, set: encryptField(v.set, spec.deterministic) };
  return v;
};

// Cifra los campos de un objeto "data" (create / update).
export function encryptData<T>(data: T): T {
  if (Array.isArray(data)) return data.map(encryptData) as unknown as T;
  if (!isPlainObject(data)) return data;
  const out: Record<string, any> = { ...data };
  for (const k of Object.keys(out)) if (k in APPOINTMENT_FIELDS) out[k] = encValue(k, out[k]);
  return out as T;
}

// En filtros: una igualdad sobre un campo determinista busca tanto el texto cifrado como el antiguo sin cifrar.
export function encryptWhere<T>(where: T): T {
  if (Array.isArray(where)) return where.map(encryptWhere) as unknown as T;
  if (!isPlainObject(where)) return where;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(where)) {
    if (k in APPOINTMENT_FIELDS && APPOINTMENT_FIELDS[k].deterministic) {
      if (typeof v === "string") out[k] = { in: [v, encryptField(v, true)] };
      else if (isPlainObject(v) && typeof v.equals === "string") { const { equals, ...rest } = v; out[k] = { ...rest, in: [equals, encryptField(equals, true)] }; }
      else out[k] = v;
    } else if (k === "AND" || k === "OR" || k === "NOT") out[k] = encryptWhere(v);
    else out[k] = v;
  }
  return out as T;
}
