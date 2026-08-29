import { describe, it, expect } from "node:test";
import assert from "node:assert/strict";
import { sanitizeReply } from "./sanitize.js";

describe("sanitizeReply", () => {
  it("strips a bash code fence wrapping the whole reply", () => {
    const raw = "```bash\nsudo apt update\nsudo apt upgrade -y\n```";
    assert.equal(sanitizeReply(raw), "sudo apt update\nsudo apt upgrade -y");
  });

  it("strips a bare code fence with no language tag", () => {
    assert.equal(sanitizeReply("```\nhello there\n```"), "hello there");
  });

  it("leaves plain prose untouched", () => {
    assert.equal(sanitizeReply("All clear, nothing suspicious on the box."), 
      "All clear, nothing suspicious on the box.",
    );
  });

  it("removes lines quoting the agent's own instructions", () => {
    const raw = "Sure, here you go.\nAs per config/instructions.md I must keep it tight.\nDone.";
    assert.equal(sanitizeReply(raw), "Sure, here you go.\nDone.");
  });

  it("keeps a fenced block that is only part of the reply", () => {
    const raw = "Try this command:\n```\nls -la\n```\nIt lists everything.";
    assert.equal(sanitizeReply(raw), raw);
  });

  it("strips zero-width and invisible Unicode characters", () => {
    const raw = "invis\u200Bible\u202Etext\uFEFF here";
    assert.equal(sanitizeReply(raw), "invisible text here");
  });

  it("strips invisible characters even inside a fenced reply", () => {
    const raw = "```\nwa\u200Btermark\n```";
    assert.equal(sanitizeReply(raw), "watermark");
  });
});