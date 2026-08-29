import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = "data";
const AUDIT_LOG = join(DATA_DIR, "audit.log");
const KILLSWITCH_FILE = join(DATA_DIR, "KILLSWITCH");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);

export interface AuditEvent {
  time: string;
  actor: string; // "terminal" | "discord:<id>"
  action: string; // tool name or lifecycle event
  detail?: string;
  allowed?: boolean;
}

/** Append one JSONL line to the audit log. Never throws. */
export function logAudit(e: AuditEvent): void {
  try {
    appendFileSync(AUDIT_LOG, JSON.stringify(e) + "\n");
  } catch {
    /* audit must never break the agent */
  }
}

/** Read the last N audit entries (for the panel / audit tool). */
export function readAudit(n = 50): AuditEvent[] {
  if (!existsSync(AUDIT_LOG)) return [];
  try {
    return readFileSync(AUDIT_LOG, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try { return JSON.parse(l) as AuditEvent; } catch { return null; }
      })
      .filter((x): x is AuditEvent => x !== null)
      .slice(-n);
  } catch {
    return [];
  }
}

/* ---------------- kill switch ---------------- */

/** Arm the kill switch: blocks every tool except the recovery ones. */
export function armKillSwitch(): void {
  writeFileSync(KILLSWITCH_FILE, new Date().toISOString());
}

/** Disarm the kill switch. */
export function disarmKillSwitch(): void {
  if (existsSync(KILLSWITCH_FILE)) rmSync(KILLSWITCH_FILE);
}

export function isKilled(): boolean {
  return existsSync(KILLSWITCH_FILE);
}
