import { z } from 'zod';

/** Structured result Claude returns for a car photo. */
export const CarResultSchema = z.object({
  autoErkannt: z
    .boolean()
    .describe('true, wenn auf dem Foto ein Auto klar erkennbar ist, sonst false'),
  marke: z.string().describe('Hersteller, z.B. "Volkswagen". Leer, wenn kein Auto erkannt.'),
  modell: z.string().describe('Modell, z.B. "Golf GTI". Leer, wenn kein Auto erkannt.'),
  generation: z.string().describe('Generation / Baureihe, z.B. "Golf VIII (Mk8)"'),
  baujahre: z.string().describe('Geschätzter Baujahr-Bereich, z.B. "2020–2024"'),
  karosserie: z.string().describe('z.B. Limousine, Kombi, SUV, Coupé, Cabrio'),
  farbe: z.string(),
  sicherheit: z
    .number()
    .int()
    .describe('Wie sicher die Erkennung ist, 0 bis 100'),
  merkmale: z
    .array(z.string())
    .describe('Sichtbare Merkmale, an denen das Modell erkannt wurde'),
  alternativen: z
    .array(z.string())
    .describe('Andere Modelle, die ähnlich aussehen und in Frage kämen'),
  neupreisChf: z
    .object({ von: z.number().int(), bis: z.number().int() })
    .describe('Ungefährer Neupreis in CHF (Schweiz), Basis bis gut ausgestattet'),
  gebrauchtpreisChf: z
    .object({ von: z.number().int(), bis: z.number().int() })
    .describe('Geschätzter heutiger Gebrauchtwert in CHF für den erkannten Baujahr-Bereich'),
  preisHinweis: z.string().describe('Kurze Begründung der Preisschätzung'),
});

export type CarResult = z.infer<typeof CarResultSchema>;
