import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { loadEnvFile } from "./llm.js";
import { Agent } from "./agent.js";
import { startWatchdog } from "./watchdog.js";

loadEnvFile();

const OWNER_DISCORD_IDS = (process.env.OWNER_DISCORD_IDS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

async function main() {
  const mode = process.argv[2] ?? "chat";
  const name = process.env.env.PERSONA_NAME ?? "Yoru";
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

  if (mode === "discord" || process.env.DISCORD_TOKEN) {
    const { startDiscord } = await import("./discord.js");
    await startDiscord(OWNER_DISCORD_IDS);
    return; // discord.ts keeps the process alive
  }

  // terminal mode
  const confirm = (q: string) =>
    new Promise<boolean>((res) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`${q} `, (a) => { rl.close(); res(/^(y|yes)$/i.test(a.trim())); });
    });
  const agent = new Agent({ owner: true, sender: "terminal", confirm, say: async (t) => console.log(t) });
  console.log(
    `${name} (yoru-lite v${version}) — backend: ${process.env.LLM_BACKEND ?? "ollama"}, model: ${process.env.OLLAMA_MODEL ?? "llama3.2:3b"}\n` +
    `Terminal mode. Type your message, or "exit" to quit.\n`
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("line", (line) => {
    const input = line.trim();
    if (!input) return;
    if (input === "exit" || input === "quit") { rl.close(); process.exit(0); }
    agent.handle(input).catch((e) => console.error(`ERROR: ${(e as Error).message}`));
  });
  if (process.env.WATCHDOG === "on") startWatchdog(agent);
}

main();
