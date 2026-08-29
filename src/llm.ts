import { readFileSync, existsSync } from "node:fs";

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

/** Local Ollama backend (default). */
class OllamaClient implements LLMClient {
  async chat(messages: ChatMessage[], tools: ToolDef[]) {
    const res = await fetch(`${env("OLLAMA_URL", "http://localhost:11434")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env("OLLAMA_MODEL", "llama3.2:3b"),
        messages,
        tools: tools.length ? tools : undefined,
        stream: false,
        // Speed: cap the reply length so the model stops instead of rambling.
        options: {
          num_predict: Number(env("OLLAMA_NUM_PREDICT", "512")) || 512,
          // Speed: keep the model loaded between messages (avoids reload latency).
          keep_alive: env("OLLAMA_KEEP_ALIVE", "30m"),
        },
      }),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      message?: { content?: string; tool_calls?: ToolCall[] };
    };
    return {
      content: data.message?.content ?? "",
      tool_calls: data.message?.tool_calls,
    };
  }
}

/** OpenAI-compatible backend (OpenAI, Groq, OpenRouter, LM Studio, ...). */
class OpenAICompatClient implements LLMClient {
  async chat(messages: ChatMessage[], tools: ToolDef[]) {
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

export function loadEnvFile(path = ".env") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}