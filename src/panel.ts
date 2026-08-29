import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readAudit } from "./audit.js";

const DATA_DIR = "data";
const STATE_FILE = join(DATA_DIR, "panel-state.json");
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR);

export interface PanelState {
  name: string;
  status: "idle" | "thinking" | "working" | "talking" | "alert";
  activity: string;
  since: string;
}

/** Called by the agent to update what the character is doing. */
export function setPanelState(s: Partial<PanelState>): void {
  const cur = getPanelState();
  writeFileSync(STATE_FILE, JSON.stringify({ ...cur, ...s, since: new Date().toISOString() }));
}

export function getPanelState(): PanelState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as PanelState;
  } catch {
    return { name: "Yoru", status: "idle", activity: "Booting up", since: new Date().toISOString() };
  }
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Yoru — Agent</title>
<style>
  :root { --bg:#0b0e14; --fg:#e6e9f0; --acc:#7c6cf0; --dim:#8b93a7; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--fg); font-family:'Segoe UI',system-ui,sans-serif;
            height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; }
  .avatar { width:220px; height:220px; border-radius:50%; position:relative;
            background:radial-gradient(circle at 35% 30%, #2a2f45, #12151f 70%);
            display:flex; align-items:center; justify-content:center; font-size:96px;
            box-shadow:0 0 0 6px rgba(124,108,240,.15), 0 0 60px rgba(124,108,240,.25);
            animation:float 4s ease-in-out infinite; }
  .avatar.alert { box-shadow:0 0 0 6px rgba(240,108,108,.3), 0 0 60px rgba(240,108,108,.5); }
  .avatar::after { content:''; position:absolute; inset:-14px; border-radius:50%;
            border:2px dashed rgba(124,108,240,.35); animation:spin 14s linear infinite; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
  @keyframes spin { to { transform:rotate(360deg) } }
  .status { font-size:14px; letter-spacing:.2em; text-transform:uppercase; color:var(--acc); }
  .status.alert { color:#f06c6c; }
  .activity { color:var(--dim); font-size:15px; max-width:420px; text-align:center; min-height:22px; }
  .log { width:min(560px,92vw); max-height:32vh; overflow:auto; background:#10131c; border-radius:10px;
        padding:12px 16px; font:12px/1.7 ui-monospace,monospace; color:var(--dim); }
  .log b { color:var(--fg); font-weight:600; }
  .log .no { color:#f06c6c; }
  h1 { font-size:20px; font-weight:600; }
</style></head>
<body>
  <h1 id="name">Yoru</h1>
  <div class="avatar" id="avatar">🌙</div>
  <div class="status" id="status">idle</div>
  <div class="activity" id="activity">…</div>
  <div class="log" id="log"></div>
<script>
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  async function tick() {
    try {
      const r = await fetch('/state'); const s = await r.json();
      document.getElementById('name').textContent = s.name;
      document.getElementById('status').textContent = s.status;
      document.getElementById('status').className = 'status' + (s.status==='alert'?' alert':'');
      document.getElementById('avatar').className = 'avatar' + (s.status==='alert'?' alert':'');
      document.getElementById('activity').textContent = s.activity;
      const a = await (await fetch('/audit')).json();
      document.getElementById('log').innerHTML = a.slice(-14).reverse().map(e =>
        '<div><b>'+esc(e.time.slice(11,19))+'</b> '+esc(e.actor)+' — '+esc(e.action)+
        (e.allowed===false?' <span class="no">BLOCKED</span>':'')+'</div>').join('') || '<div>no activity yet</div>';
    } catch {}
  }
  tick(); setInterval(tick, 2000);
</script>
</body></html>`;

/**
 * Start the visual character panel on http://localhost:PORT (default 4174,
 * a dedicated port that does not collide with the other localhost app).
 * If the port is already in use, automatically try the next ports up to
 * +10 before giving up, and always log the final URL.
 */
export function startPanel(port = Number(process.env.PANEL_PORT ?? 4174)): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/state") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(getPanelState()));
    } else if (req.url === "/audit") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(readAudit(50)));
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGE);
    }
  });

  const MAX_ATTEMPTS = 10;
  let attempts = 0;

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempts < MAX_ATTEMPTS) {
      attempts++;
      const next = port + attempts;
      console.warn(`Port ${port + attempts - 1} already in use, trying ${next}…`);
      server.listen(next);
    } else {
      console.error(`Visual agent panel could not start: ${err.message}`);
    }
  });

  server.listen(port, () => {
    const actual = (server.address() as { port: number }).port;
    console.log(`Visual agent panel: http://localhost:${actual}  (set PANEL_PORT to change)`);
  });
}
