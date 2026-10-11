import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';

import { CarResultSchema } from '@/lib/car-schema';

// Runs on the server (Expo Router API route), so the API key never ships in the app bundle.
const client = new Anthropic();

const SYSTEM_PROMPT = `Du bist ein Auto-Experte mit umfassendem Wissen über Marken, Modelle, Generationen und Facelifts sowie über den Schweizer Automarkt.
Du bekommst ein Foto. Bestimme Marke, Modell, Generation und Baujahr-Bereich so genau wie möglich anhand von Front, Scheinwerfern, Kühlergrill, Rückleuchten, Proportionen, Felgen und Schriftzügen.
Schätze anschliessend den Neupreis und den heutigen Gebrauchtwert in CHF für die Schweiz. Gib realistische Bereiche an, keine Scheingenauigkeit.
Wenn du unsicher bist, setze die Sicherheit entsprechend tief und nenne Alternativen.
Wenn kein Auto auf dem Foto ist, setze autoErkannt auf false, lasse Textfelder leer und Preise auf 0.
Antworte auf Deutsch (Schweizer Schreibweise, also "ss" statt "ß").`;

type RecognizeRequest = { imageBase64?: string; mediaType?: string };

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export async function POST(request: Request) {
  let body: RecognizeRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400 });
  }

  const { imageBase64 } = body;
  const mediaType = (body.mediaType ?? 'image/jpeg') as AllowedMediaType;
  if (!imageBase64 || !ALLOWED_MEDIA_TYPES.includes(mediaType)) {
    return Response.json({ error: 'Kein gültiges Bild erhalten.' }, { status: 400 });
  }

  try {
    const response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(CarResultSchema) },
      // Re-run on a fallback model if a safety classifier declines the request.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Welches Auto ist das und was kostet es ungefähr?' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return Response.json(
        { error: 'Die KI konnte dieses Bild nicht analysieren.' },
        { status: 422 }
      );
    }
    if (!response.parsed_output) {
      return Response.json({ error: 'Die Antwort der KI war unvollständig.' }, { status: 502 });
    }

    return Response.json(response.parsed_output);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('Anthropic auth failed – is ANTHROPIC_API_KEY set?');
      return Response.json(
        { error: 'Server-Konfiguration fehlt (API-Key).' },
        { status: 500 }
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: 'Zu viele Anfragen. Bitte gleich nochmal versuchen.' },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error('Anthropic bad request:', error.message);
      return Response.json({ error: 'Das Bild konnte nicht verarbeitet werden.' }, { status: 400 });
    }
    if (error instanceof Anthropic.APIError) {
      console.error('Anthropic API error:', error.status, error.message);
      return Response.json({ error: 'Die KI ist gerade nicht erreichbar.' }, { status: 502 });
    }
    console.error('Unexpected error:', error);
    return Response.json({ error: 'Unerwarteter Fehler.' }, { status: 500 });
  }
}
