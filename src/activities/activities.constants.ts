import { ActivityType } from "@prisma/client";

// Recompensas por actividad. Se pueden repetir sin límite, pero solo las primeras
// `dailyCap` del día dan premio, y las de tiempo deben durar al menos `minSeconds`.
export const REWARDS: Record<ActivityType, { water: number; seeds: number; dailyCap: number; minSeconds: number }> = {
  BREATHING: { water: 2, seeds: 5, dailyCap: 3, minSeconds: 60 },
  MEDITATION: { water: 3, seeds: 5, dailyCap: 2, minSeconds: 120 },
  BODY_SCAN: { water: 3, seeds: 5, dailyCap: 2, minSeconds: 120 },
  GRATITUDE: { water: 2, seeds: 5, dailyCap: 1, minSeconds: 0 },
  BUBBLES: { water: 1, seeds: 2, dailyCap: 3, minSeconds: 30 },
  ZEN_GARDEN: { water: 1, seeds: 2, dailyCap: 3, minSeconds: 30 },
  CONTENT: { water: 2, seeds: 5, dailyCap: 5, minSeconds: 0 },
};

export interface UnlockRule {
  key: string;
  itemSlug: string;
  type: ActivityType | "ANY";
  mode: "streak" | "total";
  target: number;
  description: string;
}

// Objetos exclusivos: no se compran, se ganan con constancia.
export const UNLOCKS: UnlockRule[] = [
  { key: "streak:BREATHING:3", itemSlug: "bufanda", type: ActivityType.BREATHING, mode: "streak", target: 3, description: "Respira 3 días seguidos" },
  { key: "streak:BREATHING:7", itemSlug: "loto-de-calma", type: ActivityType.BREATHING, mode: "streak", target: 7, description: "Respira 7 días seguidos" },
  { key: "streak:GRATITUDE:7", itemSlug: "trebol-de-gratitud", type: ActivityType.GRATITUDE, mode: "streak", target: 7, description: "Agradece 7 días seguidos" },
  { key: "streak:MEDITATION:5", itemSlug: "corona-de-flores", type: ActivityType.MEDITATION, mode: "streak", target: 5, description: "Medita 5 días seguidos" },
  { key: "total:ANY:30", itemSlug: "mariquita", type: "ANY", mode: "total", target: 30, description: "Completa 30 actividades" },
];

// Etapas de crecimiento de una planta según los riegos recibidos.
export const MAX_GROWTH = 5;
export function growthStage(growth: number): "sprout" | "bush" | "grown" {
  if (growth >= MAX_GROWTH) return "grown";
  if (growth >= 2) return "bush";
  return "sprout";
}
