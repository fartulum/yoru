import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenRouterClient } from "./openrouter";

function catalog(models: { id: string; prompt?: string; completion?: string; ctx?: number }[]) {
  return {
    ok: true,
    json: async () => ({
      data: models.map((m) => ({
        id: m.id,
        context_length: m.ctx ?? 8192,
        pricing: { prompt: m.prompt ?? "0", completion: m.completion ?? "0" },
      })),
    }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OpenRouterClient", () => {
  it("keeps only free models (prompt and completion both zero)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      catalog([
        { id: "paid/big", prompt: "0.001", completion: "0.002" },
        { id: "free/small", ctx: 4096 },
        { id: "free/big", ctx: 131072 },
      ]) as unknown as Response,
    ));
    const c = new OpenRouterClient("test-key");
    const free = await c.refreshFreeModels();
    expect(free.map((m) => m.id)).toEqual(["free/big", "free/small"]);
  });

  it("prefers known strong models over larger-context unknowns", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      catalog([
        { id: "unknown/huge", ctx: 999999 },
        { id: "deepseek/deepseek-chat-v3-0324:free", ctx: 8192 },
      ]) as unknown as Response,
    ));
    const c = new OpenRouterClient("test-key");
    const model = await c.pickModel();
    expect(model).toBe("deepseek/deepseek-chat-v3-0324:free");
  });

  it("drops a dead model and fails over to the next best one", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/models")) {
        return catalog([
          { id: "free/a", ctx: 100 },
          { id: "free/b", ctx: 90 },
        ]) as unknown as Response;
      }
      const body = JSON.parse(String(init?.body));
      if (body.model === "free/a") {
        return { ok: false, status: 404, text: async () => "model not found" } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: "hello from b" } }] }),
      } as unknown as Response;
    }));
    const c = new OpenRouterClient("test-key");
    const reply = await c.chat([{ role: "user", content: "hi" }], []);
    expect(reply.content).toBe("hello from b");
    expect(c["models"].map((m) => m.id)).toEqual(["free/b"]);
  });

  it("respects OPENROUTER_MODEL when the forced model is in the catalog", async () => {
    process.env.OPENROUTER_MODEL = "free/b";
    vi.stubGlobal("fetch", vi.fn(async () =>
      catalog([{ id: "free/a", ctx: 100 }, { id: "free/b", ctx: 90 }]) as unknown as Response,
    ));
    const c = new OpenRouterClient("test-key");
    expect(await c.pickModel()).toBe("free/b");
    delete process.env.OPENROUTER_MODEL;
  });
});