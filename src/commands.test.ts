import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand, findCommand, commandCatalogPrompt, commands, getAccount, loadState } from "./commands/index.js";
import { timeLeft } from "./commands/shared.js";
import { ROBOT_FRAMES } from "./banner.js";

test("parseCommand extracts name and args", () => {
  const p = parseCommand("!ban @user spamming", "!");
  assert.ok(p);
  assert.equal(p!.name, "ban");
  assert.equal(p!.args.length, 2);
});

test("parseCommand ignores non-commands", () => {
  assert.equal(parseCommand("hello there", "!"), null);
  assert.equal(parseCommand("!", "!"), null);
});

test("parseCommand supports custom prefixes", () => {
  const p = parseCommand("?daily", "?");
  assert.ok(p);
  assert.equal(p!.name, "daily");
});

test("all categories are covered", () => {
  const cats = new Set(commands.map((c) => c.category));
  for (const c of ["moderation", "admin", "fun", "economy", "games", "utility", "info", "core"] as const)
    assert.ok(cats.has(c), `missing ${c}`);
});

test("at least 120 commands exist", () => {
  assert.ok(commands.length >= 120, `only ${commands.length} commands`);
});

test("command names are unique", () => {
  const names = commands.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test("every command has usage and description", () => {
  for (const c of commands) {
    assert.ok(c.name && c.usage && c.description);
    assert.ok(c.usage.startsWith("!"), `usage of ${c.name} must start with !`);
  }
});

test("moderation commands declare permissions", () => {
  for (const c of commands.filter((x) => x.category === "moderation")) {
    assert.ok(c.perm || c.modOnly, `${c.name} must declare perm or modOnly`);
  }
});

test("catalog prompt lists commands for the AI agent", () => {
  const p = commandCatalogPrompt();
  assert.ok(p.includes("!help"));
  assert.ok(p.includes("!ban"));
  assert.ok(p.includes("!daily"));
  assert.ok(p.includes("economy"));
});

test("findCommand is case-insensitive", () => {
  assert.equal(findCommand("HELP")?.name, "help");
});

test("getAccount creates a starting account", () => {
  const s = loadState();
  const a = getAccount(s, "test-user");
  assert.equal(a.balance, 100);
  assert.equal(a.lastDaily, 0);
});

test("timeLeft shows 0m right after a cooldown starts", () => {
  assert.equal(timeLeft(30_000), "0m");
});

test("timeLeft floors partial minutes instead of rounding up", () => {
  assert.equal(timeLeft(59_000), "0m");
  assert.equal(timeLeft(60_000), "1m");
  assert.equal(timeLeft(90_000), "1m");
  assert.equal(timeLeft(3_600_000), "1h 0m");
  assert.equal(timeLeft(3_600_000 + 90_000), "1h 1m");
});

test("banner has animated frames", () => {
  assert.ok(ROBOT_FRAMES.length >= 3);
  for (const f of ROBOT_FRAMES) assert.ok(f.includes("Y O R U"));
});