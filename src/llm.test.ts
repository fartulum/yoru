import { describe, it, expect } from "vitest";
import { trimHistory, HISTORY_LIMIT, type ChatMessage } from "../llm.js";

function msg(role: ChatMessage["role"], content: string): ChatMessage {
  return { role, content };
}

describe("trimHistory", () => {
  it("returns the array unchanged when at or under the limit", () => {
    const h = [msg("system", "sys"), msg("user", "hi"), msg("assistant", "hello")];
    expect(trimHistory(h)).toEqual(h);
  });

  it("keeps only the last HISTORY_LIMIT messages when over", () => {
    const h: ChatMessage[] = [msg("system", "sys")];
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h.push(msg("user", `m${i}`));
    const trimmed = trimHistory(h);
    expect(trimmed.length).toBe(HISTORY_LIMIT);
    expect(trimmed[trimmed.length - 1].content).toBe(`m${HISTORY_LIMIT + 9}`);
  });

  it("never returns an empty array", () => {
    expect(trimHistory([])).toEqual([]);
  });
});