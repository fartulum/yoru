import { Agent } from "./agent.js";

/**
 * Autonomous security watchdog: periodic patrols while you're away.
 * Alerts are sent to the owner's interface (terminal or Discord DM).
 * Runs only when WATCHDOG=on in .env.
 */

const INTERVAL_MS = Number(process.env.WATCHDOG_INTERVAL_MS ?? 15 * 60_000); // default 15 min
const LOG_LIMIT = 40;

const PATROL_PROMPTS = [
  // rotate: one patrol per tick, round-robin
];

function patrolPrompt(i: number): string {
  const patrols = [
    "Security patrol: check recent auth activity. Run the appropriate command for this OS (e.g. 'last -n 20' on Linux or 'query user' on Windows) and report ONLY anomalies (failed logins, unknown users, odd hours). If nothing unusual, reply briefly.",
    "Security patrol: check running processes for anything unexpected (keyloggers, unknown listeners). Use OS-appropriate commands (ps/ss on Linux, netstat/tasklist on Windows). Report only anomalies.",
    "Security patrol: check disk usage and whether any file in the vault directory changed recently. Report only anomalies.",
    "Security patrol: check for recent large/suspicious writes to your home directory (find -mmin). Report only anomalies.",
  ];
  return patrols[i % patrols.length];
}

export function startWatchdog(agent: Agent) {
  let tick = 0;
  console.log(`[watchdog] on — patrolling every ${Math.round(INTERVAL_MS / 60000)} min`);
  const run = async () => {
    try {
      const report = await agent.handle(patrolPrompt(tick++));
      if (!/no anomal|nothing usual|all clear|no anomalies/i.test(report)) {
        await agent.notify(`⚠️ [watchdog] ${report}`);
      }
    } catch (e) {
      console.error(`[watchdog] patrol failed: ${(e as Error).message}`);
    }
  };
  setTimeout(run, 30_000); // first patrol shortly after start
  setInterval(run, INTERVAL_MS);
}