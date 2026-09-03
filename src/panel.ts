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

/**
 * The panel chat needs to reach the live agent. The runner (index.ts /
 * discord.ts) registers the agent instance here so POST /chat talks to the
 * same agent as the terminal, with full owner tool access.
 */
export interface PanelAgent {
  handle(input: string): Promise<string>;
}
let panelAgent: PanelAgent | null = null;
export function setPanelAgent(agent: PanelAgent): void { panelAgent = agent; }

/** Read a JSON request body (capped at 1 MB). */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 1_000_000) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * E-Forward: fetch a document URL (e.g. https://reads.phrack.org/docs/)
 * and forward its text to the agent for processing. The optional API key
 * is taken from the request or the EFORWARD_API_KEY env var and is never
 * persisted to disk or logged.
 */
export async function eforwardFetch(url: string, apiKey?: string): Promise<string> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("invalid URL"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("only http(s) URLs are allowed");
  }
  const key = apiKey?.trim() || process.env.EFORWARD_API_KEY?.trim() || "";
  const headers: Record<string, string> = { "user-agent": "yoru-lite-panel/0.5" };
  if (key) headers["x-api-key"] = key;
  const res = await fetch(parsed, { headers, redirect: "follow" });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  // Strip tags so the agent gets readable text instead of raw HTML soup.
  const plain = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return plain.slice(0, 20_000);
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Yoru — Agent</title>
<style>
  :root { --bg:#0b0e14; --fg:#e6e9f0; --acc:#7c6cf0; --dim:#8b93a7; }
  * { box-sizing:border-box; margin:0; }
  body { background:var(--bg); color:var(--fg); font-family:'Segoe UI',system-ui,sans-serif;
            height:100vh; display:flex; flex-direction:column; align-items:center; gap:14px;
            padding:18px; overflow:hidden; }
  header { width:min(720px,94vw); display:flex; align-items:center; justify-content:space-between; }
  h1 { font-size:20px; font-weight:600; }
  /* hamburger menu (top right) */
  .burger { background:none; border:none; cursor:pointer; padding:8px; position:relative; }
  .burger span { display:block; width:24px; height:3px; background:var(--fg); margin:5px 0; border-radius:2px; transition:.2s; }
  .menu { position:absolute; top:52px; right:12px; background:#141826; border:1px solid #232a3f;
          border-radius:10px; min-width:180px; padding:6px; display:none; z-index:10;
          box-shadow:0 10px 30px rgba(0,0,0,.5); }
  .menu.open { display:block; }
  .menu button { display:block; width:100%; text-align:left; background:none; border:none; color:var(--fg);
          font:14px/1 'Segoe UI',system-ui; padding:10px 12px; border-radius:7px; cursor:pointer; }
  .menu button:hover { background:#1c2233; color:var(--acc); }
  /* animated robot avatar */
  .avatar { width:170px; height:170px; position:relative; flex-shrink:0; }
  .robot { width:100%; height:100%; animation:float 4s ease-in-out infinite; }
  .robot .eye { animation:blink 4.5s infinite; transform-origin:center; }
  .robot .arm-l, .robot .arm-r { transform-origin:top center; animation:wave 3s ease-in-out infinite; }
  .avatar.alert .robot { filter:drop-shadow(0 0 18px rgba(240,108,108,.8)); }
  .avatar .ring { position:absolute; inset:-12px; border-radius:50%;
          border:2px dashed rgba(124,108,240,.35); animation:spin 14s linear infinite; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes spin { to { transform:rotate(360deg) } }
  @keyframes blink { 0%,92%,100%{transform:scaleY(1)} 95%{transform:scaleY(.1)} }
  @keyframes wave { 0%,100%{transform:rotate(0)} 50%{transform:rotate(14deg)} }
  .status { font-size:13px; letter-spacing:.2em; text-transform:uppercase; color:var(--acc); }
  .status.alert { color:#f06c6c; }
  .activity { color:var(--dim); font-size:14px; max-width:520px; text-align:center; min-height:20px; }
  /* chat */
  .chat { width:min(720px,94vw); flex:1; min-height:120px; display:flex; flex-direction:column;
          background:#10131c; border-radius:12px; overflow:hidden; }
  .msgs { flex:1; overflow:auto; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
  .msg { max-width:80%; padding:8px 12px; border-radius:12px; font-size:14px; line-height:1.5;
         white-space:pre-wrap; word-wrap:break-word; }
  .msg.user { align-self:flex-end; background:var(--acc); color:#fff; border-bottom-right-radius:4px; }
  .msg.bot { align-self:flex-start; background:#1a1f30; border-bottom-left-radius:4px; }
  .msg.bot.pending { opacity:.6; font-style:italic; }
  .chatbar { display:flex; gap:8px; padding:10px; border-top:1px solid #1c2233; }
  .chatbar input { flex:1; background:#0b0e14; border:1px solid #232a3f; color:var(--fg);
          border-radius:8px; padding:10px 12px; font-size:14px; outline:none; }
  .chatbar input:focus { border-color:var(--acc); }
  .chatbar button { background:var(--acc); border:none; color:#fff; border-radius:8px;
          padding:10px 18px; font-size:14px; cursor:pointer; }
  .chatbar button:disabled { opacity:.5; cursor:default; }
  /* E-Forward view */
  .eforward { width:min(720px,94vw); flex:1; display:none; flex-direction:column; gap:12px; }
  .eforward.open { display:flex; }
  .eforward h2 { font-size:16px; color:var(--acc); }
  .eforward p { color:var(--dim); font-size:13px; }
  .eforward input, .eforward textarea { background:#10131c; border:1px solid #232a3f; color:var(--fg);
          border-radius:8px; padding:10px 12px; font-size:14px; outline:none; width:100%; }
  .eforward textarea { min-height:140px; resize:vertical; font:13px/1.5 ui-monospace,monospace; }
  .eforward .row { display:flex; gap:8px; }
  .eforward button { background:var(--acc); border:none; color:#fff; border-radius:8px;
          padding:10px 18px; font-size:14px; cursor:pointer; align-self:flex-start; }
  .eforward .result { flex:1; overflow:auto; background:#10131c; border-radius:10px; padding:12px 14px;
          font:12px/1.7 ui-monospace,monospace; color:var(--dim); white-space:pre-wrap; }
  .log { width:min(720px,94vw); max-height:20vh; overflow:auto; background:#10131c; border-radius:10px;
        padding:10px 16px; font:12px/1.7 ui-monospace,monospace; color:var(--dim); }
  .log b { color:var(--fg); font-weight:600; }
  .log .no { color:#f06c6c; }
</style></head>
<body>
<header>
  <h1 id="name">Yoru</h1>
  <button class="burger" id="burger" aria-label="menu"><span></span><span></span><span></span></button>
  <div class="menu" id="menu">
    <button onclick="showView('chat')">Chat</button>
    <button onclick="showView('eforward')">E-Forward</button>
  </div>
</header>
<div class="avatar" id="avatar">
  <svg class="robot" viewBox="0 0 100 100" aria-label="robot">
    <line x1="50" y1="8" x2="50" y2="16" stroke="#7c6cf0" stroke-width="3"/>
    <circle cx="50" cy="7" r="3.5" fill="#7c6cf0">
      <animate attributeName="opacity" values="1;.2;1" dur="1.6s" repeatCount="indefinite"/>
    </circle>
    <rect x="28" y="16" width="44" height="34" rx="10" fill="#2a2f45" stroke="#7c6cf0" stroke-width="2"/>
    <g class="eye">
      <circle cx="41" cy="32" r="5" fill="#7c6cf0"/>
      <circle cx="59" cy="32" r="5" fill="#7c6cf0"/>
    </g>
    <rect x="42" y="42" width="16" height="4" rx="2" fill="#8b93a7"/>
    <rect x="30" y="54" width="40" height="26" rx="8" fill="#232842" stroke="#7c6cf0" stroke-width="2"/>
    <rect x="38" y="60" width="24" height="6" rx="3" fill="#7c6cf0" opacity=".6"/>
    <g class="arm-l"><rect x="16" y="52" width="10" height="22" rx="5" fill="#2a2f45" stroke="#7c6cf0" stroke-width="2"/></g>
    <g class="arm-r"><rect x="74" y="52" width="10" height="22" rx="5" fill="#2a2f45" stroke="#7c6cf0" stroke-width="2"/></g>
    <rect x="36" y="82" width="10" height="10" rx="3" fill="#2a2f45" stroke="#7c6cf0" stroke-width="2"/>
    <rect x="54" y="82" width="10" height="10" rx="3" fill="#2a2f45" stroke="#7c6cf0" stroke-width="2"/>
  </svg>
  <div class="ring"></div>
</div>
<div class="status" id="status">idle</div>
<div class="activity" id="activity">…</div>

<div class="chat" id="view-chat">
  <div class="msgs" id="msgs"></div>
  <div class="chatbar">
    <input id="chatinput" placeholder="Talk to your agent… (Enter to send)" autocomplete="off"/>
    <button id="sendbtn">Send</button>
  </div>
</div>

<div class="eforward" id="view-eforward">
  <h2>E-Forward</h2>
  <p>Forward a document URL to your agent. The page is fetched, cleaned to text, and sent to the agent for processing. Your API key stays in this browser (localStorage) or the server's EFORWARD_API_KEY env var — it is never stored in the repo.</p>
  <input id="efurl" placeholder="Document URL, e.g. https://reads.phrack.org/docs/"/>
  <input id="efkey" type="password" placeholder="API key (optional, remembered locally)"/>
  <div class="row"><button id="efbtn">Forward to agent</button></div>
  <div class="result" id="efresult">Waiting for a URL…</div>
</div>

<div class="log" id="log"></div>
<script>
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const $ = id => document.getElementById(id);

  /* --- hamburger menu --- */
  $('burger').onclick = e => { e.stopPropagation(); $('menu').classList.toggle('open'); };
  document.addEventListener('click', () => $('menu').classList.remove('open'));
  function showView(v) {
    $('menu').classList.remove('open');
    $('view-chat').style.display = v === 'chat' ? 'flex' : 'none';
    $('view-eforward').classList.toggle('open', v === 'eforward');
    if (v === 'chat') $('chatinput').focus();
  }

  /* --- chat --- */
  function addMsg(text, who) {
    const d = document.createElement('div');
    d.className = 'msg ' + who; d.textContent = text;
    $('msgs').appendChild(d); $('msgs').scrollTop = 1e9;
    return d;
  }
  async function send() {
    const input = $('chatinput'); const text = input.value.trim();
    if (!text) return;
    input.value = ''; addMsg(text, 'user');
    const pending = addMsg('…', 'bot pending');
    $('sendbtn').disabled = true;
    try {
      const r = await fetch('/chat', { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ message: text }) });
      const j = await r.json();
      pending.remove();
      addMsg(r.ok ? j.reply : 'ERROR: ' + (j.error || r.status), 'bot');
    } catch (e) { pending.remove(); addMsg('ERROR: ' + e.message, 'bot'); }
    $('sendbtn').disabled = false; input.focus();
  }
  $('sendbtn').onclick = send;
  $('chatinput').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  /* --- E-Forward --- */
  const KEY_STORE = 'eforward_api_key';
  $('efkey').value = localStorage.getItem(KEY_STORE) || '';
  $('efkey').oninput = () => localStorage.setItem(KEY_STORE, $('efkey').value);
  $('efbtn').onclick = async () => {
    const url = $('efurl').value.trim();
    if (!url) { $('efresult').textContent = 'Enter a document URL first.'; return; }
    $('efresult').textContent = 'Fetching ' + url + ' …';
    try {
      const r = await fetch('/eforward', { method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ url, apiKey: $('efkey').value.trim() || undefined }) });
      const j = await r.json();
      $('efresult').textContent = r.ok ? j.reply : 'ERROR: ' + (j.error || r.status);
    } catch (e) { $('efresult').textContent = 'ERROR: ' + e.message; }
  };

  /* --- state + audit polling --- */
  async function tick() {
    try {
      const s = await (await fetch('/state')).json();
      $('name').textContent = s.name;
      $('status').textContent = s.status;
      $('status').className = 'status' + (s.status==='alert'?' alert':'');
      $('avatar').className = 'avatar' + (s.status==='alert'?' alert':'');
      $('activity').textContent = s.activity;
      const a = await (await fetch('/audit')).json();
      $('log').innerHTML = a.slice(-14).reverse().map(e =>
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
 *
 * Endpoints: GET /state, GET /audit, POST /chat {message},
 * POST /eforward {url, apiKey?}.
 */
export function startPanel(port = Number(process.env.PANEL_PORT ?? 4174)): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === "/state") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(getPanelState()));
    } else if (req.url === "/audit") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(readAudit(50)));
    } else if (req.url === "/chat" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req)) as { message?: string };
        const message = body.message?.trim();
        if (!message) throw new Error("empty message");
        if (!panelAgent) throw new Error("no agent registered (start the panel from a running session)");
        setPanelState({ status: "thinking", activity: message.slice(0, 120) });
        const reply = await panelAgent.handle(message);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ reply }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    } else if (req.url === "/eforward" && req.method === "POST") {
      try {
        const body = JSON.parse(await readBody(req)) as { url?: string; apiKey?: string };
        if (!body.url) throw new Error("missing url");
        if (!panelAgent) throw new Error("no agent registered (start the panel from a running session)");
        const doc = await eforwardFetch(body.url, body.apiKey);
        if (!doc) throw new Error("document came back empty");
        setPanelState({ status: "working", activity: `E-Forward: ${body.url.slice(0, 100)}` });
        const reply = await panelAgent.handle(
          `E-Forward document from ${body.url}:\n\n${doc}\n\nProcess this document per standing instructions (summarize, extract key points, or act on it).`,
        );
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ reply }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
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