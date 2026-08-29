import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { ToolDef } from "../llm.js";

const execAsync = promisify(exec);
const DATA_DIR = "data";
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);

export interface ToolContext {
  owner: boolean;
  sender: string;
  confirm: (question: string) => Promise<boolean>;
  say: (text: string) => Promise<void>;
}

export interface Tool {
  def: ToolDef;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
}

/* ---------------- safety helpers ---------------- */

const DESTRUCTIVE = /\b(rm\s+-[rf]|mkfs|dd\s+if=|:\(\)\{|shutdown|reboot|del\s+\/[fs]|format\s+[a-z]:|cipher\s+\/w|>\/dev\/sd|chmod\s+-R\s+777\s+\/|mv\s+\/|killall|kill\s+-9\s+1)\b/i;

function isWindows(): boolean {
  return process.platform === "win32";
}

function homeRelative(p: string): string {
  const h = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return p.startsWith("~/") ? join(h, p.slice(2)) : p;
}

/* ---------------- tools ---------------- */

const shell: Tool = {
  def: {
    type: "function",
    function: {
      name: "shell",
      description:
        "Run a shell command on this machine and return stdout/stderr. Works on Linux (Parrot) and Windows (cmd/PowerShell via cmd /c). Destructive commands require owner confirmation.",
      parameters: {
        type: "object",
        properties: { command: { type: "string" }, description: { type: "string", description: "What this command does, one line" } },
        required: ["command"],
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: shell access is owner-only.";
    const command = String(args.command);
    if (DESTRUCTIVE.test(command) || /lockdown|encrypt/i.test(command)) {
      const ok = await ctx.confirm(
        `⚠️ Destructive/sensitive command requested:\n  ${command}\nRun it? (y/n)`,
      );
      if (!ok) return "Blocked: owner declined the command.";
    }
    try {
      const finalCmd = isWindows() ? command : ["/bin/bash", "-lc", command].slice(0, 3).length === 3 ? command : command;
      const { stdout, stderr } = await execAsync(finalCmd, {
        timeout: 60_000,
        maxBuffer: 4 << 20,
        shell: isWindows() ? "cmd.exe" : "/bin/bash",
      });
      return (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).slice(0, 4000) || "(no output)";
    } catch (e) {
      return `ERROR: ${(e as Error).message}`.slice(0, 2000);
    }
  },
};

const readFile: Tool = {
  def: {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a text file from disk.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: file reads are owner-only.";
    try {
      return readFileSync(homeRelative(String(args.path)), "utf8").slice(0, 8000);
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
  },
};

const writeFile: Tool = {
  def: {
    type: "function",
    function: {
      name: "write_file",
      description: "Write (create or overwrite) a text file.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: file writes are owner-only.";
    try {
      writeFileSync(homeRelative(String(args.path)), String(args.content));
      return `Wrote ${String(args.path)}`;
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
  },
};

const fetchPage: Tool = {
  def: {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Fetch a URL and return the response body as text (first 6000 chars).",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  async run(args) {
    try {
      const res = await fetch(String(args.url), { headers: { "User-Agent": "yoru-lite/0.2" } });
      const text = await res.text();
      return text.slice(0, 6000);
    } catch (e) {
      return `ERROR: ${(e as Error).message}`;
    }
  },
};

const MEMORY_FILE = join(DATA_DIR, "memory.md");

const remember: Tool = {
  def: {
    type: "function",
    function: {
      name: "remember",
      description: "Save a durable fact to long-term memory (append-only).",
      parameters: {
        type: "object",
        properties: { note: { type: "string" } },
        required: ["note"],
      },
    },
  },
  async run(args) {
    appendFileSync(MEMORY_FILE, `- ${new Date().toISOString().slice(0, 10)} ${String(args.note)}\n`);
    return "Saved.";
  },
};

/* ------------ file index ("where is X") ------------ */

const INDEX_FILE = join(DATA_DIR, "file-index.json");

interface IndexEntry { path: string; size: number; mtime: string }

function buildIndex(roots: string[], maxFiles = 20000): IndexEntry[] {
  const out: IndexEntry[] = [];
  const skip = new Set(["node_modules", ".git", ".cache", "AppData", "proc", "sys", "dev", "run"]);
  const walk = (dir: string) => {
    if (out.length >= maxFiles) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      if (skip.has(e.name)) continue;
      const p = join(dir, e.name);
      try {
        if (e.isDirectory()) walk(p);
        else if (e.isFile()) {
          const s = statSync(p);
          out.push({ path: p, size: s.size, mtime: s.mtime.toISOString().slice(0, 10) });
        }
      } catch { /* unreadable — skip */ }
    }
  };
  for (const r of roots) walk(homeRelative(r));
  return out;
}

const fileIndex: Tool = {
  def: {
    type: "function",
    function: {
      name: "file_index",
      description:
        "Index files under configured roots (default: home directory) and search by name pattern. Use to answer 'where is X' or 'list my Y files'. Re-index with rebuild=true.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "case-insensitive substring of the filename" },
          rebuild: { type: "boolean" },
        },
        required: ["pattern"],
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: file index is owner-only.";
    const roots = (process.env.INDEX_ROOTS ?? "~/").split(",").map((s) => s.trim()).filter(Boolean);
    let index: IndexEntry[];
    if (args.rebuild || !existsSync(INDEX_FILE)) {
      index = buildIndex(roots);
      writeFileSync(INDEX_FILE, JSON.stringify(index));
    } else {
      index = JSON.parse(readFileSync(INDEX_FILE, "utf8")) as IndexEntry[];
    }
    const pat = String(args.pattern).toLowerCase();
    const hits = index.filter((e) => basename(e.path).toLowerCase().includes(pat)).slice(0, 40);
    return `Indexed ${index.length} files under [${roots.join(", ")}]. Matches for '${args.pattern}':\n` +
      (hits.map((h) => `${h.path} (${(h.size / 1024).toFixed(0)} KB, ${h.mtime})`).join("\n") || "(none)");
  },
};

/* ------------ scoped lockdown (vault encryption) ------------ */

const VAULT_DEFAULT = "~/vault";
const KEY_FILE = join(DATA_DIR, "vault.key"); // owner copies this somewhere safe after each lockdown

function walkFiles(dir: string, out: string[] = []): string[] {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.isFile() && !p.endsWith(".enc")) out.push(p);
  }
  return out;
}

const lockdown: Tool = {
  def: {
    type: "function",
    function: {
      name: "lockdown",
      description:
        "OWNER ONLY. Encrypt every file inside the designated vault directory (default ~/vault) with AES-256-GCM. Refuses anything outside the vault. Returns the recovery key location. Use unlock with the key to reverse.",
      parameters: {
        type: "object",
        properties: { directory: { type: "string", description: "defaults to ~/vault" } },
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: lockdown is owner-only.";
    const vault = resolve(homeRelative(String(args.directory ?? VAULT_DEFAULT)));
    const allowedRoot = resolve(homeRelative(VAULT_DEFAULT));
    if (!vault.startsWith(allowedRoot)) {
      return `REFUSED: lockdown only operates inside ${allowedRoot}. Full-disk encryption should be done once with LUKS (Linux) or BitLocker (Windows) — ask me for the commands.`;
    }
    if (!existsSync(vault)) return `Vault directory ${vault} does not exist. Create it and move files in first.`;
    const ok = await ctx.confirm(`⚠️ Lockdown: encrypt ALL files in ${vault}? You will get one recovery key.`);
    if (!ok) return "Cancelled.";
    const key = randomBytes(32);
    writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
    const files = walkFiles(vault);
    for (const f of files) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = readFileSync(f);
      const enc = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
      writeFileSync(`${f}.enc`, Buffer.concat([iv, enc]));
      writeFileSync(f, ""); // zero out original content
    }
    return `Locked ${files.length} files in ${vault}. Recovery key saved to ${KEY_FILE} — COPY IT SOMEWHERE SAFE NOW (USB, password manager). Without it the data is unrecoverable. Run 'unlock' with the key to decrypt.`;
  },
};

const unlock: Tool = {
  def: {
    type: "function",
    function: {
      name: "unlock",
      description: "OWNER ONLY. Decrypt .enc files in the vault using the recovery key (base64).",
      parameters: {
        type: "object",
        properties: { key: { type: "string", description: "base64 recovery key" }, directory: { type: "string" } },
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: unlock is owner-only.";
    const vault = resolve(homeRelative(String(args.directory ?? VAULT_DEFAULT)));
    const allowedRoot = resolve(homeRelative(VAULT_DEFAULT));
    if (!vault.startsWith(allowedRoot)) return "REFUSED: outside the vault.";
    let key: Buffer;
    try { key = Buffer.from(String(args.key).trim(), "base64"); } catch { return "ERROR: key is not valid base64."; }
    if (key.length !== 32) return "ERROR: key must decode to 32 bytes — wrong key?";
    let done = 0, failed = 0;
    const encFiles: string[] = [];
    const collect = (dir: string) => {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) collect(p);
        else if (e.name.endsWith(".enc")) encFiles.push(p);
      }
    };
    collect(vault);
    for (const f of encFiles) {
      try {
        const blob = readFileSync(f);
        const iv = blob.subarray(0, 12);
        const tag = blob.subarray(blob.length - 16);
        const body = blob.subarray(12, blob.length - 16);
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(body), decipher.final()]);
        writeFileSync(f.slice(0, -4), dec);
        done++;
      } catch { failed++; }
    }
    return failed
      ? `Decrypted ${done}, FAILED ${failed} (wrong key for those files).`
      : `Unlocked ${done} files in ${vault}.`;
  },
};

/* ------------ owner-only lookup index (PDF/CSV) ------------ */

const LOOKUP_DIR = () => process.env.LOOKUP_DIR ?? "data/lookups";
const LOOKUP_INDEX = join(DATA_DIR, "lookup-index.json");

interface LookupRow { source: string; fields: Record<string, string> }

function parseCsv(text: string): LookupRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = l.split(",");
    const fields: Record<string, string> = {};
    header.forEach((h, i) => (fields[h] = (cells[i] ?? "").trim()));
    return { source: "csv", fields };
  });
}

function parsePdfText(text: string): LookupRow[] {
  // crude line-based parse: "id | username | ip | location | isp" or comma/tab separated
  const rows: LookupRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/\s*[|,\t]\s*/).filter(Boolean);
    if (cells.length >= 2) {
      const fields: Record<string, string> = {};
      ["id", "username", "ip", "location", "isp"].forEach((k, i) => {
        if (cells[i] !== undefined) fields[k] = cells[i];
      });
      rows.push({ source: "pdf", fields });
    }
  }
  return rows;
}

const lookup: Tool = {
  def: {
    type: "function",
    function: {
      name: "lookup",
      description:
        "OWNER ONLY. Search the local lookup index built from the owner's own files (CSV/PDF placed in the lookups folder). Matches a username or ID and returns the stored fields. Not available to other users.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "username or ID to search" }, rebuild: { type: "boolean" } },
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: lookups are owner-only.";
    const dir = LOOKUP_DIR();
    let rows: LookupRow[];
    if (args.rebuild || !existsSync(LOOKUP_INDEX)) {
      rows = [];
      if (existsSync(dir)) {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (extname(f).toLowerCase() === ".csv") rows.push(...parseCsv(readFileSync(p, "utf8")));
          else if (extname(f).toLowerCase() === ".pdf") {
            // PDFs need text extraction; instruct owner to export as CSV/TXT, or use pdftotext if present
            try {
              const { stdout } = await execAsync(`pdftotext ${JSON.stringify(p)} -`, { timeout: 15000 });
              rows.push(...parsePdfText(stdout));
            } catch {
              return `ERROR: could not extract text from ${f}. Install poppler-utils (pdftotext) or export the PDF as CSV.`;
            }
          } else if (extname(f).toLowerCase() === ".txt") {
            rows.push(...parsePdfText(readFileSync(p, "utf8")));
          }
        }
      }
      writeFileSync(LOOKUP_INDEX, JSON.stringify(rows));
    } else {
      rows = JSON.parse(readFileSync(LOOKUP_INDEX, "utf8")) as LookupRow[];
    }
    const q = String(args.query).toLowerCase();
    const hits = rows.filter((r) => Object.values(r.fields).some((v) => v.toLowerCase().includes(q))).slice(0, 20);
    return hits.length
      ? hits.map((h) => `[${h.source}] ${JSON.stringify(h.fields)}`).join("\n")
      : `No match for '${args.query}' in ${rows.length} indexed rows.`;
  },
};

import { securityTools } from "./security.js";
import { armKillSwitch, disarmKillSwitch, isKilled, readAudit } from "../audit.js";

/* ---------------- v0.4: kill switch & audit (owner-only) ---------------- */

const killSwitch: Tool = {
  def: {
    type: "function",
    function: {
      name: "kill_switch",
      description:
        "OWNER ONLY. Arm or disarm the global kill switch. When armed, every tool call is blocked except unlock and kill_switch(disarm). Use 'arm' in an emergency, 'disarm' to recover, 'status' to check.",
      parameters: {
        type: "object",
        properties: { action: { type: "string", enum: ["arm", "disarm", "status"], description: "What to do" } },
        required: ["action"],
      },
    },
  },
  run: async (args, ctx) => {
    if (!ctx.owner) return "Blocked: owner only.";
    const a = String(args.action ?? "status");
    if (a === "arm") { armKillSwitch(); return "Kill switch ARMED. All tools blocked except unlock/kill_switch."; }
    if (a === "disarm") { disarmKillSwitch(); return "Kill switch DISARMED. Full functionality restored."; }
    return isKilled() ? "Kill switch is ARMED." : "Kill switch is not armed.";
  },
};

const auditLog: Tool = {
  def: {
    type: "function",
    function: {
      name: "audit_log",
      description:
        "OWNER ONLY. Show the last N entries of the audit log (every tool call, who triggered it, whether it was allowed).",
      parameters: {
        type: "object",
        properties: { count: { type: "number", description: "How many entries (default 20)" } },
      },
    },
  },
  run: async (args, ctx) => {
    if (!ctx.owner) return "Blocked: owner only.";
    const entries = readAudit(Number(args.count ?? 20));
    return entries.length
      ? entries.map((e) => `${e.time} | ${e.actor} | ${e.action}${e.allowed === false ? " | BLOCKED" : ""}${e.detail ? ` | ${e.detail}` : ""}`).join("\n")
      : "Audit log is empty.";
  },
};

export const tools: Tool[] = [shell, readFile, writeFile, fetchPage, remember, fileIndex, lockdown, unlock, lookup, killSwitch, auditLog, ...securityTools];

export function loadMemory(): string {
  return existsSync(MEMORY_FILE) ? readFileSync(MEMORY_FILE, "utf8").slice(0, 4000) : "";
}
