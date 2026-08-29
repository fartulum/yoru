/**
 * Animated ASCII robot banner for the terminal.
 * Plain (chat mode) or colored (discord mode). No dependencies.
 */

export const ROBOT_FRAMES = [
  String.raw`
     [■■■■■■■■■■]
    [  Y O R U  ]
     [■■■■■■■■■■]
        \ (^‿^) /
        |  ___  |
       /| |   | |\
      d | |___| | b
        |  U U  |
       /|       |\
      d |  ___  | b
        |_|   |_|
`,
  String.raw`
     [■■■■■■■■■■]
    [  Y O R U  ]
     [■■■■■■■■■■]
        \ (⌐■_■) /
        |  ___  |
       /| |   | |\
      d | |___| | b
        |  U U  |
       /|       |\
      d |  ___  | b
        |_|   |_|
`,
  String.raw`
     [■■■■■■■■■■]
    [  Y O R U  ]
     [■■■■■■■■■■]
        \ (o‿o) /
        |  ___  |
       /| |   | |\
      d | |___| | b
        |  U U  |
       /|       |\
      d |  ___  | b
        |_|   |_|
`,
  String.raw`
     [■■■■■■■■■■]
    [  Y O R U  ]
     [■■■■■■■■■■]
        \ (^o^) /
        |  ___  |
       /| |   | |\
      d | |___| | b
        |  U U  |
       /|       |\
      d |  ___  | b
        |_|   |_|
`,
];

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const c = (code: string, s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const cyan = (s: string) => c("36", s);
const magenta = (s: string) => c("35", s);
const green = (s: string) => c("32", s);
const yellow = (s: string) => c("33", s);
const bold = (s: string) => c("1", s);
const dim = (s: string) => c("2", s);

function colorize(frame: string): string {
  return frame
    .split("\n")
    .map((line) => {
      if (line.includes("Y O R U")) return bold(magenta(line));
      if (line.includes("■")) return cyan(line);
      if (/\(\S+‿?\S*\)|\(o‿o\)|\(⌐■_■\)/.test(line)) return green(line);
      return yellow(line);
    })
    .join("\n");
}

/**
 * Play the animated banner once (~1.2s), then leave the final frame on screen.
 * Set `colored` to true for the discord mode (ANSI colors), false for chat mode.
 */
export function playRobotBanner(colored: boolean, subtitle?: string): void {
  if (!useColor) {
    // No TTY: print a single static frame, no animation.
    console.log(ROBOT_FRAMES[0]);
    if (subtitle) console.log(subtitle);
    return;
  }
  const frames = colored ? ROBOT_FRAMES.map(colorize) : ROBOT_FRAMES;
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const frame = frames[i % frames.length];
    process.stdout.write("\x1b[2J\x1b[H" + frame + "\n");
    // busy-wait ~150ms without blocking the event loop excessively
    const until = Date.now() + 150;
    while (Date.now() < until) { /* sync pause */ }
  }
  process.stdout.write("\x1b[2J\x1b[H" + frames[0] + "\n");
  if (subtitle) console.log(colored ? bold(cyan(subtitle)) : subtitle);
}