/**
 * Animated ASCII robot banner for the terminal.
 * Plain (chat mode) or colored (discord mode). No dependencies.
 *
 * The animation ALWAYS plays, even when stdout is not a TTY (e.g. piped
 * output). Colors are still auto-disabled when the terminal doesn't
 * support them (NO_COLOR, or a non-TTY stdout).
 */

export const ROBOT_FRAMES = [
  String.raw`
  ┌─────────────────┐
   [ Y O R U ]
  ┌─────────────────┐
      \ (^_^) /
      |  ___  |
     /| |   | |\
     d | ___ | b
     |  U U  |
    /|       |\
    d |  ___  | b
     |_|   |_|
`,
  String.raw`
  ┌─────────────────┐
   [ Y O R U ]
  ┌─────────────────┐
      \ (◕‿◕) /
      |  ___  |
     /| |   | |\
     d | ___ | b
     |  U U  |
    /|       |\
    d |  ___  | b
     |_|   |_|
`,
  String.raw`
  ┌─────────────────┐
   [ Y O R U ]
  ┌─────────────────┐
      \ (¬‿¬) /
      |  ___  |
     /| |   | |\
     d | ___ | b
     |  U U  |
    /|       |\
    d |  ___  | b
     |_|   |_|
`,
  String.raw`
  ┌─────────────────┐
   [ Y O R U ]
  ┌─────────────────┐
      \ ( ^ ) /
      |  ___  |
     /| |   | |\
     d | ___ | b
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
      if (line.includes("┌")) return cyan(line);
      if (/\(\s*_+?\s*\)|\(o\/o\)|\( \^ \)/.test(line)) return green(line);
      return yellow(line);
    })
    .join("\n");
}

/**
 * Play the animated banner.
 * - Default: play once (~1.2s), then leave the final frame on screen (chat mode).
 * - `loop: true`: repeat forever on a non-blocking interval, so the animation
 *   never stops and the event loop stays free for the Discord client.
 */
export function playRobotBanner(
  colored: boolean,
  subtitle?: string,
  loop = false,
): void {
  const frames = colored ? ROBOT_FRAMES.map(colorize) : ROBOT_FRAMES;
  const FRAME_MS = 150;

  // Number of terminal lines one frame occupies (leading newline included).
  const frameLines = frames[0].split("\n").length;

  // Redraw ONLY the banner's own lines: move the cursor back up to the top
  // of the frame and clear each line. Never clear the whole screen, so any
  // text printed after the banner (startup logs, subtitles) stays visible.
  const draw = (i: number) => {
    const frame = frames[i % frames.length];
    process.stdout.write(`\x1b[${frameLines}F` + "\x1b[2K".repeat(frameLines) + frame + "\n");
  };

  if (loop) {
    // Print the first frame normally, then redraw in place forever.
    process.stdout.write(frames[0] + "\n");
    let i = 1;
    const timer = setInterval(() => {
      i++;
      draw(i);
    }, FRAME_MS);
    // never let the banner timer keep the process alive on its own
    timer.unref?.();
    if (subtitle) console.log(subtitle);
    return;
  }

  // one-shot: play each frame once, then keep the final frame on screen
  for (let i = 0; i < frames.length; i++) {
    draw(i);
    const until = Date.now() + FRAME_MS;
    while (Date.now() < until) { /* sync pause */ }
  }
  if (subtitle) console.log(subtitle);
}