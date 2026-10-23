import { DateTime } from "luxon";

export interface WeeklyRule {
  weekday: number; // 0 = domingo … 6 = sábado
  startMinute: number;
  endMinute: number;
}

export interface BusyRange {
  startsAt: Date;
  endsAt: Date;
}

export interface DaySlots {
  date: string; // YYYY-MM-DD en la zona del psicólogo
  slots: { startsAt: string; endsAt: string; label: string }[];
}

// Minutos de descanso entre una sesión y la siguiente.
const BUFFER_MINUTES = 10;

// Horarios libres a partir del horario semanal, quitando bloqueos y citas ya ocupadas.
// Todo se calcula en la zona horaria del psicólogo y se devuelve en ISO (UTC).
export function freeSlots(params: {
  rules: WeeklyRule[];
  busy: BusyRange[];
  timezone: string;
  sessionMinutes: number;
  fromDate: string; // YYYY-MM-DD
  days: number;
  now?: Date;
  minNoticeHours: number;
}): DaySlots[] {
  const { rules, busy, timezone, sessionMinutes, fromDate, days, minNoticeHours } = params;
  const earliest = DateTime.fromJSDate(params.now ?? new Date()).plus({ hours: minNoticeHours });
  const firstDay = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
  const step = sessionMinutes + BUFFER_MINUTES;
  const result: DaySlots[] = [];

  for (let offset = 0; offset < days; offset++) {
    const day = firstDay.plus({ days: offset });
    const weekday = day.weekday % 7; // Luxon: 1 = lunes … 7 = domingo
    const dayRules = rules.filter((rule) => rule.weekday === weekday).sort((a, b) => a.startMinute - b.startMinute);
    const slots: DaySlots["slots"] = [];

    for (const rule of dayRules) {
      for (let minute = rule.startMinute; minute + sessionMinutes <= rule.endMinute; minute += step) {
        const start = day.plus({ minutes: minute });
        const end = start.plus({ minutes: sessionMinutes });
        if (start < earliest) continue;
        const overlaps = busy.some(
          (range) => start.toJSDate() < range.endsAt && end.toJSDate() > range.startsAt,
        );
        if (overlaps) continue;
        slots.push({ startsAt: start.toUTC().toISO()!, endsAt: end.toUTC().toISO()!, label: start.toFormat("HH:mm") });
      }
    }

    result.push({ date: day.toISODate()!, slots });
  }

  return result;
}

export function todayIn(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate()!;
}

export function minutesToLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
