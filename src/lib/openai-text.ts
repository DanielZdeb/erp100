/**
 * OpenAI Responses API wrapper dla tekstu — używany przez description-templates
 * i podobne miejsca które wcześniej wołały Anthropic Claude.
 *
 * Model domyślny: gpt-6-astra (flagowy OpenAI od 2026-10).
 * Endpoint: POST https://api.openai.com/v1/responses
 *
 * Zalety Responses API vs Chat Completions:
 *  - Natywny `tools: [{type: "web_search"}]` (Anthropic ma web_search_20250305 jako tool)
 *  - Structured output przez `text.format.json_schema` (strict: true)
 *  - `tool_choice: "required"` wymusza wywołanie function toolu
 *
 * Pricing (gpt-6-astra, 2026-10): $10/1M input, $50/1M output tokens.
 * Cena web_search per call — niepublikowana w pricing, estymujemy $0.01/call
 * (podobnie jak Claude). Poprawimy po pierwszym użyciu z realnych bills.
 */

import { fetchWithTimeout } from "./openai-fetch";

export const DEFAULT_TEXT_MODEL = "gpt-6-astra";
export const DEFAULT_TEXT_MODEL_LABEL = "GPT-6 Astra";

/** Przybliżony koszt w USD per 1M tokenów dla domyślnego modelu. */
export const PRICE_INPUT_PER_MTOK = 10;
export const PRICE_OUTPUT_PER_MTOK = 50;
export const PRICE_WEB_SEARCH_PER_CALL = 0.01;

export type OpenAIToolFunction = {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
};

export type OpenAIToolWebSearch = {
  type: "web_search";
  search_context_size?: "low" | "medium" | "high";
};

export type OpenAITool = OpenAIToolFunction | OpenAIToolWebSearch;

export type OpenAICallInput = {
  /** np. "gpt-6-astra" (default). */
  model?: string;
  /** System prompt — opcjonalny, zalecany dla kontekstu/roli. */
  systemPrompt?: string;
  /** Główny prompt usera. */
  userPrompt: string;
  /** Max output tokens. */
  maxOutputTokens?: number;
  /** Toole: web_search + function schemy. */
  tools?: OpenAITool[];
  /** Wymuś użycie konkretnego toola. */
  toolChoice?:
    | "auto"
    | "required"
    | "none"
    | { type: "function"; name: string };
  /** JSON schema dla structured output (bez tools). */
  jsonSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
};

export type OpenAIToolCall = {
  name: string;
  /** Już sparsowany JSON z `arguments`. */
  input: unknown;
};

export type OpenAICallResult =
  | {
      ok: true;
      text: string;
      toolCalls: OpenAIToolCall[];
      usage: {
        inputTokens: number;
        outputTokens: number;
        webSearches: number;
      };
      /** Przybliżony koszt wywołania w USD (tokeny + web_search). */
      costUsd: number;
    }
  | { ok: false; error: string };

export async function callOpenAIText(
  input: OpenAICallInput,
): Promise<OpenAICallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "Brak OPENAI_API_KEY w env — generowanie wymaga klucza OpenAI.",
    };
  }

  const model = input.model ?? DEFAULT_TEXT_MODEL;

  // Responses API input: tablica itemów z role + content.
  const items: Array<{
    role: "system" | "user";
    content: string;
  }> = [];
  if (input.systemPrompt) {
    items.push({ role: "system", content: input.systemPrompt });
  }
  items.push({ role: "user", content: input.userPrompt });

  const body: Record<string, unknown> = {
    model,
    input: items,
  };
  if (input.maxOutputTokens) body.max_output_tokens = input.maxOutputTokens;
  if (input.tools && input.tools.length > 0) body.tools = input.tools;
  if (input.toolChoice) body.tool_choice = input.toolChoice;
  if (input.jsonSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: input.jsonSchema.name,
        strict: input.jsonSchema.strict ?? true,
        schema: input.jsonSchema.schema,
      },
    };
  }

  try {
    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      240_000,
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        error: `OpenAI API ${res.status}: ${errText.slice(0, 500)}`,
      };
    }

    const data = (await res.json()) as {
      output?: Array<{
        type?: string;
        name?: string;
        arguments?: string;
        content?: Array<{
          type?: string;
          text?: string;
        }>;
      }>;
      output_text?: string;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    // Zbieramy text z items typu "message" + output_text (convenience field)
    const texts: string[] = [];
    const toolCalls: OpenAIToolCall[] = [];
    let webSearches = 0;

    for (const item of data.output ?? []) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === "output_text" && c.text) {
            texts.push(c.text);
          }
        }
      } else if (item.type === "function_call" && item.name) {
        let parsed: unknown = null;
        try {
          parsed = item.arguments ? JSON.parse(item.arguments) : null;
        } catch {
          parsed = item.arguments ?? null;
        }
        toolCalls.push({ name: item.name, input: parsed });
      } else if (item.type === "web_search_call") {
        webSearches++;
      }
    }

    // Fallback: niektóre wersje API zwracają też output_text jako prostsze pole
    const text = texts.join("\n").trim() || (data.output_text ?? "").trim();

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const costUsd =
      (inputTokens * PRICE_INPUT_PER_MTOK) / 1_000_000 +
      (outputTokens * PRICE_OUTPUT_PER_MTOK) / 1_000_000 +
      webSearches * PRICE_WEB_SEARCH_PER_CALL;

    return {
      ok: true,
      text,
      toolCalls,
      usage: { inputTokens, outputTokens, webSearches },
      costUsd,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}
