/**
 * Reply sanitizer: hard guarantees applied to every final reply,
 * independent of what the LLM produces.
 *  - strips markdown code fences wrapping the whole reply (```bash ... ```)
 *  - redacts lines that quote the agent's own instructions/config
 */
const INSTRUCTION_MARKERS = [
  "config/instructions.md",
  "config/persona.md",
  "standing orders",
  "system prompt",
  "your instructions",
  "my instructions are",
];

export function sanitizeReply(reply: string): string {
  let out = reply.trim();

  // Remove a code fence wrapping the entire reply (with optional language tag).
  const fence = /^```[\w-]*\n([\s\S]*?)\n```$/m.exec(out);
  if (fence) out = fence[1].trim();

  // Drop any line that quotes the agent's own instructions or config.
  out = out
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !INSTRUCTION_MARKERS.some((m) => lower.includes(m));
    })
    .join("\n");

  return out.trim();
}