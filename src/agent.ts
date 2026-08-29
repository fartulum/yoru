import { makeLLM, type ChatMessage } from "./llm.js";
import { tools, loadMemory, type ToolContext } from "./tools/index.js";
import { logAudit, isKilled } from "./audit.js";
import { setPanelState } from "./panel.js";
import { readFileSync as rf, existsSync } from "node:fs";

const PERSONA_PATH = "config/persona.md";

export interface AgentOptions {
  /** true when the speaker is the owner (terminal, or owner Discord ID) */
  owner: boolean;
  /** channel-specific sender, e.g. "terminal" or "discord:123456" */
  sender: string;
  /** ask a human yes/no (terminal prompt or Discord reply) — used by the safety gate */
  confirm?: (question: string) => Promise<boolean>;
  /** send a message to this interface (used for async watchdog alerts) */
  say?: (text: string) => Promise<void>;
}

export class Agent {
  private llm = makeLLM();
  private history: ChatMessage[] = [];
  private ctx: ToolContext;

  constructor(private opts: AgentOptions) {
    this.ctx = {
      owner: opts.owner,
      sender: opts.sender,
      confirm: opts.confirm ?? (async () => opts.owner),
      say: opts.say ?? (async (t) => console.log(t)),
    };
    const persona = existsSync(PERSONA_PATH)
      ? rf(PERSONA_PATH, "utf8")
      : "You are Yoru, a self-hosted personal AI agent.";
    const instructions = existsSync("config/instructions.md")
      ? `\n\n# Owner instructions (authoritative)\n${rf("config/instructions.md", "utf8")}`
      : "";
    const memory = loadMemory();
    this.history.push({
      role: "system",
      content:
        persona.replace("{{name}}", process.env.PERSONA_NAME ?? "Yoru") +
        instructions +
        (memory ? `\n\n# Long-term memory\n${memory}` : "") +
        `\n\nCurrent speaker: ${opts.sender}${opts.owner ? " (OWNER — full tool access)" : " (guest — restricted: no shell, no lookups, no file writes)"}.`,
    });
  }

  async handle(input: string): Promise<string> {
    setPanelState({ status: "thinking", activity: input.slice(0, 120) });
    this.history.push({ role: "user", content: input });
    for (let round = 0; round < 8; round++) {
      const reply = await this.llm.chat(this.history, tools.map((t) => t.def));
      this.history.push({
        role: "assistant",
        content: reply.content,
        ...(reply.tool_calls ? { tool_calls: reply.tool_calls } : {}),
      });
      if (!reply.tool_calls?.length) {
        setPanelState({ status: "idle", activity: "Waiting" });
        return reply.content.trim() || "(no reply)";
      }
      setPanelState({ status: "working", activity: `running ${reply.tool_calls.map((c) => c.function.name).join(", ")}` });
      for (const call of reply.tool_calls) {
        let result: string;
        try {
          const args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
          const tool = tools.find((t) => t.def.function.name === call.function.name);
          // kill switch: only recovery tools pass while armed
          const RECOVERY = new Set(["unlock", "kill_switch"]);
          if (isKilled() && tool && !RECOVERY.has(tool.def.function.name)) {
            result = "BLOCKED: kill switch is armed. Only unlock/kill_switch respond. Owner can disarm via terminal or Discord (owner-only).";
            logAudit({ time: new Date().toISOString(), actor: this.opts.sender, action: call.function.name, detail: "blocked by kill switch", allowed: false });
          } else if (tool) {
            result = await tool.run(args, this.ctx);
            logAudit({ time: new Date().toISOString(), actor: this.opts.sender, action: call.function.name, detail: JSON.stringify(args).slice(0, 300), allowed: !result.startsWith("Blocked") });
          } else {
            result = `ERROR: unknown tool ${call.function.name}`;
          }
        } catch (e) {
          result = `ERROR: invalid arguments — ${(e as Error).message}`;
        }
        this.history.push({ role: "tool", content: result, tool_call_id: call.id });
      }
    }
    return "(stopped: tool-loop limit reached)";
  }

  /** Update the confirmation callback (per-message on Discord). */
  setConfirm(confirm: (question: string) => Promise<boolean>): void {
    this.ctx.confirm = confirm;
  }

  /** Fire-and-forget message from the system (watchdog alerts). */
  async notify(text: string): Promise<void> {
    await this.opts.say?.(text);
  }
}
