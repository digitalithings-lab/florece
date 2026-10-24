// Opciones del avatar humano. La app usa exactamente estos mismos valores
// (app/src/lib/character.ts); si se agregan opciones, hay que añadirlas en ambos lados.

export const SKIN_TONES = ["#FDE3CF", "#F6CBA5", "#E8B48C", "#C98E62", "#A0673F", "#6E4426"];
export const HAIR_COLORS = ["#1F1A17", "#3B2A20", "#6B4428", "#A8743A", "#E3C07A", "#C2452D", "#9A9A9A", "#F2EEE6", "#7E5BD6", "#E98AA5"];
export const CLOTH_COLORS = [
  "#FFFFFF", "#2F2B26", "#4F8A5B", "#3E5C8A", "#6FA3DB", "#9F8BE0",
  "#E98AA5", "#C8553D", "#F2A65A", "#F6C453", "#8C6A4F", "#A9A9A9",
];

export const OPTIONS = {
  body: ["slim", "regular", "broad"],
  face: ["round", "oval", "square"],
  eyes: ["dots", "happy", "big", "sleepy", "wink"],
  brows: ["soft", "arched", "thick", "none"],
  mouth: ["smile", "grin", "neutral", "open"],
  hair: ["none", "buzz", "short", "side", "long", "bob", "curly", "bun", "ponytail", "afro"],
  top: ["tshirt", "longsleeve", "hoodie", "jacket", "dress"],
  bottom: ["pants", "shorts", "skirt"],
  shoes: ["sneakers", "boots", "sandals"],
} as const;

// Prendas que hay que comprar en la tienda (slug del objeto en la tabla items).
export const PAID_GARMENTS: Record<string, string> = {
  "top:hoodie": "ropa-sudadera",
  "top:jacket": "ropa-chaqueta",
  "top:dress": "ropa-vestido",
  "shoes:boots": "ropa-botas",
};

export interface CharacterLook {
  skin: string;
  body: string;
  face: string;
  eyes: string;
  brows: string;
  mouth: string;
  blush: boolean;
  hair: string;
  hairColor: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  shoesColor: string;
}

export const DEFAULT_LOOK: CharacterLook = {
  skin: "#F6CBA5",
  body: "regular",
  face: "round",
  eyes: "dots",
  brows: "soft",
  mouth: "smile",
  blush: true,
  hair: "short",
  hairColor: "#3B2A20",
  top: "tshirt",
  topColor: "#4F8A5B",
  bottom: "pants",
  bottomColor: "#3E5C8A",
  shoes: "sneakers",
  shoesColor: "#FFFFFF",
};
