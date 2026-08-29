import { existsSync, readFileSync } from "node:fs";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: object };
}

export interface LLMClient {
  chat(
    messages: ChatMessage[],
    tools: ToolDef[],
  ): Promise<{
    content: string;
    tool_calls?: ToolCall[];
  }>;
}

function env(k: string, d = ""): string {
  return process.env[k] ?? d;
}

/** Keep the prompt small: cap how many recent messages are sent to the LLM. */
export const HISTORY_LIMIT = Math.max(2, Number(env("HISTORY_LIMIT", "12")) || 12);

/** Trim history to the most recent HISTORY_LIMIT messages (system messages are never trimmed here). */
export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length <= HISTORY_LIMIT) return messages;
  return messages.slice(-HISTORY_LIMIT);
}

/** Load .env file into process.env (without overriding existing values). */
export function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

/**
 * Ollama streaming client: emits tokens as they arrive via onToken, so the
 * terminal prints the reply live instead of blocking until the full response
 * is generated. Returns the full assembled response.
 */
export class OllamaClient implements LLMClient {
  async chat(
    messages: ChatMessage[],
    tools: ToolDef[],
    onToken?: (token: string) => void,
  ): Promise<{ content: string; tool_calls?: ToolCall[] }> {
    const res = await fetch(`${env("OLLAMA_URL", "http://localhost:11434")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env("OLLAMA_MODEL", "llama3.2:3b"),
        messages,
        tools: tools.length ? tools : undefined,
        stream: true,
        options: {
          num_predict: Number(env("OLLAMA_NUM_PREDICT", "512")) || 512,
          keep_alive: env("OLLAMA_KEEP_ALIVE", "30m"),
        },
      }),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error("Ollama error: empty response body");

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
        if (!line) continue;
        let data: {
          message?: { content?: string; tool_calls?: ToolCall[] };
          done?: boolean;
        };
        try {
          data = JSON.parse(line);
        } catch {
          continue; // skip malformed/partial lines
        }
        const token = data.message?.content ?? "";
        if (token) {
          content += token;
          onToken?.(token);
        }
        if (data.message?.tool_calls?.length) {
          toolCalls = data.message.tool_calls;
        }
        if (data.done) return { content, tool_calls: toolCalls };
      }
      if (content.length > 0 && toolCalls) break; // tool_calls arrived, stop streaming
    }
    return { content, tool_calls: toolCalls };
  }
}

/** OpenAI-compatible backend (OpenAI, Groq, OpenRouter, LM Studio, ...). */
export class OpenAICompatClient implements LLMClient {
  async chat(messages: ChatMessage[], tools: ToolDef[]): Promise<{
    content: string;
    tool_calls?: ToolCall[];
  }> {
    const res = await fetch(`${env("OPENAI_BASE_URL", "https://api.openai.com/v1")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: env("OPENAI_MODEL", "gpt-4o-mini"),
        messages,
        tools: tools.length ? tools : undefined,
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      choices: { message: { content: string; tool_calls?: ToolCall[] } }[];
    };
    return data.choices[0].message;
  }
}

export function makeLLM(): LLMClient {
  return env("LLM_BACKEND", "ollama") === "openai"
    ? new OpenAICompatClient()
    : new OllamaClient();
}