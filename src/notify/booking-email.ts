import { DateTime } from "luxon";
import { config } from "../config";

// Plantillas de los correos de cita. HTML con estilos en línea y tablas (lo que entienden Gmail, Outlook y Apple Mail).
// Paleta Metamorfosis: burgundy, fucsia, naranja, rosado y crema.
const C = { burgundy: "#6A0D2F", fuchsia: "#C7237A", orange: "#FF7A3D", pink: "#F9B6C8", cream: "#FFF6F0", soft: "#FDE9E4", ink: "#3B0A1D", muted: "#7A4A5C" };
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

export interface BookingEmailData {
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  idNumber?: string | null;
  birthDate?: string | null;
  reason: string;
  modality: "VIDEO" | "IN_PERSON";
  psychologistName: string;
  timezone: string;
  sessionMinutes: number;
  /** Fechas de inicio de la cita (una, o varias si es una serie). */
  startsAt: Date[];
  /** «cada semana», «cada 2 semanas»… cuando es una serie automática. */
  seriesLabel?: string;
}

/** Texto de una sola línea para el asunto: sin saltos de línea ni etiquetas. */
const oneLine = (value: string) => value.replace(/[\r\n<>]+/g, " ").trim();
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const day = (d: Date, tz: string) => cap(DateTime.fromJSDate(d, { zone: tz }).setLocale("es").toFormat("cccc d 'de' LLLL 'de' yyyy"));
const time = (d: Date, tz: string) => DateTime.fromJSDate(d, { zone: tz }).setLocale("es").toFormat("h:mm a");
const placeOf = (tz: string) => (tz === "America/Panama" ? "hora de Panamá" : `hora de ${tz.split("/").pop()?.replace(/_/g, " ")}`);
const modeLabel = (m: BookingEmailData["modality"]) => (m === "IN_PERSON" ? "Presencial" : "Virtual (videollamada)");
const plural = (n: number) => (n === 1 ? "tu cita" : `tus ${n} citas`);

function dateRows(data: BookingEmailData) {
  return data.startsAt
    .map(
      (d, i) => `
      <tr>
        <td style="padding:0 0 10px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.soft};border-radius:16px;">
            <tr>
              <td width="64" style="padding:14px 0 14px 16px;" valign="middle">
                <div style="width:48px;height:48px;border-radius:24px;background:${C.orange};color:${C.burgundy};font:700 20px/48px ${FONT};text-align:center;">${DateTime.fromJSDate(d, { zone: data.timezone }).toFormat("d")}</div>
              </td>
              <td style="padding:14px 16px 14px 12px;font-family:${FONT};" valign="middle">
                <div style="font-size:16px;font-weight:700;color:${C.burgundy};">${esc(day(d, data.timezone))}</div>
                <div style="font-size:14px;color:${C.muted};margin-top:2px;">${esc(time(d, data.timezone))} · ${data.sessionMinutes} min · ${modeLabel(data.modality)}${data.startsAt.length > 1 ? ` · sesión ${i + 1}` : ""}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`,
    )
    .join("");
}

function shell(preheader: string, title: string, lead: string, body: string) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.cream};">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
      <tr><td style="background:${C.burgundy};border-radius:28px 28px 0 0;padding:34px 32px 30px 32px;font-family:${FONT};">
        <div style="font-size:20px;font-weight:700;color:#fff;">Espacio<span style="color:${C.pink};">Vital</span></div>
        <div style="height:4px;width:56px;background:${C.orange};border-radius:2px;margin:18px 0 20px 0;"></div>
        <div style="font-size:28px;line-height:1.15;font-weight:700;color:#fff;">${title}</div>
        <div style="font-size:15px;line-height:1.55;color:${C.pink};margin-top:12px;">${lead}</div>
      </td></tr>
      <tr><td style="background:#fff;padding:28px 32px 8px 32px;font-family:${FONT};color:${C.ink};">${body}</td></tr>
      <tr><td style="background:${C.fuchsia};border-radius:0 0 28px 28px;padding:20px 32px;font-family:${FONT};font-size:12px;line-height:1.6;color:#fff;">
        ${esc(config.mail.fromName)} · Psicología en La Chorrera y en línea para todo Panamá<br>
        <a href="${esc(config.mail.siteUrl)}" style="color:#fff;font-weight:700;">${esc(config.mail.siteUrl.replace(/^https?:\/\//, ""))}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const label = (text: string) => `<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.fuchsia};margin:0 0 8px 0;">${text}</div>`;
const section = (inner: string) => `<div style="margin:0 0 24px 0;">${inner}</div>`;

/** Correo para la persona que pidió la cita. */
export function patientEmail(data: BookingEmailData) {
  const n = data.startsAt.length;
  const series = data.seriesLabel ? ` (${data.seriesLabel})` : "";
  const subject = n === 1 ? `Recibimos tu solicitud de cita · ${day(data.startsAt[0], data.timezone)}` : `Recibimos tu solicitud de ${n} citas`;
  const body = [
    section(`<p style="margin:0;font-size:16px;line-height:1.6;">Hola <strong>${esc(data.patientName.split(" ")[0])}</strong>, gracias por agendar con ${esc(data.psychologistName)}. Estos son los detalles de ${plural(n)}${esc(series)}:</p>`),
    section(`${label(n === 1 ? "Tu cita" : "Tus citas")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dateRows(data)}</table><p style="margin:4px 0 0 0;font-size:12px;color:${C.muted};">Todas las horas en ${placeOf(data.timezone)}.</p>`),
    section(`${label("Motivo de la consulta")}<p style="margin:0;font-size:15px;line-height:1.6;background:${C.cream};border-radius:14px;padding:14px 16px;">${esc(data.reason).replace(/\n/g, "<br>")}</p>`),
    section(`${label("¿Qué sigue?")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.55;">
        <tr><td valign="top" style="padding:0 10px 8px 0;color:${C.orange};font-weight:700;">1</td><td style="padding-bottom:8px;">${esc(data.psychologistName)} revisará tu solicitud y te <strong>confirmará por correo o teléfono</strong>.</td></tr>
        <tr><td valign="top" style="padding:0 10px 8px 0;color:${C.orange};font-weight:700;">2</td><td style="padding-bottom:8px;">Al confirmar te indicará el precio de la sesión y los detalles de tu modalidad (${esc(modeLabel(data.modality).toLowerCase())}).</td></tr>
        <tr><td valign="top" style="padding:0 10px 0 0;color:${C.orange};font-weight:700;">3</td><td>Si necesitas cambiar algo, responde a este correo y te ayudamos.</td></tr>
      </table>`),
    section(`<p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">Este mensaje confirma que recibimos tu solicitud; la cita queda <strong>pendiente de confirmación</strong>. Tus datos son confidenciales.</p>`),
  ].join("");
  const html = shell(`Recibimos tu solicitud de cita con ${data.psychologistName}`, n === 1 ? "¡Recibimos tu solicitud!" : `¡Recibimos tus ${n} citas!`, "Pronto te confirmaremos la cita.", body);
  const text = [
    `Hola ${data.patientName.split(" ")[0]}, recibimos tu solicitud de cita con ${data.psychologistName}${series}.`,
    "",
    ...data.startsAt.map((d) => `• ${day(d, data.timezone)}, ${time(d, data.timezone)} (${data.sessionMinutes} min, ${modeLabel(data.modality)}, ${placeOf(data.timezone)})`),
    "",
    `Motivo: ${data.reason}`,
    "",
    `${data.psychologistName} te confirmará por correo o teléfono y te indicará el precio. Si necesitas cambiar algo, responde a este correo.`,
  ].join("\n");
  return { subject, html, text };
}

/** Aviso para la psicóloga: quién pidió la cita, cuándo y cómo contactarle. */
export function psychologistEmail(data: BookingEmailData) {
  const n = data.startsAt.length;
  const series = data.seriesLabel ? ` (${data.seriesLabel})` : "";
  const subject = n === 1 ? `Nueva cita: ${oneLine(data.patientName)} · ${day(data.startsAt[0], data.timezone)}, ${time(data.startsAt[0], data.timezone)}` : `Nuevas citas: ${oneLine(data.patientName)} · ${n} sesiones`;
  const phoneDigits = data.patientPhone.replace(/[^\d]/g, "");
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 12px 7px 0;font-size:13px;color:${C.muted};white-space:nowrap;" valign="top">${k}</td><td style="padding:7px 0;font-size:15px;font-weight:600;" valign="top">${v}</td></tr>`;
  const body = [
    section(`${label(n === 1 ? "Cita solicitada" : "Citas solicitadas" + series)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dateRows(data)}</table><p style="margin:4px 0 0 0;font-size:12px;color:${C.muted};">Horas en ${placeOf(data.timezone)}.</p>`),
    section(`${label("Datos de la persona")}<table role="presentation" cellpadding="0" cellspacing="0">
      ${row("Nombre", esc(data.patientName))}
      ${row("Correo", `<a href="mailto:${esc(data.patientEmail)}" style="color:${C.fuchsia};">${esc(data.patientEmail)}</a>`)}
      ${row("Modalidad", esc(modeLabel(data.modality)))}
      ${row("Teléfono", `<a href="tel:${esc(data.patientPhone)}" style="color:${C.fuchsia};">${esc(data.patientPhone)}</a>${phoneDigits ? ` · <a href="https://wa.me/${phoneDigits}" style="color:${C.fuchsia};">WhatsApp</a>` : ""}`)}
      ${data.idNumber ? row("Cédula", esc(data.idNumber)) : ""}
      ${data.birthDate ? row("Nacimiento", esc(data.birthDate)) : ""}
    </table>`),
    section(`${label("Motivo de la cita")}<p style="margin:0;font-size:15px;line-height:1.6;background:${C.cream};border-radius:14px;padding:14px 16px;">${esc(data.reason).replace(/\n/g, "<br>")}</p>`),
    section(`<a href="mailto:${esc(data.patientEmail)}?subject=${encodeURIComponent("Tu cita en EspacioVital")}" style="display:inline-block;background:${C.orange};color:${C.burgundy};font-weight:700;font-size:15px;text-decoration:none;padding:13px 24px;border-radius:999px;">Responder a ${esc(data.patientName.split(" ")[0])}</a>
      <p style="margin:14px 0 0 0;font-size:12px;color:${C.muted};">Confirma la cita desde tu panel de Florece. Puedes responder este correo para escribirle directamente.</p>`),
  ].join("");
  const html = shell(`${data.patientName} pidió ${n === 1 ? "una cita" : `${n} citas`}`, n === 1 ? "Nueva cita desde tu web" : `${n} citas nuevas desde tu web`, `${esc(data.patientName)} solicitó ${n === 1 ? "una cita" : `una serie de ${n} citas`}${esc(series)}.`, body);
  const text = [
    `Nueva solicitud desde tu web${series}:`,
    ...data.startsAt.map((d) => `• ${day(d, data.timezone)}, ${time(d, data.timezone)}`),
    "",
    `Nombre: ${data.patientName}`,
    `Correo: ${data.patientEmail}`,
    `Teléfono: ${data.patientPhone}`,
    `Modalidad: ${modeLabel(data.modality)}`,
    data.idNumber ? `Cédula: ${data.idNumber}` : "",
    `Motivo: ${data.reason}`,
    "",
    "Confírmala en tu panel de Florece.",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");
  return { subject, html, text };
}

// ───────── Correos nuevos del CRM: cita confirmada y cita cancelada ─────────

export interface ConfirmacionData extends BookingEmailData {
  /** Enlace de la videollamada (solo citas virtuales). */
  meetingUrl?: string | null;
  /** Precio ya formateado, p. ej. «$50.00». */
  price?: string | null;
}

/** Correo para la persona cuando su cita queda confirmada. */
export function confirmationEmail(data: ConfirmacionData) {
  const n = data.startsAt.length;
  const subject = `Tu cita está confirmada · ${day(data.startsAt[0], data.timezone)}, ${time(data.startsAt[0], data.timezone)}`;
  const link = data.modality === "VIDEO" && data.meetingUrl
    ? section(`${label("Tu enlace de videollamada")}<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;">Entra a la hora de tu cita con este botón. No necesitas instalar nada: funciona desde el navegador del celular o la computadora.</p>
      <a href="${esc(data.meetingUrl)}" style="display:inline-block;background:${C.orange};color:${C.burgundy};font-weight:700;font-size:15px;text-decoration:none;padding:13px 24px;border-radius:999px;">Entrar a la videollamada</a>
      <p style="margin:12px 0 0 0;font-size:12px;color:${C.muted};word-break:break-all;">${esc(data.meetingUrl)}</p>`)
    : "";
  const price = data.price ? section(`${label("Valor de la sesión")}<p style="margin:0;font-size:18px;font-weight:700;color:${C.burgundy};">${esc(data.price)}</p>`) : "";
  const body = [
    section(`<p style="margin:0;font-size:16px;line-height:1.6;">Hola <strong>${esc(data.patientName.split(" ")[0])}</strong>, ${esc(data.psychologistName)} <strong>confirmó</strong> ${plural(n)}. Te esperamos:</p>`),
    section(`${label(n === 1 ? "Tu cita" : "Tus citas")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dateRows(data)}</table><p style="margin:4px 0 0 0;font-size:12px;color:${C.muted};">Todas las horas en ${placeOf(data.timezone)}.</p>`),
    link,
    price,
    section(`<p style="margin:0;font-size:14px;line-height:1.6;color:${C.muted};">Si necesitas cambiar o cancelar la cita, responde a este correo con tiempo. ¡Gracias por tu confianza!</p>`),
  ].join("");
  const html = shell(`Tu cita con ${data.psychologistName} está confirmada`, "¡Tu cita está confirmada!", "Ya está todo listo para tu sesión.", body);
  const text = [
    `Hola ${data.patientName.split(" ")[0]}, ${data.psychologistName} confirmó ${plural(n)}:`,
    "",
    ...data.startsAt.map((d) => `• ${day(d, data.timezone)}, ${time(d, data.timezone)} (${data.sessionMinutes} min, ${modeLabel(data.modality)}, ${placeOf(data.timezone)})`),
    data.modality === "VIDEO" && data.meetingUrl ? `\nVideollamada: ${data.meetingUrl}` : "",
    data.price ? `Valor de la sesión: ${data.price}` : "",
    "",
    "Si necesitas cambiar o cancelar, responde a este correo.",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
  return { subject, html, text };
}

/** Correo para la persona cuando su cita se cancela. */
export function cancellationEmail(data: BookingEmailData, reason: string) {
  const subject = `Tu cita fue cancelada · ${day(data.startsAt[0], data.timezone)}`;
  const body = [
    section(`<p style="margin:0;font-size:16px;line-height:1.6;">Hola <strong>${esc(data.patientName.split(" ")[0])}</strong>, lamentamos avisarte que se canceló tu cita:</p>`),
    section(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${dateRows(data)}</table>`),
    section(`${label("Motivo")}<p style="margin:0;font-size:15px;line-height:1.6;background:${C.cream};border-radius:14px;padding:14px 16px;">${esc(reason).replace(/\n/g, "<br>")}</p>`),
    section(`<p style="margin:0;font-size:14px;line-height:1.6;color:${C.muted};">Puedes agendar otra cita cuando quieras desde <a href="${esc(config.mail.siteUrl)}/agendar" style="color:${C.fuchsia};font-weight:700;">${esc(config.mail.siteUrl.replace(/^https?:\/\//, ""))}/agendar</a> o respondiendo a este correo.</p>`),
  ].join("");
  const html = shell(`Se canceló tu cita con ${data.psychologistName}`, "Tu cita fue cancelada", "Te ayudamos a reagendar.", body);
  const text = [
    `Hola ${data.patientName.split(" ")[0]}, se canceló tu cita:`,
    ...data.startsAt.map((d) => `• ${day(d, data.timezone)}, ${time(d, data.timezone)}`),
    "",
    `Motivo: ${reason}`,
    "",
    `Puedes agendar otra en ${config.mail.siteUrl}/agendar o respondiendo a este correo.`,
  ].join("\n");
  return { subject, html, text };
}
