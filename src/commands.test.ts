import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand, findCommand, commandCatalogPrompt, commands, fmtCoins } from "./commands.js";

test("parseCommand extracts name and args", () => {
  const p = parseCommand("!ban @user spamming");
  assert.ok(p);
  assert.equal(p.name, "ban");
  assert.equal(p.args.length, 2);
});

test("parseCommand ignores non-commands", () => {
  assert.equal(parseCommand("hello there"), null);
  assert.equal(parseCommand("!"), null);
});

test("all four categories are covered", () => {
  const cats = new Set(commands.map((c) => c.category));
  for (const c of ["moderation", "fun", "economy", "games"]) assert.ok(cats.has(c as any), `missing ${c}`);
});

test("every command has usage and description", () => {
  for (const c of commands) {
    assert.ok(c.name && c.usage && c.description);
    assert.ok(c.usage.startsWith("!"));
  }
});

test("catalog prompt lists commands for the AI agent", () => {
  const p = commandCatalogPrompt();
  assert.ok(p.includes("!help"));
  assert.ok(p.includes("!ban"));
  assert.ok(p.includes("!daily"));
});

test("findCommand is case-insensitive", () => {
  assert.equal(findCommand("HELP")?.name, "help");
});

test("fmtCoins formats numbers", () => {
  assert.ok(fmtCoins(1234).includes("1,234"));
});
