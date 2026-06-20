/**
 * Gemini / Imagen integration dla generatora grafik produktowych.
 *
 * Strategy:
 *  - Gdy `GEMINI_API_KEY` ustawione → real call do Imagen API
 *  - Bez klucza → mock: zwraca placeholder PNG (z napisem "MOCK" + parametrami)
 *    żeby user mógł testować flow batchy bez płacenia za API.
 *
 * Klucz dostajesz na: https://aistudio.google.com/apikey
 */

import { QUALITY_SPEC } from "./photo-shots-presets";

export type GenerateImageInput = {
  prompt: string;
  quality: "STANDARD" | "HIGH" | "ULTRA" | "NANO_BANANA_PRO";
  aspectRatio: string;
  /** Seed dla spójności — wszystkie zdjęcia w batchu używają tego samego.
   *  Uwaga: tylko Imagen wspiera explicit seed; Gemini Image używa wewnętrznej
   *  determinacji z promptu. */
  seed?: bigint | null;
  /** Reference images (URLs) — dla utrzymania stylu + koloru. Konwertowane
   *  do base64 przed wysłaniem do API. Imagen 4 przyjmuje max 3, Nano Banana
   *  Pro do 11 (6 obiektów + 5 postaci) — limity narzuca model. */
  referenceImageUrls?: string[];
};

export type GenerateImageResult =
  | {
      ok: true;
      /** Wygenerowany obraz jako Buffer (PNG/JPG). */
      imageBuffer: Buffer;
      contentType: string;
      /** Pełny prompt który poszedł do API (z efektywnym aspect ratio + seed). */
      finalPrompt: string;
      /** Faktyczny koszt w USD. */
      costUsd: number;
      /** Czy użyto mock'a zamiast prawdziwego API. */
      isMock: boolean;
    }
  | {
      ok: false;
      error: string;
      isMock: boolean;
    };

/**
 * Generuje 1 obraz przez Imagen API (lub mock).
 */
export async function generateProductPhoto(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateMockPhoto(input);
  }

  const spec = QUALITY_SPEC[input.quality];

  // Dispatcher: model po prefiksie. Nano Banana / Nano Banana Pro chodzi
  // przez Gemini Image API (:generateContent), Imagen 4 przez :predict.
  if (spec.model.startsWith("gemini-")) {
    return generateViaGeminiImage(input, spec, apiKey);
  }

  try {
    // Pobierz reference images jako base64 (max 3)
    // UWAGA: Imagen 4 przez Generative Language API NIE wspiera już
    // reference images. Google usunął `REFERENCE_TYPE_*` z publicznego API
    // (zostały tylko na Vertex AI z imagegeneration@006). Próba wysłania
    // dawała `Invalid reference type: REFERENCE_TYPE_DEFAULT`.
    //
    // Reference images są opcjonalnie wciąż wspierane w `gemini-3-pro-image`
    // (Nano Banana Pro) — wcześniejszy dispatcher w generateProductPhoto
    // tam je przekazuje przez `inline_data` w `parts`. Jeśli user wybrał
    // Imagen 4 quality + dał referencje → ignorujemy je i wysyłamy sam prompt.
    // (Niech wybierze Nano Banana Pro jeśli chce wykorzystać referencje.)
    const body = {
      instances: [{ prompt: input.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: input.aspectRatio,
        // UWAGA: Imagen 4 NIE wspiera już `seed` (Google usunął — deterministyczne
        // generowanie pozwala odtwarzać obrazy, potencjalne nadużycia). Przekazanie
        // seed daje INVALID_ARGUMENT. `input.seed` używamy tylko do trackingu
        // w bazie, nie wysyłamy do API.
        // Bez safety override — domyślne.
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:predict?key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Imagen API ${res.status}: ${errText.slice(0, 500)}`,
        isMock: false,
      };
    }

    const data = (await res.json()) as {
      predictions?: Array<{
        bytesBase64Encoded?: string;
        mimeType?: string;
      }>;
    };
    const pred = data.predictions?.[0];
    if (!pred?.bytesBase64Encoded) {
      return {
        ok: false,
        error: "Imagen API: brak zdjęcia w odpowiedzi",
        isMock: false,
      };
    }

    return {
      ok: true,
      imageBuffer: Buffer.from(pred.bytesBase64Encoded, "base64"),
      contentType: pred.mimeType ?? "image/png",
      finalPrompt: input.prompt,
      costUsd: spec.costPerImage,
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

/**
 * Generator przez Gemini Image API (:generateContent) — używany dla
 * Nano Banana (gemini-2.5-flash-image) i Nano Banana Pro (gemini-3-pro-image).
 *
 * Różni się od Imagen 4 (:predict):
 *  - Inny endpoint, inny kształt body (`contents.parts` zamiast `instances`)
 *  - Reference images inline w `parts` zamiast `referenceImages`
 *  - `generationConfig.responseModalities: ["IMAGE"]` mówi modelowi, że ma
 *    generować obraz (a nie tylko tekst)
 *  - Aspect ratio + rozdzielczość ustawia się przez `responseFormat.image`
 *
 * Limity:
 *  - Nano Banana (Flash) — 1K, do 3 referencji
 *  - Nano Banana Pro     — 1K/2K/4K, do 11 referencji (6 obj + 5 char)
 */
async function generateViaGeminiImage(
  input: GenerateImageInput,
  spec: (typeof QUALITY_SPEC)[keyof typeof QUALITY_SPEC],
  apiKey: string,
): Promise<GenerateImageResult> {
  try {
    // Reference images — Pro przyjmie do 11, Flash do ~3. Przekazujemy
    // wszystkie z input — model sam odrzuci nadmiarowe.
    const refs: Array<{ mimeType: string; data: string }> = [];
    if (input.referenceImageUrls && input.referenceImageUrls.length > 0) {
      for (const url of input.referenceImageUrls) {
        const ref = await fetchImageAsBase64(url);
        if (ref) refs.push(ref);
      }
    }

    const parts: Array<
      | { text: string }
      | { inline_data: { mime_type: string; data: string } }
    > = [{ text: input.prompt }];
    for (const r of refs) {
      parts.push({ inline_data: { mime_type: r.mimeType, data: r.data } });
    }

    // Body Gemini 3 Pro Image:
    //  - responseModalities MUSI mieć i TEXT i IMAGE (sam IMAGE też przejdzie,
    //    ale dokumentacja Google preferuje oba — Pro „thinking mode" generuje
    //    text-level reasoning obok obrazu).
    //  - imageConfig (NIE responseFormat.image!) zawiera aspectRatio i imageSize
    //    jako string literals ("1:1", "16:9", "2K", "4K", itp).
    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        ...(spec.imageSize && {
          imageConfig: {
            aspectRatio: input.aspectRatio,
            imageSize: spec.imageSize,
          },
        }),
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${spec.model}:generateContent`;
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Gemini Image API ${res.status}: ${errText.slice(0, 500)}`,
        isMock: false,
      };
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType?: string; data?: string };
            inline_data?: { mime_type?: string; data?: string };
          }>;
        };
        safetyRatings?: Array<{ category: string; probability: string }>;
      }>;
      promptFeedback?: {
        blockReason?: string;
        safetyRatings?: Array<{ category: string; probability: string }>;
      };
    };
    // Znajdź pierwszy part który ma inlineData (Gemini zwraca camelCase
    // w odpowiedziach mimo, że request używa snake_case w `inline_data`).
    const partsResp = data.candidates?.[0]?.content?.parts ?? [];
    let imageData: { mime: string; b64: string } | null = null;
    let textResponse = "";
    for (const p of partsResp) {
      const inline:
        | { mimeType?: string; data?: string; mime_type?: string }
        | undefined = p.inlineData ?? p.inline_data;
      const d = inline?.data;
      const m = inline?.mimeType ?? inline?.mime_type;
      if (d) {
        imageData = { mime: m ?? "image/png", b64: d };
        break;
      }
      if (p.text) textResponse += p.text;
    }
    if (!imageData) {
      // Diagnostyka: gdy model nie zwrocil obrazu, czesto ma sensowny powod
      // (safety block, refusal, prompt nie pasuje do edycji). Zlogujmy +
      // przekazmy uzytkownikowi konkretny komunikat zamiast generycznego.
      const finishReason = data.candidates?.[0]?.finishReason ?? "?";
      const blockReason = data.promptFeedback?.blockReason ?? null;
      const blocked = data.candidates?.[0]?.safetyRatings?.filter(
        (s) => s.probability === "HIGH" || s.probability === "MEDIUM",
      );
      const detail = blockReason
        ? `safety block: ${blockReason}`
        : blocked && blocked.length > 0
          ? `safety: ${blocked.map((b) => `${b.category}=${b.probability}`).join(", ")}`
          : finishReason !== "STOP"
            ? `finishReason: ${finishReason}`
            : textResponse
              ? `model zwrocil tekst zamiast obrazu: "${textResponse.slice(0, 200)}"`
              : "model nie zwrocil zadnego content";
      console.error(`[gemini-image] no image returned —`, detail);
      return {
        ok: false,
        error: `Gemini nie wygenerowal obrazu (${detail}) — sprobuj inny prompt lub powtorz`,
        isMock: false,
      };
    }

    return {
      ok: true,
      imageBuffer: Buffer.from(imageData.b64, "base64"),
      contentType: imageData.mime,
      finalPrompt: input.prompt,
      costUsd: spec.costPerImage,
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

/**
 * Mock — generuje prosty placeholder PNG z napisem informującym, że nie ma
 * klucza API. Działa offline, deterministycznie (seed → ten sam obraz).
 *
 * Używamy minimal SVG renderowanego do PNG przez Canvas... ale na Node nie ma
 * Canvas. Zwracamy zatem czysty PNG bytes z prostym wzorem opartym o hash promptu.
 */
async function generateMockPhoto(
  input: GenerateImageInput,
): Promise<GenerateImageResult> {
  // Symulujemy 1-2s opóźnienie
  await new Promise((r) => setTimeout(r, 800 + Math.random() * 800));

  // Generujemy minimalistyczny PNG 512×512 (1×1 pixel scaled up wizualnie nie zadziała,
  // więc tworzymy faktyczny 512×512 z gradientem zależnym od hash promptu).
  const hash = simpleHash(input.prompt + String(input.seed ?? 0));
  const png = buildMockPng(hash);

  return {
    ok: true,
    imageBuffer: png,
    contentType: "image/png",
    finalPrompt: input.prompt,
    costUsd: 0,
    isMock: true,
  };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Buduje minimalistyczny PNG 512×512 z gradientem RGB zależnym od hash.
 * Bez canvas dep — manualne stworzenie PNG przez pure Node Buffer.
 * Używamy zlib do compress IDAT chunka.
 */
function buildMockPng(hash: number): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require("node:zlib") as typeof import("node:zlib");
  const W = 512;
  const H = 512;
  const r1 = (hash & 0xff);
  const g1 = ((hash >> 8) & 0xff);
  const b1 = ((hash >> 16) & 0xff);
  const r2 = 255 - r1;
  const g2 = 255 - g1;
  const b2 = 255 - b1;

  // Raw pixel data — 3 bajty per pixel + 1 filter byte per row
  const rowLength = 1 + W * 3;
  const raw = Buffer.alloc(rowLength * H);
  for (let y = 0; y < H; y++) {
    raw[y * rowLength] = 0; // filter: None
    const t = y / H;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    for (let x = 0; x < W; x++) {
      const idx = y * rowLength + 1 + x * 3;
      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
    }
  }
  const idatData = zlib.deflateSync(raw);

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makePngChunk("IHDR", ihdr);
  const idatChunk = makePngChunk("IDAT", idatData);
  const iendChunk = makePngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 — inline implementacja (bez deps), z table-driven approach dla speed.
const CRC32_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Wrapper na fetch() z timeout + 1 retry przy nieudanym połączeniu.
 * Gemini Image API (Nano Banana Pro) generuje 2K obraz przez 30-120s,
 * a sieć/firewall/proxy zrywa idle connection po krótszym czasie →
 * undici raportuje "TypeError: fetch failed". Dajemy explicit timeout
 * 4 minuty + 1 retry żeby przejściowy network error nie killował zlecenia.
 *
 * Zawsze rzuca lepszy error niz samo "fetch failed" — opisuje czy to byl
 * timeout, network error, czy inny problem.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? 240_000;
  const retries = opts.retries ?? 1;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ac.signal });
      clearTimeout(timer);
      return res;
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
      const wasAbort =
        e instanceof Error &&
        (e.name === "AbortError" || e.message.includes("aborted"));
      console.error(
        `[gemini-fetch] attempt ${attempt + 1}/${retries + 1} failed:`,
        e instanceof Error ? e.message : String(e),
        wasAbort ? "(timeout)" : "",
      );
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
    }
  }
  if (lastError instanceof Error) {
    const wasAbort =
      lastError.name === "AbortError" || lastError.message.includes("aborted");
    if (wasAbort) {
      throw new Error(
        `Timeout — Gemini nie zwrócił odpowiedzi w ${Math.round(timeoutMs / 1000)}s (model może być przeciążony, spróbuj ponownie)`,
      );
    }
    const cause = (lastError as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    throw new Error(
      code
        ? `Błąd sieci: ${lastError.message} (${code}) — sprawdź połączenie i spróbuj ponownie`
        : `Błąd sieci: ${lastError.message} — sprawdź połączenie i spróbuj ponownie`,
    );
  }
  throw new Error("Nieznany błąd sieci podczas wywołania Gemini API");
}

/** Pobiera obraz z URL'a i zwraca jako base64 + mimeType. */
async function fetchImageAsBase64(
  url: string,
): Promise<{ mimeType: string; data: string } | null> {
  try {
    // Relative URLs (lokalne /uploads) — read direct from filesystem
    if (url.startsWith("/uploads/")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("node:fs/promises") as typeof import("node:fs/promises");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require("node:path") as typeof import("node:path");
      const filePath = path.join(process.cwd(), "public", url);
      const buf = await fs.readFile(filePath);
      const ext = path.extname(url).toLowerCase();
      const mime =
        ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".webp"
            ? "image/webp"
            : "image/png";
      return { mimeType: mime, data: buf.toString("base64") };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? "image/png";
    return { mimeType: mime, data: buf.toString("base64") };
  } catch {
    return null;
  }
}
