import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isWindows, homeRelative } from "./index.js";

test("isWindows matches process.platform", () => {
  assert.equal(isWindows(), process.platform === "win32");
});

test("homeRelative expands ~/ against the home directory", () => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const expected = join(home, "vault");
  assert.equal(homeRelative("~/vault"), expected);
});

test("homeRelative expands a bare ~ to the home directory", () => {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  assert.equal(homeRelative("~"), home);
});

test("homeRelative leaves absolute and relative paths untouched", () => {
  assert.equal(homeRelative("/etc/passwd"), "/etc/passwd");
  assert.equal(homeRelative("data/memory.md"), "data/memory.md");
});

test("homeRelative does not treat ~-prefixed names as home paths", () => {
  // Regression: "~notes" used to be expanded to <home>/notes, silently
  // reading/writing the wrong file.
  assert.equal(homeRelative("~notes"), "~notes");
  assert.equal(homeRelative("~backup.txt"), "~backup.txt");
});

test("package.json version is valid semver (banner source of truth)", () => {
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(version, /^\d+\.\d+\.\d+$/);
});