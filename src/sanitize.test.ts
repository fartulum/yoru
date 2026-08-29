import { sanitizeReply } from "./sanitize";

describe("sanitizeReply", () => {
  it("strips a bash code fence wrapping the whole reply", () => {
    const raw = "```bash\nsudo apt update\nsudo apt upgrade -y\n```";
    expect(sanitizeReply(raw)).toBe("sudo apt update\nsudo apt upgrade -y");
  });

  it("strips a bare code fence with no language tag", () => {
    expect(sanitizeReply("```\nhello there\n```")).toBe("hello there");
  });

  it("leaves plain prose untouched", () => {
    expect(sanitizeReply("All clear, nothing suspicious on the box.")).toBe(
      "All clear, nothing suspicious on the box.",
    );
  });

  it("removes lines quoting the agent's own instructions", () => {
    const raw = "Sure, here you go.\nAs per config/instructions.md I must keep it tight.\nDone.";
    expect(sanitizeReply(raw)).toBe("Sure, here you go.\nDone.");
  });

  it("keeps a fenced block that is only part of the reply", () => {
    const raw = "Try this command:\n```\nls -la\n```\nIt lists everything.";
    expect(sanitizeReply(raw)).toBe(raw);
  });

  it("strips zero-width and invisible Unicode characters", () => {
    const raw = "invis\u200Bible\u202Etext\uFEFF here";
    expect(sanitizeReply(raw)).toBe("invisible text here");
  });

  it("strips invisible characters even inside a fenced reply", () => {
    const raw = "```\nwa\u200Btermark\n```";
    expect(sanitizeReply(raw)).toBe("watermark");
  });
});
