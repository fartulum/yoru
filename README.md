# yoru-lite v0.2

Self-hosted personal AI agent: **terminal + Discord dual interface**, one shared brain,
tools, persistent memory, and an autonomous security watchdog. Runs on Parrot OS and
Windows (Node-based, no porting). Local models via Ollama by default, or any
OpenAI-compatible API.

## What's in v0.2 (over v0.1)
- **Dual interface**: `npm run chat` (terminal) and `npm run discord` (official bot).
  Both share persona, instructions, and memory.
- **Hardened shell**: cross-platform (bash on Linux, cmd on Windows), 60s timeout,
  and a **confirmation gate** — destructive commands (rm -rf, mkfs, dd, shutdown…)
  require an explicit owner yes before running.
- **File index**: "where is X" / "list my Y files" — indexes your home dir (configurable).
- **Scoped lockdown**: `lockdown` AES-256-GCM encrypts **only `~/vault`**, hands you a
  recovery key; `unlock` reverses it. It refuses anything outside the vault. For
  full-disk protection use LUKS (Parrot) or BitLocker (Windows) — better and one-time.
- **Owner-only lookup index**: drop your own CSV/TXT files in `data/lookups/`, then
  "lookup <name>" searches them. Owner-only; guests never get it.
- **Watchdog (autonomy)**: `WATCHDOG=on` patrols every 15 min (auth logs, processes,
  vault changes) and DMs you on Discord **only when something is off**.
- **config/instructions.md**: your standing-orders file — edit it to reshape the
  agent's behavior; it's loaded at every start.

## Setup (15 min)
1. **Node.js 20+** — nodejs.org installer, keep defaults. Verify: `node -v`.
2. **Ollama** — ollama.com, install, then `ollama pull llama3.2:3b` (fits a 1660 Ti's 6 GB VRAM).
3. Unzip, `cd yoru-lite`, `npm install`.
4. `cp .env.example .env` — works as-is for terminal-only local use.

## Terminal mode
```
npm run chat
```

## Discord mode (official bot — never your account token)
1. discord.com/developers → New Application → Bot → **Reset Token** → copy it.
2. Enable **Message Content Intent** (Bot → Privileged Gateway Intents).
3. OAuth2 → URL generator: scopes `bot`, permissions Send Messages + Read Message History → open the URL to invite the bot.
4. In `.env`: set `DISCORD_TOKEN=...` and `OWNER_DISCORD_IDS=<your Discord user ID>`
   (Discord settings → Advanced → Developer Mode → right-click your name → Copy ID).
5. `npm run discord`

Owner (your ID in `OWNER_DISCORD_IDS`): full tools. Everyone else: chat only.

## Autonomy while you're away
In `.env`: `WATCHDOG=on` (and optionally `WATCHDOG_INTERVAL_MS=900000`).
Run `npm run discord` and leave it going — it patrols and DMs you on anomalies.

## Lockdown usage
```
mkdir -p ~/vault   # put sensitive files here
# tell the agent: "lockdown"  →  key saved to data/vault.key — COPY IT OFF-MACHINE
# later: "unlock <key>"
```
No key = no recovery. Treat `data/vault.key` like a password.

## Model size guide (RTX 1660 Ti, 6 GB VRAM)
| Model | VRAM | Quality |
|---|---|---|
| llama3.2:3b | ~4 GB | good default |
| qwen2.5:3b | ~4 GB | good at tools |
| llama3.1:8b (q4) | ~5.5 GB | better, tight fit |

Smarter brain: set `LLM_BACKEND=openai` + any OpenAI-compatible endpoint (Groq, OpenRouter…).

## Safety rails (by design)
- Destructive shell commands need owner confirmation.
- Lockdown is vault-scoped, never full-disk.
- Lookups and tools are owner-only; guests get conversation only.
- No third-party IP/location/breach lookups — not built in, by decision.

## v0.3 — coding & security toolkit
- `create_project`: ask the agent to build any program ("make me a Python 3.11 FPS optimizer") — it scaffolds complete, runnable code under `~/projects/<name>` (set `PROJECTS_DIR` to change).
- `malware_scan`: signature + heuristic scan (droppers, reverse shells, miners, keyloggers, obfuscated payloads), plus ClamAV/Defender pass if installed. Hits are **quarantined** in `data/quarantine`, never auto-deleted — you review and shred.
- `connections`: list active connections with owning processes; `baseline` once when clean, then `check` to flag unknown remote endpoints.
- `tor start|stop|status`: toggles the Tor daemon (Linux: `sudo apt install tor`; Windows: Tor Browser). Route per-command with `torsocks` or SOCKS5 127.0.0.1:9050.

## v0.4 — Discord remote control, kill switch, audit log, visual character

- **Kill switch** (owner-only): `kill_switch arm/disarm/status`. When armed, every tool is blocked except `unlock` and `kill_switch disarm`. One command freezes the agent instantly, from terminal or Discord.
- **Audit log**: every tool call is recorded (who, what, allowed/blocked) to `data/audit.log` (JSONL). Review with the `audit_log` tool or live in the panel.
- **Visual character panel**: run any mode and open `http://localhost:4173` (configurable via `PANEL_PORT`). An animated agent character shows live status (idle/thinking/working/alert), current activity, and a live audit feed. Works on Parrot OS and Windows.
- **Natural-language commands**: no slash or prefix commands anywhere. Ask the agent "what can you do", it lists its capabilities; then just tell it what you want ("run nmap on X", "check disk usage"). Owner Discord IDs get full tool access; everyone else is conversation-only.
- **Dangerous-command gate**: destructive shell patterns (rm -rf, mkfs, dd, shutdown...) always require an explicit "yes" from the owner, on terminal or Discord.
