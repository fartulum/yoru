import { createInterface } from "node:readline";
import { loadEnvFile } from "./llm.js";
import { Agent } from "./agent.js";
import { startWatchdog } from "./watchdog.js";
import { startPanel, setPanelState } from "./panel.js";
import { logAudit } from "./audit.js";

loadEnvFile();

const OWNER_DISCORD_IDS = (process.env.OWNER_DISCORD_IDS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

async function main() {
  const mode = process.argv[2] ?? "chat";
  const name = process.env.PERSONA_NAME ?? "Yoru";

  if (mode === "discord" || process.env.DISCORD_TOKEN) {
    startPanel();
    const { startDiscord } = await import("./discord.js");
    await startDiscord(OWNER_DISCORD_IDS);
    return; // discord.ts keeps the process alive
  }

  // terminal mode
  startPanel();
  const confirm = (q: string) =>
    new Promise<boolean>((res) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`${q} `, (a) => { rl.close(); res(/^(y|yes)$/i.test(a.trim())); });
    });
  const agent = new Agent({ owner: true, sender: "terminal", confirm, say: async (t) => console.log(t) });
  logAudit({ time: new Date().toISOString(), actor: "terminal", action: "session_start" });
  setPanelState({ name, status: "idle", activity: "Terminal session started" });
  console.log(
    `${name} (yoru-lite v0.4) — backend: ${process.env.LLM_BACKEND ?? "ollama"}, model: ${process.env.OLLAMA_MODEL ?? "llama3.2:3b"}\n` +
    `Terminal mode. Visual panel: http://localhost:${process.env.PANEL_PORT ?? 4173}\n` +
    `Type your message, or "exit" to quit.\n`
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("line", (line) => {
    const input = line.trim();
    if (!input) return;
    if (input === "exit" || input === "quit") { rl.close(); process.exit(0); }
    // Stream the reply live: tokens print as they arrive from the LLM.
    let streamed = false;
    process.stdout.write(`${name}: `);
    agent.handle(input, (token) => { streamed = true; process.stdout.write(token); })
      .then((reply) => {
        if (!streamed) process.stdout.write(reply); // non-streaming backends
        process.stdout.write("\n\n");
      })
      .catch((e) => console.error(`ERROR: ${(e as Error).message}\n`));
  });
  if (process.env.WATCHDOG === "on") startWatchdog(agent);
}

main();