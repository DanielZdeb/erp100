/**
 * OpenAI gpt-image integration dla generatora grafik produktowych.
 *
 * Strategy:
 *  - Gdy `OPENAI_API_KEY` ustawione → real call do /v1/images/generations
 *  - Bez klucza → mock (ten sam helper co w photo-gemini.ts — placeholder PNG
 *    oznaczony jako "OPENAI MOCK").
 *
 * Dispatcher w photo-gemini.ts rozpoznaje prefix `gpt-image-` i wysyła tu
 * zamiast do Gemini/Imagen.
 *
 * Dokumentacja: https://developers.openai.com/api/docs/guides/image-generation
 */

import {
  generateMockPhoto,
  type GenerateImageInput,
  type GenerateImageResult,
} from "./photo-gemini";
import { QUALITY_SPEC } from "./photo-shots-presets";

// Mapowanie aspect ratio z naszego formatu ("1:1", "16:9", itp.) na dokładny
// rozmiar pixel. OpenAI przyjmuje konkretne wymiary (wielokrotnosc 16, max
// 3840 px na krawedz) — nie aspect ratio string.
function aspectRatioToSize(ratio: string): string {
  const [wStr, hStr] = ratio.split(":");
  const w = Number(wStr);
  const h = Number(hStr);
  if (!w || !h) return "1024x1024";
  // Celujemy w ~1024px dluzszego boku (balance jakosci/kosztu dla katalogu).
  const base = 1024;
  if (w === h) return "1024x1024";
  if (w > h) {
    const height = Math.round((base * h) / w / 16) * 16;
    return `${base}x${height}`;
  }
  const width = Math.round((base * w) / h / 16) * 16;
  return `${width}x${base}`;
}

export async function generateViaOpenAI(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return generateMockPhoto(input);
  }

  const spec = QUALITY_SPEC[input.quality];
  const size = aspectRatioToSize(input.aspectRatio);

  // Reference images → images/edits endpoint z `image[]` i promptem.
  // Bez referencji → zwykle images/generations.
  const hasRefs =
    input.referenceImageUrls != null && input.referenceImageUrls.length > 0;

  try {
    const url = hasRefs
      ? "https://api.openai.com/v1/images/edits"
      : "https://api.openai.com/v1/images/generations";

    let body: BodyInit;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
    };

    if (hasRefs) {
      // multipart/form-data z referencjami jako pliki
      const form = new FormData();
      form.append("model", spec.model);
      form.append("prompt", input.prompt);
      form.append("size", size);
      form.append("quality", "high");
      form.append("n", "1");
      for (const refUrl of input.referenceImageUrls ?? []) {
        const buf = await fetchAsBlob(refUrl);
        if (buf) form.append("image[]", buf, "ref.png");
      }
      body = form;
      // Content-Type ustawia fetch sam przy FormData (z boundary).
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify({
        model: spec.model,
        prompt: input.prompt,
        size,
        quality: "high",
        n: 1,
      });
    }

    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        error: `OpenAI API ${res.status}: ${errText.slice(0, 500)}`,
        isMock: false,
      };
    }

    const data = (await res.json()) as {
      data?: Array<{
        b64_json?: string;
        revised_prompt?: string;
      }>;
      usage?: {
        total_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
      };
    };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      return {
        ok: false,
        error: "OpenAI API: brak zdjecia w odpowiedzi",
        isMock: false,
      };
    }

    // Przyblizony koszt: output_tokens × $30/1M (jesli dostajemy usage).
    // Falback: szacunek z spec.costPerImage.
    const outTokens = data.usage?.output_tokens ?? 0;
    const inTokens = data.usage?.input_tokens ?? 0;
    const costUsd =
      outTokens > 0 || inTokens > 0
        ? (outTokens * 30 + inTokens * 8) / 1_000_000
        : spec.costPerImage;

    return {
      ok: true,
      imageBuffer: Buffer.from(b64, "base64"),
      contentType: "image/png",
      finalPrompt: data.data?.[0]?.revised_prompt ?? input.prompt,
      costUsd,
      isMock: false,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
      isMock: false,
    };
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 240_000,
): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAsBlob(url: string): Promise<Blob | null> {
  try {
    if (url.startsWith("/uploads/")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs/promises") as typeof import("node:fs/promises");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("node:path") as typeof import("node:path");
      const filePath = path.join(process.cwd(), "public", url);
      const buf = await fs.readFile(filePath);
      return new Blob([buf], { type: "image/png" });
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}
