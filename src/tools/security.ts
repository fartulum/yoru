import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  appendFileSync,
} from "node:fs";
import { join, resolve, basename, extname } from "node:path";
import type { Tool, ToolContext } from "./index.js";

const execAsync = promisify(exec);

function isWindows(): boolean {
  return process.platform === "win32";
}
function homeRelative(p: string): string {
  const h = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return p.startsWith("~/") ? join(h, p.slice(2)) : p;
}

/* ---------------- 1. project scaffolding ---------------- */

const PROJECTS_ROOT = () => process.env.PROJECTS_DIR ?? "~/projects";

const createProject: Tool = {
  def: {
    type: "function",
    function: {
      name: "create_project",
      description:
        "OWNER ONLY. Scaffold a new coding project under ~/projects (configurable via PROJECTS_DIR). Creates the folder and any files you list (path + content). Use this whenever the owner asks the agent to build a program, script, or tool — never scatter files elsewhere.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "project folder name, e.g. fps-optimizer" },
          files: {
            type: "array",
            description: "files to create inside the project",
            items: {
              type: "object",
              properties: {
                path: { type: "string", description: "relative path inside the project, e.g. main.py" },
                content: { type: "string" },
              },
              required: ["path", "content"],
            },
          },
        },
        required: ["name"],
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: create_project is owner-only.";
    const root = resolve(homeRelative(PROJECTS_ROOT()));
    const safeName = String(args.name).replace(/[^a-zA-Z0-9._-]/g, "-");
    const dir = join(root, safeName);
    if (resolve(dir).startsWith("..")) return "REFUSED: bad project name.";
    mkdirSync(dir, { recursive: true });
    const files = (args.files as Array<{ path: string; content: string }>) ?? [];
    let created = 0;
    for (const f of files) {
      const rel = String(f.path).replace(/\\/g, "/");
      if (rel.includes("..")) return `REFUSED: bad file path ${rel}.`;
      const target = join(dir, rel);
      mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
      writeFileSync(target, String(f.content ?? ""));
      created++;
    }
    mkdirSync("data", { recursive: true });
    appendFileSync("data/projects.log", `${new Date().toISOString()} ${safeName} (${created} files)\n`);
    return `Project created at ${dir} with ${created} file(s). Next: cd in, review the code, and run it. The agent can also run/test it via the shell tool on request.`;
  },
};

/* ---------------- 2. malware scan (quarantine, never shred) ---------------- */

const QUARANTINE_DIR = "data/quarantine";
const SIGS: Array<{ name: string; pattern: RegExp }> = [
  { name: "shell dropper (curl|bash)", pattern: /curl\s+[^\n]*\|\s*(ba)?sh/ },
  { name: "shell dropper (wget|sh)", pattern: /wget\s+[^\n]*\|\s*(ba)?sh/ },
  { name: "reverse shell", pattern: /\/dev\/tcp\/|bash\s+-i\s+>&\s*\/dev\/tcp|nc\s+-e\s+/ },
  { name: "base64 pipe to shell", pattern: /echo\s+[A-Za-z0-9+/=]{40,}\s*\|\s*base64\s+-d\s*\|\s*(ba)?sh/ },
  { name: "chmod +rwx persistence", pattern: /chmod\s+\+x\s+\/tmp\// },
  { name: "cron persistence dropper", pattern: /(crontab|\/etc\/cron)[^\n]*(curl|wget|http)/ },
  { name: "known miner pool", pattern: /stratum\+tcp:|xmr\.(pool|coin)|minerd|xmrig/i },
  { name: "ssh key theft", pattern: /cat\s+~?\/?\.ssh\/id_(rsa|ed25519)[^\n]*(curl|nc|scp|>)/ },
  { name: "eval obfuscation", pattern: /eval\s*\(\s*(atob|unescape|String\.fromCharCode)/ },
  { name: "pyinstaller-packed keylogger hint", pattern: /pynput\.keyboard\.Listener|GetAsyncKeyState/ },
];

function walk(dir: string, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.isDirectory()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out, depth + 1);
    else if (e.isFile()) {
      try { if (statSync(p).size < 2_000_000) out.push(p); } catch { /* skip */ }
    }
  }
  return out;
}

const SCAN_EXTS = new Set([".sh", ".py", ".js", ".ts", ".php", ".pl", ".rb", ".exe", ".bat", ".ps1", ".cmd", ".elf", "", ".bin"]);

const malwareScan: Tool = {
  def: {
    type: "function",
    function: {
      name: "malware_scan",
      description:
        "OWNER ONLY. Scan a directory for malware indicators (reverse shells, droppers, miners, keyloggers, obfuscated payloads) using signature + heuristics, and optionally invoke the system AV (clamscan / Windows Defender) if installed. Suspect files are QUARANTINED (moved to data/quarantine), never deleted — you review and shred them yourself. Nothing is auto-deleted.",
      parameters: {
        type: "object",
        properties: {
          directory: { type: "string", description: "defaults to ~ (home)" },
          quarantine: { type: "boolean", description: "move hits to quarantine (default true)" },
        },
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: malware_scan is owner-only.";
    const dir = resolve(homeRelative(String(args.directory ?? "~")));
    const doQuarantine = args.quarantine !== false;
    const files = walk(dir).filter((f) => SCAN_EXTS.has(extname(f).toLowerCase()));
    const hits: string[] = [];
    for (const f of files) {
      let content = "";
      try { content = readFileSync(f, "latin1"); } catch { continue; }
      for (const s of SIGS) {
        if (s.pattern.test(content)) {
          hits.push(`${f} — ${s.name}`);
          if (doQuarantine) {
            mkdirSync(QUARANTINE_DIR, { recursive: true });
            const dest = join(QUARANTINE_DIR, `${Date.now()}-${basename(f)}`);
            try { renameSync(f, dest); hits[hits.length - 1] += ` → quarantined (${dest})`; } catch { /* locked */ }
          }
          break;
        }
      }
    }
    // system AV pass if available
    let avNote = "";
    if (!isWindows()) {
      try {
        await execAsync(`command -v clamscan`, { timeout: 5000 });
        const { stdout } = await execAsync(`clamscan --no-summary -i -r ${JSON.stringify(dir)} | head -20`, { timeout: 300_000 });
        avNote = stdout ? `\nClamAV findings:\n${stdout}` : "\nClamAV: clean.";
      } catch { avNote = "\n(clamscan not installed — apt install clamav for a second opinion)"; }
    } else {
      try {
        await execAsync(`powershell -c "(Get-MpComputerStatus)"`, { timeout: 15000 });
        await execAsync(`powershell -c "Start-MpScan -ScanPath ${JSON.stringify(dir)}"`, { timeout: 300_000 });
        avNote = "\nWindows Defender scan triggered (see Security Center for results).";
      } catch { avNote = "\n(Defender not queryable from here.)"; }
    }
    return `Scanned ${files.length} files under ${dir}.\n${hits.length ? "FINDINGS:\n" + hits.join("\n") : "No signature hits."}${avNote}\nQuarantined files are in ${QUARANTINE_DIR} — review them, then delete manually if confirmed malicious. Nothing is auto-deleted.`;
  },
};

/* ---------------- 3. connection monitor ---------------- */

const KNOWN_CONN_FILE = "data/known-connections.json";

function parseLinuxNetstat(out: string): Array<{ proto: string; local: string; remote: string; state: string; pid: string }> {
  const rows: Array<{ proto: string; local: string; remote: string; state: string; pid: string }> = [];
  for (const line of out.split("\n").slice(1)) {
    const c = line.trim().split(/\s+/);
    if (c.length >= 5 && (c[0].startsWith("tcp") || c[0].startsWith("udp"))) {
      rows.push({ proto: c[0], local: c[3], remote: c[4], state: c[5] ?? "", pid: c[6]?.split("/")[1] ?? c[6] ?? "" });
    }
  }
  return rows;
}

const connections: Tool = {
  def: {
    type: "function",
    function: {
      name: "connections",
      description:
        "OWNER ONLY. List current network connections (established + listening) with owning processes, and flag any remote endpoint not seen before (baseline stored in data/known-connections.json). Use to detect unauthorized connections. Modes: 'list' (show all), 'baseline' (save current remotes as trusted), 'check' (diff against baseline).",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["list", "baseline", "check"], description: "default list" },
        },
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: connections is owner-only.";
    let rows: Array<{ proto: string; local: string; remote: string; state: string; pid: string }>;
    try {
      if (isWindows()) {
        const { stdout } = await execAsync(`netstat -ano`, { timeout: 30000 });
        rows = stdout.split("\n").map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 4 && (c[0].startsWith("TCP") || c[0].startsWith("UDP")))
          .map((c) => ({ proto: c[0], local: c[1], remote: c[2] === "[::]:0]" || c[2] === "0.0.0.0:0" || c[2] === "*:*" ? "(listener)" : c[2], state: c[3] ?? "", pid: c[c.length - 1] }));
      } else {
        const { stdout } = await execAsync(`ss -tunap 2>/dev/null || netstat -tunap`, { timeout: 30000 });
        rows = parseLinuxNetstat(stdout);
      }
    } catch (e) {
      return `ERROR reading connections: ${(e as Error).message}`;
    }
    const remoteSet = new Set(rows.map((r) => r.remote).filter((r) => r && r !== "(listener)" && !r.startsWith("127.") && !r.startsWith("[::1]")));
    const mode = String(args.mode ?? "list");
    if (mode === "baseline") {
      writeFileSync(KNOWN_CONN_FILE, JSON.stringify([...remoteSet], null, 2));
      return `Baseline saved: ${remoteSet.size} remote endpoints marked as known.`;
    }
    let diffNote = "";
    if (mode === "check") {
      const known: string[] = existsSync(KNOWN_CONN_FILE) ? JSON.parse(readFileSync(KNOWN_CONN_FILE, "utf8")) : [];
      if (!known.length) diffNote = "\nNo baseline yet — run mode 'baseline' first.";
      else {
        const unknown = [...remoteSet].filter((r) => !known.includes(r));
        diffNote = unknown.length
          ? `\n⚠️ UNKNOWN endpoints (${unknown.length}):\n${unknown.join("\n")}\nInvestigate owning processes before trusting them.`
          : "\nAll remote endpoints match the baseline.";
      }
    }
    const table = rows.slice(0, 40).map((r) => `${r.proto.padEnd(5)} ${r.local.padEnd(24)} → ${r.remote.padEnd(24)} ${r.state.padEnd(12)} pid:${r.pid}`).join("\n");
    return `Active connections (${rows.length}):\n${table}${diffNote}`;
  },
};

/* ---------------- 4. Tor toggle ---------------- */

const torctl: Tool = {
  def: {
    type: "function",
    function: {
      name: "tor",
      description:
        "OWNER ONLY. Route traffic through Tor (start) or stop routing (stop). Linux: requires the 'tor' package; uses torsocks per-command or checks the SOCKS proxy on 127.0.0.1:9050. Windows: requires Tor Browser / tor.exe on PATH. Status mode reports whether the Tor daemon is running and the circuit is established.",
      parameters: {
        type: "object",
        properties: { action: { type: "string", enum: ["start", "stop", "status"] } },
        required: ["action"],
      },
    },
  },
  async run(args, ctx) {
    if (!ctx.owner) return "DENIED: tor is owner-only.";
    const action = String(args.action);
    try {
      if (isWindows()) {
        if (action === "status") {
          const { stdout } = await execAsync(`tasklist | findstr /i tor`, { timeout: 15000 }).catch(() => ({ stdout: "" }));
          return stdout ? "Tor process running (check Tor Browser for circuit status)." : "Tor not running.";
        }
        if (action === "start") {
          await execAsync(`start "" "tor"`, { timeout: 15000 }).catch(() => { throw new Error("tor.exe not found on PATH — install Tor Browser and add it to PATH."); });
          return "Tor starting. Apps must be configured for SOCKS5 127.0.0.1:9050, or use the Tor Browser itself.";
        }
        await execAsync(`taskkill /im tor.exe /f`, { timeout: 15000 }).catch(() => { throw new Error("no tor.exe running"); });
        return "Tor stopped.";
      }
      // Linux (Parrot)
      if (action === "status") {
        const { stdout } = await execAsync(`systemctl is-active tor 2>/dev/null; curl -s --socks5-hostname 127.0.0.1:9050 -m 8 https://check.torproject.org/api/ip`, { timeout: 20000 }).catch(() => ({ stdout: "down" }));
        return `Tor service: ${stdout.trim().split("\n")[0] || "unknown"}\n${stdout.includes("IsTor") ? stdout : "Circuit check failed or Tor not up."}`;
      }
      if (action === "start") {
        const ok = await ctx.confirm("Start the Tor daemon? (Traffic only routes through Tor for apps configured to use SOCKS 127.0.0.1:9050 or run via torsocks.)");
        if (!ok) return "Cancelled.";
        const { stdout, stderr } = await execAsync(`sudo systemctl start tor && sleep 3 && systemctl is-active tor`, { timeout: 30000 });
        return `Tor ${stdout.trim()}. Use 'torsocks <cmd>' to route a command, or point apps at SOCKS5 127.0.0.1:9050. Ask me to check status to confirm the circuit.`;
      }
      const ok = await ctx.confirm("Stop the Tor daemon?");
      if (!ok) return "Cancelled.";
      await execAsync(`sudo systemctl stop tor`, { timeout: 30000 });
      return "Tor stopped — traffic is back on your normal connection.";
    } catch (e) {
      return `ERROR: ${(e as Error).message}\nInstall with: sudo apt install tor (Parrot usually ships it).`;
    }
  },
};

export const securityTools: Tool[] = [createProject, malwareScan, connections, torctl];
