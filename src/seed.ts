// Carga los catálogos iniciales (retos y preguntas guiadas). Es idempotente:
// se ejecuta en cada despliegue y solo crea o actualiza, nunca borra.
//
// Las líneas de ayuda en crisis (crisis_resources) NO se cargan aquí a propósito:
// deben añadirse por país y verificarse con un profesional antes del lanzamiento.
import { ChallengeCategory, EvidenceType, FocusArea, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const challenges = [
  {
    slug: "reconoce-tus-emociones",
    title: "Reconoce tus emociones",
    description: "Identifica qué sentiste hoy y qué lo provocó.",
    category: ChallengeCategory.SELF_KNOWLEDGE,
    evidenceType: EvidenceType.TEXT,
    focusAreas: [FocusArea.SELF_KNOWLEDGE, FocusArea.EMOTIONAL_REGULATION],
    seedsReward: 15,
    durationMinutes: 5,
  },
  {
    slug: "tres-pensamientos",
    title: "Tres pensamientos que te preocupan",
    description: "Identifica tres pensamientos que te generan preocupación.",
    category: ChallengeCategory.SELF_KNOWLEDGE,
    evidenceType: EvidenceType.TEXT,
    focusAreas: [FocusArea.ANXIETY, FocusArea.SELF_KNOWLEDGE],
    seedsReward: 15,
    durationMinutes: 5,
  },
  {
    slug: "lo-que-valoras-de-ti",
    title: "Lo que valoras de ti",
    description: "Escribe tres cualidades tuyas que aprecias.",
    category: ChallengeCategory.SELF_KNOWLEDGE,
    evidenceType: EvidenceType.TEXT,
    focusAreas: [FocusArea.SELF_ESTEEM],
    seedsReward: 15,
    durationMinutes: 5,
  },
  {
    slug: "como-te-sentiste",
    title: "¿Cómo te sentiste?",
    description: "Expresa en una nota de voz de 30 a 60 segundos cómo te sentiste durante una situación difícil.",
    category: ChallengeCategory.SELF_KNOWLEDGE,
    evidenceType: EvidenceType.AUDIO,
    focusAreas: [FocusArea.EMOTIONAL_REGULATION, FocusArea.SELF_KNOWLEDGE],
    seedsReward: 20,
    durationMinutes: 3,
  },
  {
    slug: "un-pensamiento-mas-amable",
    title: "Un pensamiento más amable",
    description: "Escribe una alternativa a un pensamiento autocrítico.",
    category: ChallengeCategory.EMOTIONAL_SKILLS,
    evidenceType: EvidenceType.TEXT,
    focusAreas: [FocusArea.SELF_ESTEEM, FocusArea.ANXIETY],
    seedsReward: 20,
    durationMinutes: 5,
  },
  {
    slug: "respiracion-consciente",
    title: "Respiración consciente",
    description: "Practica cuatro rondas de respiración cuadrada.",
    category: ChallengeCategory.EMOTIONAL_SKILLS,
    evidenceType: EvidenceType.INTERACTIVE,
    reflectionPrompt: "¿Qué observaste en ti después de realizarlo?",
    focusAreas: [FocusArea.ANXIETY, FocusArea.EMOTIONAL_REGULATION],
    seedsReward: 15,
    durationMinutes: 3,
  },
  {
    slug: "un-limite-sano",
    title: "Un límite sano",
    description:
      "Piensa en una situación en la que te gustaría decir que no. Escribe cómo podrías expresarlo con respeto.",
    category: ChallengeCategory.EMOTIONAL_SKILLS,
    evidenceType: EvidenceType.TEXT,
    focusAreas: [FocusArea.RELATIONSHIPS, FocusArea.SELF_ESTEEM],
    seedsReward: 20,
    durationMinutes: 5,
  },
  {
    slug: "aqui-y-ahora",
    title: "Aquí y ahora",
    description: "Practica el ejercicio 5-4-3-2-1 con tus sentidos.",
    category: ChallengeCategory.EMOTIONAL_SKILLS,
    evidenceType: EvidenceType.INTERACTIVE,
    reflectionPrompt: "¿Cómo te sientes ahora comparado con antes del ejercicio?",
    focusAreas: [FocusArea.ANXIETY, FocusArea.EMOTIONAL_REGULATION],
    seedsReward: 15,
    durationMinutes: 3,
  },
  {
    slug: "un-momento-para-ti",
    title: "Un momento para ti",
    description: "Realiza una pausa consciente de cinco minutos.",
    category: ChallengeCategory.SELF_CARE,
    evidenceType: EvidenceType.INTERACTIVE,
    reflectionPrompt: "¿Qué notaste durante la pausa?",
    focusAreas: [FocusArea.SELF_CARE],
    seedsReward: 10,
    durationMinutes: 5,
  },
  {
    slug: "algo-que-disfrutes",
    title: "Algo que disfrutes",
    description: "Realiza una actividad de autocuidado que disfrutes. Si quieres, comparte una foto.",
    category: ChallengeCategory.SELF_CARE,
    evidenceType: EvidenceType.PHOTO,
    reflectionPrompt: "¿Qué observaste en ti después de realizarla?",
    focusAreas: [FocusArea.SELF_CARE],
    seedsReward: 15,
    durationMinutes: 15,
  },
  {
    slug: "conecta-con-alguien",
    title: "Conecta con alguien",
    description: "Escribe o llama a una persona que te haga bien.",
    category: ChallengeCategory.SELF_CARE,
    evidenceType: EvidenceType.INTERACTIVE,
    reflectionPrompt: "¿Cómo te sentiste después de hablar con esa persona?",
    focusAreas: [FocusArea.RELATIONSHIPS, FocusArea.SELF_CARE],
    seedsReward: 15,
    durationMinutes: 10,
  },
  {
    slug: "descanso-sin-pantallas",
    title: "Descanso sin pantallas",
    description: "Pasa 15 minutos sin pantallas antes de dormir.",
    category: ChallengeCategory.SELF_CARE,
    evidenceType: EvidenceType.INTERACTIVE,
    reflectionPrompt: "¿Qué hiciste en ese tiempo y cómo dormiste?",
    focusAreas: [FocusArea.SELF_CARE, FocusArea.ANXIETY],
    seedsReward: 10,
    durationMinutes: 15,
  },
];

const journalPrompts: { text: string; focusArea: FocusArea | null }[] = [
  { text: "¿Qué situación te hizo sentir vulnerable hoy?", focusArea: FocusArea.EMOTIONAL_REGULATION },
  { text: "¿Qué necesitabas y no pudiste expresar?", focusArea: FocusArea.RELATIONSHIPS },
  { text: "¿Qué te gustaría decirte con mayor amabilidad?", focusArea: FocusArea.SELF_ESTEEM },
  { text: "¿Qué te preocupó hoy y qué parte está en tus manos?", focusArea: FocusArea.ANXIETY },
  { text: "¿Qué hiciste hoy para cuidarte?", focusArea: FocusArea.SELF_CARE },
  { text: "¿Qué aprendiste de ti esta semana?", focusArea: FocusArea.SELF_KNOWLEDGE },
  { text: "¿Qué tres cosas agradeces de hoy?", focusArea: null },
  { text: "¿Cómo describirías tu día en tres palabras?", focusArea: null },
];

async function main() {
  for (const challenge of challenges) {
    await prisma.challenge.upsert({
      where: { slug: challenge.slug },
      create: challenge,
      update: challenge,
    });
  }

  for (const prompt of journalPrompts) {
    const existing = await prisma.journalPrompt.findFirst({ where: { text: prompt.text } });
    if (!existing) {
      await prisma.journalPrompt.create({ data: prompt });
    }
  }

  console.log(`Seed listo: ${challenges.length} retos, ${journalPrompts.length} preguntas guiadas`);
}

main()
  .catch((err) => {
    console.error("Error en el seed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
