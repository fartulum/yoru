import { createServer, type IncomingMessage,
type ServerResponse } from "node:http";
import { readAudit } from "../audit.js";
import {
  commands, saveState, loadState,
  type BotState, type EconomySettings, DEFAULT_ECONOMY,
} from "../commands/index.js";
import { PAGE } from "./ui.js";
import type { Client } from "discord.js";

/**
 * Owner web panel API: localhost dashboard to edit command overrides, economy
 * settings, verification config, view servers and live stats.
 * Runs on its OWN port (OWNER_PANEL_PORT, default 4175) so it never collides
 * with the visual character panel (PANEL_PORT, default 4174).
 *
 * The panel always operates on the LIVE bot state: in Discord mode the running
 * bot registers its own state object (edits apply instantly to the bot),
 * and otherwise the state is loaded from disk so the panel still works in chat mode.
 */

let panelState: BotState | null = null;
let panelClient: Client | null = null;

export function setOwnerPanelState(state: BotState) { panelState = state; }
export function setOwnerPanelClient(client: Client) { panelClient = client; }
/** Live bot state: the running bot's object when registered, else loaded from disk. */
function livestate(): BotState {
  if (!panelState) panelState = loadState();
  return panelState;
}

function guilds() {
  if (!panelClient) return [];
  return [...panelClient.guilds.cache.values()].map(g => ({
    id: g.id,
    name: g.name,
    memberCount: g.memberCount ?? 0,
    roles: [...g.roles.cache.values()]
      .filter(r => r.id !== g.id)
      .map(r => ({ id: r.id, name: r.name })),
    channels: [...g.channels.cache.values()]
      .filter(c => (c as any).isTextBased?.())
      .map(c => ({ id: c.id, name: (c as any).name })),
  }));
}

function overview() {
  const st = livestate();
  const ecoAccounts = Object.keys(st.eco).length;
  const verified = Object.values(st.verify).reduce((n, v) => n + Object.keys(v.verified).length, 0);
  const gs = guilds();
  const up = process.uptime();
  return {
    stats: {
      uptime: Math.floor(up / 3600) + " h " + Math.floor((up % 3600) / 60) + " m",
      memory: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) + " MB",
      node: process.version,
      guildCount: gs.length,
      totalMembers: gs.reduce((n, g) => n + g.memberCount, 0),
      commandCount: commands.length,
      ecoAccounts,
      verified,
    },
    guilds: gs,
    audit: readAudit(50),
  };
}

/**
 * Send exactly one JSON response. Guards against double-send
 * (ERR_HTTP_HEADERS_SENT) and never throws: if the payload is not
 * serializable we answer a clean 500 instead of crashing the handler.
 */
function json(res: ServerResponse, code: number, data: unknown) {
  if (res.headersSent) { res.end(); return; }
  let payload: string;
  try {
    payload = JSON.stringify(data);
  } catch (e) {
    code = 500;
    payload = JSON.stringify({ error: "unserializable response: " + String(e) });
  }
  res.writeHead(code, { "content-type": "application/json" });
  res.end(payload);
}

async function body(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) || "{}"; } catch { return {}; }
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname;
  if (p === "/api/overview" && req.method === "GET") return json(res, 200, overview()), true;
  if (p === "/api/commands" && req.method === "GET") {
    const st = livestate();
    const list = commands.map(c => ({
      name: c.name, category: c.category, description: c.description, usage: c.usage,
      perm: c.perm !== undefined, modOnly: c.modOnly === true,
      enabled: st.commandOverrides[c.name]?.enable !== false,
    }));
    return json(res, 200, { commands: list }), true;
  }
  if (p === "/api/commands/override" && req.method === "POST") {
    const b = await body(req);
    if (typeof b.name !== "string" || !commands.find(c => c.name === b.name)) {
      return json(res, 400, { error: "unknown command" }), true;
    }
    const st = livestate();
    const cur = st.commandOverrides[b.name] ?? { enable: true };
    st.commandOverrides[b.name] = {
      ...cur,
      enable: typeof b.enable === "boolean" ? b.enable : cur.enable,
      modOnly: typeof b.modOnly === "boolean" ? b.modOnly : cur.modOnly,
    };
    saveState(st);
    return json(res, 200, { ok: true }), true;
  }
  if (p === "/api/economy" && req.method === "GET") {
    return json(res, 200, livestate().economy ?? DEFAULT_ECONOMY), true;
  }
  if (p === "/api/economy" && req.method === "POST") {
    const b = await body(req);
    const st = livestate();
    const s = st.economy;
    for (const k of Object.keys(DEFAULT_ECONOMY) as (keyof EconomySettings)[]) {
      const v = b[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) (s as any)[k] = v;
    }
    saveState(st);
    return json(res, 200, { ok: true, economy: s }), true;
  }
  if (p === "/api/verify" && req.method === "GET") {
    const st = livestate();
    const out: Record<string, any> = {};
    for (const g of guilds()) {
      const cfg = st.verify[g.id];
      out[g.id] = {
        enable: cfg?.enable ?? false,
        roleId: cfg?.roleId ?? null,
        logChannelId: cfg?.logChannelId ?? null,
        verifiedCount: cfg ? Object.keys(cfg.verified).length : 0,
        verify: cfg ? Object.entries(cfg.verified).slice(-50).map(([id, r]) => ({ id, ...r })) : [],
      };
    }
    return json(res, 200, { guilds: guilds(), verify: out }), true;
  }
  if (p === "/api/verify" && req.method === "POST") {
    const b = await body(req);
    if (typeof b.guildId !== "string") return json(res, 400, { error: "guildId required" }), true;
    const st = livestate();
    const cfg = st.verify[b.guildId] ?? { enable: false, verified: {} };
    if (typeof b.enable === "boolean") cfg.enable = b.enable;
    if (typeof b.roleId === "string" || b.roleId === null) cfg.roleId = b.roleId ?? undefined;
    if (typeof b.logChannelId === "string" || b.logChannelId === null) cfg.logChannelId = b.logChannelId ?? undefined;
    saveState(st);
    return json(res, 200, { ok: true }), true;
  }
  return false;
}

/**
 * Start the owner control panel on http://localhost:PORT (default 4175).
 * Separate from the visual character panel (PANEL_PORT, default 4174).
 */
export function startOwnerPanel(port = Number(process.env.OWNER_PANEL_PORT) ?? 4175): void {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (await handleApi(req, res, url)) return;
    } catch (e) {
      console.error("owner panel API error:", e);
      json(res, 500, { error: String(e) });
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(PAGE);
  });
  server.listen(port, () => {
    console.log(`Owner control panel: http://localhost:${port}  (set OWNER_PANEL_PORT to change)`);
  });
}