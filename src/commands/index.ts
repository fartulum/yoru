import { PermissionFlagsBits, type Message } from "discord.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { moderationCommands } from "./moderation.js";
import { adminCommands } from "./admin.js";
import { funCommands } from "./fun.js";
import { economyCommands } from "./economy.js";
import { gameCommands } from "./games.js";
import { utilityCommands } from "./utility.js";
import { verifyCommands } from "./verify.js";

/**
 * Command registry + persistent state (economy, warns, levels, config, snipes).
 * Prefix commands run WITHOUT pinging the AI agent — the messageCreate handler
 * checks the prefix first and never forwards those messages to the LLM.
 */

export interface EcoAccount {
  balance: number;
  bank?: number;
  lastDaily?: number;
  lastWeekly?: number;
  lastMonthly?: number;
  workCooldown: number;
  crimeCooldown?: number;
  stealCooldown?: number;
  fishCooldown?: number;
  huntCooldown?: number;
  digCooldown?: number;
  items?: string[];
}

export interface WarnEntry { by: string; reason: string; at: number }

/** Per-command owner overrides, editable from the owner web panel. */
export interface CommandOverride {
  enabled: boolean;
}

/** Economy tuning knobs, editable from the owner web panel. */
export interface EconomySettings {
  dailyReward: number;
  weeklyReward: number;
  monthlyReward: number;
  workMin: number;
  workMax: number;
  workCooldownMin: number;
  crimeCooldownMs: number;
  stealCooldownMs: number;
  fishCooldownMs: number;
  huntCooldownMs: number;
  digCooldownMs: number;
  lotteryTicket: number;
  bankInterest: number;
}

export interface VerifyRecord { username: string; at: number }

export interface VerifyConfig {
  enabled: boolean;
  roleId?: string;
  logChannelId?: string;
  verified: Record<string, VerifyRecord>;
}

export interface CommandContext {
  msg: Message;
  isOwner: boolean;
  args: string[];
  prefix: string;
  allCommands(): BotCommand[];
  eco(id: string): EcoAccount;
  saveEco(): void;
  topBalances(): string[];
  shopItems(): { emoji: string; name: string; price: number; desc: string }[];
  warns(id: string): WarnEntry[];
  saveWarns(): void;
  clearWarns(id: string): void;
  level(id: string): { level: number; xp: number };
  addXp(id: string, n: number): void;
  topLevels(): string[];
  counter(): number;
  setCounter(n: number): void;
  setPrefix(p: string): void;
  setWelcome(t: string): void;
  setGoodbye(t: string): void;
  setAutoRole(id: string): void;
  setWarnThreshold(n: number): void;
  setAfk(id: string, reason: string): void;
  afkList(): string[];
  addQuote(q: string): void;
  randomQuote(): string | undefined;
  addTodo(id: string, t: string): void;
  todos(id: string): string[];
  removeTodo(id: string, i: number): boolean;
  snipe(channelId: string): { author: string; content: string } | undefined;
  editSnipe(channelId: string): { author: string; content: string } | undefined;
  recordSnipe(channelId: string, s: { author: string; content: string }): void;
  recordEditSnipe(channelId: string, s: { author: string; content: string }): void;
  // verification
  verifyConfig(guildId: string): VerifyConfig;
  setVerifyRole(roleId: string): void;
  setVerifyEnabled(on: boolean): void;
  setVerifyLog(channelId: string): void;
  markVerified(userId: string): void;
  logVerify(userId: string, username: string): void;
}

export interface BotCommand {
  name: string;
  category: "moderation" | "admin" | "fun" | "economy" | "games" | "utility" | "info" | "core";
  description: string;
  usage: string;
  perm?: bigint;
  modOnly?: boolean;
  run: (ctx: CommandContext) => Promise<void>;
}

export const commands: BotCommand[] = [
  ...moderationCommands,
  ...adminCommands,
  ...funCommands,
  ...economyCommands,
  ...gameCommands,
  ...utilityCommands,
  ...verifyCommands,
];

export function findCommand(name: string): BotCommand | undefined {
  const lower = name.toLowerCase();
  return commands.find((c) => c.name === lower);
}

/**
 * Commands with the owner's overrides applied (enabled flag).
 * Used by the message handler and exposed to the owner web panel.
 */
export function effectiveCommands(state: BotState): BotCommand[] {
  return commands.filter((c) => state.commandOverrides[c.name]?.enabled !== false);
}

export function commandOverrideFor(state: BotState, name: string): CommandOverride {
  return state.commandOverrides[name] ?? { enabled: true };
}

export const DEFAULT_ECONOMY: EconomySettings = {
  dailyReward: 250,
  weeklyReward: 1000,
  monthlyReward: 5000,
  workMin: 20,
  workMax: 80,
  workCooldownMin: 60,
  crimeCooldownMs: 300_000,
  stealCooldownMs: 300_000,
  fishCooldownMs: 900_000,
  huntCooldownMs: 900_000,
  digCooldownMs: 600_000,
  lotteryTicket: 100,
  bankInterest: 1.02,
};

export function parseCommand(content: string, prefix: string): { name: string; args: string[] } | null {
  const trimmed = content.trim();
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const parts = trimmed.slice(prefix.length).trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

/** Markdown summary of all commands, injected into the AI agent's system prompt. */
export function commandCatalogPrompt(prefix = "!"): string {
  const byCat = new Map<string, BotCommand[]>();
  for (const c of commands) byCat.set(c.category, [...(byCat.get(c.category) ?? []), c]);
  const sections = [...byCat.entries()].map(([cat, cmds]) => {
    const lines = cmds.map((c) => `- ${prefix}${c.name.replace(/^!/, "")}: ${c.description}${c.perm ? " (requires permission)" : ""}`);
    return `## ${cat} (${cmds.length})\n${lines.join("\n")}`;
  });
  return `\n# Discord commands available\nThe bot you speak through has ${commands.length} prefix commands. When a user asks what commands exist, list them by category (moderation, admin, fun, economy, games, utility, info). Prefix commands run instantly without you — tell users to just type them, e.g. ${prefix}daily. Full list:\n${sections.join("\n")}\n`;
}

/* ---------------- persistent state ---------------- */

const DATA_DIR = join(process.cwd(), "data");

function loadJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function saveJson(file: string, data: unknown) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

export interface BotState {
  eco: Record<string, EcoAccount>;
  warns: Record<string, WarnEntry[]>;
  levels: Record<string, number>;
  counters: Record<string, number>;
  guildConfig: Record<string, { prefix?: string; welcome?: string; goodbye?: string; autoRole?: string; warnThreshold?: number }>;
  afk: Record<string, string>;
  quotes: Record<string, string[]>;
  todos: Record<string, string[]>;
  snipes: Record<string, { author: string; content: string }>;
  editSnipes: Record<string, { author: string; content: string }>;
  commandOverrides: Record<string, CommandOverride>;
  economy: EconomySettings;
  verify: Record<string, VerifyConfig>;
}

export function loadState(): BotState {
  return {
    eco: loadJson("economy.json", {}),
    warns: loadJson("warns.json", {}),
    levels: loadJson("levels.json", {}),
    counters: loadJson("counters.json", {}),
    guildConfig: loadJson("guild_config.json", {}),
    afk: loadJson("afk.json", {}),
    quotes: loadJson("quotes.json", {}),
    todos: loadJson("todos.json", {}),
    snipes: {},
    editSnipes: {},
    commandOverrides: loadJson("command_overrides.json", {}),
    economy: { ...DEFAULT_ECONOMY, ...loadJson("economy_settings.json", {}) },
    verify: loadJson("verify.json", {}),
  };
}

export function saveState(state: BotState) {
  saveJson("economy.json", state.eco);
  saveJson("warns.json", state.warns);
  saveJson("levels.json", state.levels);
  saveJson("counters.json", state.counters);
  saveJson("guild_config.json", state.guildConfig);
  saveJson("afk.json", state.afk);
  saveJson("quotes.json", state.quotes);
  saveJson("todos.json", state.todos);
  saveJson("command_overrides.json", state.commandOverrides);
  saveJson("economy_settings.json", state.economy);
  saveJson("verify.json", state.verify);
}

export function getAccount(state: BotState, id: string): EcoAccount {
  if (!state.eco[id]) state.eco[id] = { balance: 100, lastDaily: 0, workCooldown: 0 };
  return state.eco[id];
}

export const SHOP_ITEMS = [
  { emoji: "🎩", name: "Top Hat", price: 500, desc: "Look fancy in chat." },
  { emoji: "🦖", name: "Pet Dino", price: 1500, desc: "A loyal (plush) companion." },
  { emoji: "🚀", name: "Rocket Ride", price: 3000, desc: "One trip to the moon." },
  { emoji: "👑", name: "Crown", price: 10000, desc: "Flex on the leaderboard." },
  { emoji: "🏆", name: "Trophy", price: 25000, desc: "The ultimate status symbol." },
];

export function isModerator(msg: Message, isOwner: boolean): boolean {
  if (isOwner) return true;
  const member = msg.member;
  if (!member) return false;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) || member.permissions.has(PermissionFlagsBits.Administrator);
}