/** Single-page dashboard served by the panel API. Purple glass, animated, zero deps. */
export const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>yoru — control panel</title>
<style>
:root{--bg:#0b0a14;--fg:#efe9ff;--acc:#a78bfa;--dim:#8b93a7;--glass:rgba(124,58,237,.08);--stroke:rgba(167,139,250,.22)}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;overflow-x:hidden}
.orb{position:fixed;border-radius:50%;filter:blur(90px);opacity:.5;z-index:0;animation:drift 16s ease-in-out infinite}
.orb.a{width:520px;height:520px;background:#4c1d95;top:-160px;left:-120px}
.orb.b{width:420px;height:420px;background:#7c3aed;bottom:-140px;right:-100px;animation-delay:-8s}
@keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(60px,40px)}}
.wrap{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:28px 22px 60px}
header{display:flex;align-items:center;gap:16px;margin-bottom:26px}
.logo{width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 0 30px rgba(124,58,237,.55);animation:pulse 3s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 24px rgba(124,58,237,.45)}50%{box-shadow:0 0 44px rgba(167,139,250,.75)}}
h1{font-size:26px;font-weight:700;background:linear-gradient(90deg,#fff,#c4b5fd);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--dim);font-size:13px}
.pill{margin-left:auto;padding:8px 16px;border-radius:999px;background:var(--glass);border:1px solid var(--stroke);font-size:13px;color:var(--acc);backdrop-filter:blur(10px);white-space:nowrap}
nav{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap}
nav button{padding:10px 18px;border-radius:12px;border:1px solid transparent;background:transparent;color:var(--dim);font-size:14px;cursor:pointer;transition:.2s}
nav button:hover{color:var(--fg)}
nav button.on{background:var(--glass);border-color:var(--stroke);color:var(--acc);backdrop-filter:blur(10px);box-shadow:0 0 18px rgba(124,58,237,.25)}
.card{background:var(--glass);border:1px solid var(--stroke);border-radius:18px;padding:20px;backdrop-filter:blur(14px);box-shadow:0 8px 32px rgba(0,0,0,.35);margin-bottom:16px;animation:rise .4s ease}
@keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}
.stat .v{font-size:26px;font-weight:700;color:#fff;text-shadow:0 0 18px rgba(167,139,250,.6)}
.stat .k{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em;margin-top:4px}
h2{font-size:16px;margin-bottom:14px;color:#d8ccff}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.1em;padding:8px 10px}
td{padding:9px 10px;border-top:1px solid rgba(167,139,250,.12)}
input,select{background:rgba(11,10,20,.6);border:1px solid var(--stroke);border-radius:10px;color:var(--fg);padding:9px 12px;font-size:14px;width:100%}
input:focus,select:focus{outline:none;border-color:var(--acc);box-shadow:0 0 14px rgba(167,139,250,.3)}
label{display:block;font-size:12px;color:var(--dim);margin:10px 0 5px}
.btn{padding:9px 18px;border-radius:10px;border:1px solid var(--stroke);background:var(--glass);color:var(--acc);cursor:pointer;font-size:14px;transition:.2s}
.btn:hover{box-shadow:0 0 18px rgba(124,58,237,.4)}
.btn.primary{background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;border:none;font-weight:600}
.switch{position:relative;width:44px;height:24px;display:inline-block}
.switch input{opacity:0;width:0;height:0}
.slider{position:absolute;inset:0;background:rgba(139,147,167,.25);border-radius:999px;cursor:pointer;transition:.25s}
.slider:before{content:"";position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;top:3px;left:3px;transition:.25s}
.switch input:checked+.slider{background:linear-gradient(90deg,#7c3aed,#a78bfa);box-shadow:0 0 14px rgba(124,58,237,.6)}
.switch input:checked+.slider:before{transform:translateX(20px)}
.badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;background:var(--glass);border:1px solid var(--stroke);color:var(--acc)}
.log{max-height:300px;overflow:auto;font:12px/1.7 ui-monospace,monospace;color:var(--dim)}
.log b{color:var(--acc)}
.log .no{color:#f06c6c}
.gname{font-weight:600;color:#fff}
.muted{color:var(--dim);font-size:13px}
.toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:12px;background:rgba(76,29,149,.85);border:1px solid var(--stroke);backdrop-filter:blur(12px);color:#fff;font-size:14px;opacity:0;transform:translateY(10px);transition:.3s;z-index:9}
.toast.show{opacity:1;transform:none}
section{display:none}
section.on{display:block}
</style></head><body>
<div class="orb a"></div><div class="orb b"></div>
<div class="wrap">
<header>
  <div class="logo">🌙</div>
  <div><h1>yoru control panel</h1><div class="sub">owner dashboard — commands, economy, verification, servers</div></div>
  <div class="pill" id="status">idle</div>
</header>
<nav>
  <button data-tab="stats" class="on">📊 Statistics</button>
  <button data-tab="commands">⌨️ Commands</button>
  <button data-tab="economy">💰 Economy</button>
  <button data-tab="verify">✅ Verification</button>
  <button data-tab="servers">🌐 Servers</button>
  <button data-tab="audit">📜 Audit log</button>
</nav>

<section id="stats" class="on">
  <div class="card"><div class="grid" id="statgrid"></div></div>
  <div class="card"><h2>Recent activity</h2><div class="log" id="auditmini"></div></div>
</section>

<section id="commands">
  <div class="card"><h2>Command overrides</h2>
    <p class="muted">Toggle any command on/off or restrict it to moderators. Changes apply instantly to the running bot.</p>
    <div style="overflow:auto"><table id="cmdtable"><thead><tr><th>Command</th><th>Category</th><th>Description</th><th>Access</th><th>Enabled</th></tr></thead><tbody></tbody></table></div>
  </div>
</section>

<section id="economy">
  <div class="card"><h2>Economy settings</h2>
    <p class="muted">Tune rewards and cooldowns. Saved to data/economy_settings.json and used live by the economy commands.</p>
    <div class="grid" id="ecogrid"></div>
    <div style="margin-top:16px"><button class="btn primary" onclick="saveEco()">Save economy settings</button></div>
  </div>
</section>

<section id="verify">
  <div class="card"><h2>Verification system</h2>
    <p class="muted">Members run <code>!verify</code> to get the verify role. Configure per server.</p>
    <div id="verifylist"></div>
  </div>
</section>

<section id="servers">
  <div class="card"><h2>Servers</h2><div id="serverlist"></div></div>
</section>

<section id="audit">
  <div class="card"><h2>Audit log</h2><div class="log" id="auditfull"></div></div>
</section>
</div>
<div class="toast" id="toast"></div>
<script>
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $ = id => document.getElementById(id);
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('nav button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  document.querySelectorAll('section').forEach(s=>s.classList.remove('on'));$(b.dataset.tab).classList.add('on');
});
async function api(p,opt){const r=await fetch(p,opt);if(!r.ok)throw new Error(await r.text());return r.json();}

async function loadStats(){
  const d = await api('/api/overview');
  const s = d.stats;
  $('statgrid').innerHTML = [
    ['Uptime', s.uptime], ['Memory', s.memory], ['Node', s.node],
    ['Servers', s.guildCount], ['Members', s.totalMembers],
    ['Commands', s.commandCount], ['Economy accounts', s.ecoAccounts], ['Verified users', s.verified],
  ].map(([k,v])=>'<div class="stat"><div class="v">'+esc(v)+'</div><div class="k">'+esc(k)+'</div></div>').join('');
  const lines = d.audit.map(e=>'<div><b>'+esc(e.time.slice(11,19))+'</b> '+esc(e.actor)+' — '+esc(e.action)+(e.allowed===false?' <span class="no">BLOCKED</span>':'')+'</div>');
  $('auditmini').innerHTML = lines.slice(0,14).join('') || '<div>no activity yet</div>';
  $('auditfull').innerHTML = lines.join('') || '<div>no activity yet</div>';
}

async function loadCommands(){
  const d = await api('/api/commands');
  $('cmdtable').querySelector('tbody').innerHTML = d.commands.map(c=>
    '<tr><td><code>'+esc(c.usage)+'</code></td><td>'+esc(c.category)+'</td><td>'+esc(c.description)+'</td>'+
    '<td>'+(c.perm?'<span class="badge">permission</span> ':'')+(c.modOnly?'<span class="badge">mod only</span>':'')+'</td>'+
    '<td><label class="switch"><input type="checkbox" '+(c.enabled?'checked':'')+' onchange="toggleCmd(\\''+c.name+'\\',this.checked)"><span class="slider"></span></label></td></tr>'
  ).join('');
}
async function toggleCmd(name,on){
  await api('/api/commands/override',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,enabled:on})});
  toast((on?'Enabled ':'Disabled ')+name);
}

const ECO_FIELDS = [
  ['dailyReward','Daily reward'], ['weeklyReward','Weekly reward'], ['monthlyReward','Monthly reward'],
  ['workMin','Work pay min'], ['workMax','Work pay max'], ['workCooldownMin','Work cooldown (min)'],
  ['crimeCooldownMs','Crime cooldown (ms)'], ['stealCooldownMs','Steal cooldown (ms)'],
  ['fishCooldownMs','Fish cooldown (ms)'], ['huntCooldownMs','Hunt cooldown (ms)'],
  ['digCooldownMs','Dig cooldown (ms)'], ['lotteryTicket','Lottery ticket price'], ['bankInterest','Bank interest (x)'],
];
async function loadEco(){
  const s = await api('/api/economy');
  $('ecogrid').innerHTML = ECO_FIELDS.map(([k,l])=>
    '<div><label>'+l+'</label><input id="eco_'+k+'" type="number" step="any" value="'+s[k]+'"></div>').join('');
}
async function saveEco(){
  const payload = {};
  ECO_FIELDS.forEach(([k])=>payload[k]=parseFloat($('eco_'+k).value));
  await api('/api/economy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  toast('Economy settings saved');
}

async function loadVerify(){
  const d = await api('/api/verify');
  $('verifylist').innerHTML = d.guilds.map(g=>{
    const v = d.verify[g.id]||{};
    const roleOpts = '<option value="">(none)</option>'+g.roles.map(r=>'<option value="'+r.id+'" '+(v.roleId===r.id?'selected':'')+'>'+esc(r.name)+'</option>').join('');
    const chOpts = '<option value="">(none)</option>'+g.channels.map(c=>'<option value="'+c.id+'" '+(v.logChannelId===c.id?'selected':'')+'>'+esc(c.name)+'</option>').join('');
    return '<div class="card"><h2 class="gname">'+esc(g.name)+'</h2>'+
      '<div class="grid">'+
      '<div><label>Verification</label><label class="switch"><input type="checkbox" '+(v.enabled?'checked':'')+' onchange="saveVerify(\\''+g.id+'\\',{enabled:this.checked})"><span class="slider"></span></label></div>'+
      '<div><label>Verify role</label><select onchange="saveVerify(\\''+g.id+'\\',{roleId:this.value||null})">'+roleOpts+'</select></div>'+
      '<div><label>Log channel</label><select onchange="saveVerify(\\''+g.id+'\\',{logChannelId:this.value||null})">'+chOpts+'</select></div>'+
      '<div><label>Verified members</label><div class="stat"><div class="v">'+(v.verifiedCount||0)+'</div></div></div>'+
      '</div></div>';
  }).join('') || '<p class="muted">Bot not connected to any server yet.</p>';
}
async function saveVerify(guildId,patch){
  await api('/api/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({guildId,...patch})});
  toast('Verification saved');
}

async function loadServers(){
  const d = await api('/api/overview');
  $('serverlist').innerHTML = d.guilds.map(g=>
    '<div class="card"><h2 class="gname">'+esc(g.name)+'</h2><div class="muted">'+g.memberCount+' members · '+g.id+'</div></div>'
  ).join('') || '<p class="muted">No servers yet.</p>';
}

async function tick(){
  try{
    await loadStats();
    const on = document.querySelector('section.on').id;
    if(on==='commands') await loadCommands();
    if(on==='economy') await loadEco();
    if(on==='verify') await loadVerify();
    if(on==='servers') await loadServers();
  }catch(e){ $('status').textContent='offline'; }
}
loadCommands();loadEco();loadVerify();loadServers();tick();
setInterval(tick,4000);
</script></body></html>`;
