import { ChatMessage, ToolCall, ToolDef, LLMClient } from "./llm";

/**
 * OpenRouter backend: OpenAI-compatible chat completions against
 * https://openrouter.ai/api/v1, with automatic discovery of free models
 * and failover when the current model disappears or errors out.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const MODEL_CACHE_TTL_MS = 15 * 60 * 1000; // rescan the catalog every 15 min

/** Preference order: strongest free models first. */
const MODEL_PREFERENCES = [
  "deepseek/deepseek-chat-v3-0324:free",
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.1-8b-instruct:free",
];

export interface OpenRouterModel {
  id: string;
  contextLength: number;
}

export class OpenRouterClient implements LLMClient {
  private apiKey: string;
  private base: string;
  private models: OpenRouterModel[] = [];
  private modelsFetchedAt = 0;
  private currentModel: string | null = null;

  constructor(apiKey: string, base = OPENROUTER_BASE) {
    this.apiKey = apiKey;
    this.base = base;
  }

  /** Fetch the model catalog and keep the free ones, best first. */
  async refreshFreeModels(): Promise<OpenRouterModel[]> {
    const res = await fetch(`${this.base}/models`);
    if (!res.ok) throw new Error(`OpenRouter catalog error ${res.status}`);
    const data = (await res.json()) as {
      data: { id: string; pricing?: { prompt?: string; completion?: string }; context_length?: number }[];
    };
    const free = data.data
      .filter((m) => {
        const p = Number(m.pricing?.prompt ?? "1");
        const c = Number(m.pricing?.completion ?? "1");
        return p === 0 && c === 0;
      })
      .map((m) => ({ id: m.id, contextLength: m.context_length ?? 0 }));
    // Sort: preferred models first (in preference order), then by context length desc
    free.sort((a, b) => {
      const pa = MODEL_PREFERENCES.indexOf(a.id);
      const pb = MODEL_PREFERENCES.indexOf(b.id);
      if (pa !== -1 || pb !== -1) return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
      return b.contextLength - a.contextLength;
    });
    this.models = free;
    this.modelsFetchedAt = Date.now();
    return free;
  }

  /** Best available free model, refreshing the catalog if stale. */
  async pickModel(): Promise<string> {
    const stale = Date.now() - this.modelsFetchedAt > MODEL_CACHE_TTL_MS;
    if (stale || this.models.length === 0) {
      try {
        await this.refreshFreeModels();
      } catch {
        if (this.models.length === 0) throw new Error("OpenRouter: no free models available");
      }
    }
    // Keep the current model if it is still in the catalog, else take the best one.
    if (this.currentModel && this.models.some((m) => m.id === this.currentModel)) {
      return this.currentModel;
    }
    const forced = process.env.OPENROUTER_MODEL;
    if (forced && this.models.some((m) => m.id === forced)) {
      this.currentModel = forced;
      return forced;
    }
    if (this.models.length === 0) throw new Error("OpenRouter: no free models available");
    this.currentModel = this.models[0].id;
    return this.currentModel;
  }

  async chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onToken?: (token: string) => void,
  ): Promise<{ content: string; tool_calls?: ToolCall[] }> {
    let attempt = 0;
    // Failover: on model errors (404/429/5xx), drop the model and retry with the next best one.
    while (attempt < 3) {
      const model = await this.pickModel();
      try {
        return await this.chatOnce(model, messages, tools, onToken);
      } catch (err) {
        attempt++;
        const msg = err instanceof Error ? err.message : String(err);
        const modelGone = /\b(404|not found|no longer|decommission)/i.test(msg);
        const rateLimited = /\b(429|rate limit)/i.test(msg);
        if (modelGone || rateLimited) {
          // Remove the dead model from the pool and force a re-pick.
          this.models = this.models.filter((m) => m.id !== model);
          this.currentModel = null;
          if (rateLimited && this.models.length > 0) {
            this.currentModel = this.models[0].id;
          }
          continue;
        }
        throw err;
      }
    }
    throw new Error("OpenRouter: all free model attempts failed");
  }

  private async chatOnce(
    model: string,
    messages: ChatMessage[],
    tools: ToolDef[],
    onToken?: (token: string) => void,
  ): Promise<{ content: string; tool_calls?: ToolCall[] }> {
    const res = await fetch(`${this.base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/GSSurge/yoru",
        "X-Title": "yoru",
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.length ? tools : undefined,
        stream: Boolean(onToken),
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);

    if (!onToken || !res.body) {
      const data = (await res.json()) as {
        choices: { message: { content: string; tool_calls?: ToolCall[] } }[];
      };
      return data.choices[0].message;
    }

    // Streaming: parse SSE lines, emit content tokens, capture tool_calls.
    let content = "";
    let toolCalls: ToolCall[] | undefined;
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += decoder.decode(chunk, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let data: {
          choices?: {
            delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] };
          }[];
        };
        try {
          data = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = data.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
          onToken(delta.content);
        }
        if (delta?.tool_calls?.length) {
          toolCalls ??= [];
          for (const tc of delta.tool_calls) {
            const slot = (toolCalls[tc.index] ??= { id: tc.id ?? "", type: "function", function: { name: "", arguments: "" } });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.function.name += tc.function.name;
            if (tc.function?.arguments) slot.function.arguments += tc.function.arguments;
          }
        }
      }
    }
    return { content, tool_calls: toolCalls };
  }
}