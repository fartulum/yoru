import { createInterface } from "node:readline";
import { loadEnvFile } from "./llm.js";
import { Agent } from "./agent.js";
import { startWatchdog } from "./watchdog.js";
import { startPanel, setPanelState } from "./panel.js";
import { logAudit } from "./audit.js";
import { playRobotBanner } from "./banner.js";

loadEnvFile();

const OWNER_DISCORD_IDS = (process.env.OWNER_DISCORD_IDS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

// Minimal ANSI color helpers (no dependencies). Colors are disabled
// automatically when the terminal doesn't support them (NO_COLOR, or a
// non-TTY stdout, e.g. piped output).
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const cyan = (s: string) => c("36", s);
const magenta = (s: string) => c("35", s);
const green = (s: string) => c("32", s);
const yellow = (s: string) => c("33", s);
const red = (s: string) => c("31", s);
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);

async function main() {
  const mode = process.argv[2] ?? "chat";
  const name = process.env.PERSONA_NAME ?? "Yoru";

  if (mode === "discord" || process.env.DISCORD_TOKEN) {
    startPanel();
    const { startDiscord } = await import("./discord.js");
    playRobotBanner(true, `${bold(cyan(`${name} — Discord mode`))} ${dim("— colored ASCII robot online")}`);
    await startDiscord(OWNER_DISCORD_IDS);
    return; // discord.ts keeps the process alive
  }

  // terminal mode
  startPanel();
  playRobotBanner(false, `${name} (yoru-lite v0.4) — ASCII robot online`);
  const confirm = (q: string) =>
    new Promise<boolean>((res) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`${yellow("?")} ${q} `, (a) => { rl.close(); res(/^y(es)?$/i.test(a.trim())); });
    });
  const agent = new Agent({ owner: true, sender: "terminal", confirm, say: async (t) => console.log(t) });
  logAudit({ time: new Date().toISOString(), actor: "terminal", action: "session_start" });
  setPanelState({ name, status: "idle", activity: "Terminal session started" });
  console.log(
    `${bold(cyan(`${name} (yoru-lite v0.4)`))} ${dim("—")} backend: ${magenta(process.env.LLM_BACKEND ?? "ollama")}, model: ${magenta(process.env.OLLAMA_MODEL ?? "llama3.2:3b")}\n` +
    `${dim(`Visual panel: http://localhost:${process.env.PANEL_PORT ?? 4173}`)}\n` +
    `${dim(`Type your message, or ${bold("exit")} to quit.`)}\n`
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("line", (line) => {
    const input = line.trim();
    if (!input) return;
    if (input === "exit" || input === "quit") { rl.close(); process.exit(0); }
    // Stream the reply live: tokens print as they arrive from the LLM.
    let streamed = false;
    process.stdout.write(`${bold(green(`${name}:`))} `);
    agent.handle(input, (token) => { streamed = true; process.stdout.write(cyan(token)); })
      .then((reply) => {
        if (!streamed) process.stdout.write(cyan(reply)); // non-streaming backends
        process.stdout.write("\n\n");
      })
      .catch((e) => console.error(`${red("ERROR:")} ${(e as Error).message}\n`));
  });
  if (process.env.WATCHDOG === "on") startWatchdog(agent);
}

main();