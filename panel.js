/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* Wallet Score side panel: pull a wallet with Helius, find its best filters, score it 0-100 by win rate inside them. */
const $=id=>document.getElementById(id);
// web app: no syncing with a local Filter Finder file
const hubPush=async()=>0,hubPull=async()=>0,hubForget=async()=>{},hubClear=async()=>{};
const MODE=new URLSearchParams(location.search).get('mode')||'panel'; // popup, win (own window) or panel (side panel)
document.body.classList.add(MODE);
const NAMES={};
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};

/* ---------- settings ---------- */
try{const v=chrome.runtime.getManifest().version;$('ver').textContent='v'+v;$('ver').title='Version '+v}catch(e){}
/* Update check: Chrome reads an unpacked extension's files from disk, so manifest.json on disk shows a newer version as soon as
   it's saved to the folder, while getManifest() still reports the version that's running. Clicking the button reloads the extension. */
const verNum=v=>String(v||'').split('.').map(x=>+x||0),verNewer=(a,b)=>{const x=verNum(a),y=verNum(b);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)}return false};
let UPD=null,updArm=0;
async function updCheck(){
  if(typeof chrome==='undefined'||!chrome.runtime||!chrome.runtime.getURL)return;
  try{const m=await (await fetch(chrome.runtime.getURL('manifest.json')+'?t='+Date.now(),{cache:'no-store'})).json(),cur=chrome.runtime.getManifest().version;
    UPD=verNewer(m.version,cur)?m.version:null;const b=$('upd');b.hidden=!UPD;if(UPD)clLoad()}catch(e){}
}
$('upd').addEventListener('click',async()=>{
  const what=[(typeof WB!=='undefined'&&WB.run)&&'the wallet list',(typeof MS!=='undefined'&&MS.running)&&'Automatic',(typeof TT!=='undefined'&&TT.running)&&'Top traders',(typeof HD!=='undefined'&&HD.running)&&'a Holders check',(typeof checking!=='undefined'&&checking)&&'the spike & round-trip check',$('go').disabled&&'a wallet pull'].filter(Boolean);
  if(what.length&&Date.now()-updArm>6000){updArm=Date.now();status(`Still running: ${what.join(', ')}. Updating will stop it. Click "New version available" again to update anyway.`,true);return}
  try{if(!localStorage.getItem('ws-seen-ver'))localStorage.setItem('ws-seen-ver',chrome.runtime.getManifest().version)}catch(e){} // so the next start shows What's new
  $('upd').textContent='Updating…';$('upd').disabled=true;
  try{await chrome.storage.local.set({'ws-reopen':{mode:MODE,at:Date.now()}})}catch(e){}
  chrome.runtime.reload()});
updCheck();setInterval(updCheck,60000);
window.addEventListener('focus',updCheck);document.addEventListener('visibilitychange',()=>{if(!document.hidden)updCheck()});
const RULES_V=28; // scoring-code version: bump whenever adjustScore or the filter search changes, so saved scores get recomputed
const rulesV=()=>RULES_V+':'+scVer(); // also changes when you edit Custom scoring
const DEF={agef:true,gmgn:true,chkall:true,lsauto:true,autotab:false,period:0,rsmin:0,lastn:50,minn:10,slip:0,openloss:true,autocheck:false,nodev:false,maxr:0,offplat:[],adj:true};
let SET={...DEF};try{SET={...DEF,...JSON.parse(store.get('ws-set')||'{}')}}catch(e){}
const saveSet=()=>store.set('ws-set',JSON.stringify(SET));
function cleanKey(v){v=(v||'').trim();const m=v.match(/api-key=([0-9a-fA-F-]{20,})/);return m?m[1]:v}
const getKey=()=>hkActive(); // the first key that still has credits (see engine.js)
function opts(){return {opp:true,lastN:Math.max(5,Math.floor(SET.lastn)||50),days:0,slip:Math.max(0,+SET.slip||0)/100,minN:Math.max(3,Math.floor(SET.minn)||10),openLoss:!!SET.openloss,noDev:!!SET.nodev,maxRounds:+SET.maxr||0,offPlat:Array.isArray(SET.offplat)?SET.offplat:[],hide:true,winWeight:2,supply:1e9,qsLow:true,ageF:SET.agef!==false}}

$('lastn').value=SET.lastn;$('minn').value=SET.minn;$('slip').value=SET.slip;$('openloss').checked=SET.openloss;$('autocheck').checked=SET.autocheck;$('nodev').checked=SET.nodev;$('agef').checked=SET.agef!==false;$('maxr').value=String(SET.maxr||0);
/* ---------- Helius keys: one row per key with its estimated credits this cycle ---------- */
const fmtK=n=>n>=1e6?(+(n/1e6).toFixed(2))+'M':n>=1e3?(+(n/1e3).toFixed(n>=1e5?0:1))+'K':String(Math.round(n));
const ordD=d=>d+(d>=11&&d<=13?'th':['th','st','nd','rd'][d%10]||'th');
let hkAdding=false;
function hkRender(){
  const el=$('hklist');if(!el)return;const l=hkLoad(),act=hkActive(),editing=document.activeElement&&el.contains(document.activeElement);if(editing)return;
  const rows=l.map((e,i)=>{const lim=e.limit||HK_LIMIT,u=e.used||0,p=Math.min(100,u/lim*100),st=e.out==='limit'?['out','Limit reached']:e.out==='rejected'?['out','Rejected']:e.k===act?['on','In use']:['idle','Standby'];
    return `<div class="hk ${st[0]}" data-i="${i}">
      <div class="hktop"><input type="password" class="hkkey" value="${esc(e.k)}" autocomplete="off" spellcheck="false" aria-label="Helius key ${i+1}"><span class="hkst">${st[1]}</span><button type="button" class="icon hkdel" title="Remove this key" aria-label="Remove key ${i+1}">×</button></div>
      <div class="hkbar"><i style="width:${p.toFixed(1)}%"></i></div>
      <div class="hkmeta"><span><b>${fmtK(u)}</b> of ${fmtK(lim)} credits used</span><span>resets on the <select class="hkday" aria-label="Reset day">${[...Array(28)].map((_,d)=>`<option value="${d+1}"${(e.reset||1)===d+1?' selected':''}>${ordD(d+1)}</option>`).join('')}</select> <button type="button" class="linkbtn hkzero" title="Set this key's count back to 0 (for example after checking your Helius dashboard)">reset</button></span></div></div>`});
  if(!l.length||hkAdding)rows.push(`<div class="hk new"><div class="hktop"><input type="password" class="hkkey" data-new="1" placeholder="Paste a Helius key or the full Helius URL" autocomplete="off" spellcheck="false" aria-label="New Helius key"></div></div>`);
  el.innerHTML=rows.join('');
}
$('hklist').addEventListener('change',e=>{const row=e.target.closest('.hk');if(!row)return;const l=hkLoad();
  if(e.target.classList.contains('hkkey')){const k=cleanKey(e.target.value);
    if(e.target.dataset.new){if(k&&!l.some(x=>x.k===k)){l.push({k,used:0,limit:HK_LIMIT,reset:new Date().getDate(),cyc:hkCycle(new Date().getDate())});note('Key added.')}hkAdding=false}
    else{const i=+row.dataset.i;if(!k){l.splice(i,1);note('Key removed.')}else if(k!==l[i].k){l[i]={...l[i],k,used:0,out:null};note('Key replaced.')}}}
  else if(e.target.classList.contains('hkday')){const i=+row.dataset.i;l[i].reset=+e.target.value;l[i].cyc=hkCycle(l[i].reset)}
  hkSave(l);e.target.blur();hkRender()});
$('hklist').addEventListener('click',e=>{const row=e.target.closest('.hk');if(!row||row.classList.contains('new'))return;const i=+row.dataset.i,l=hkLoad();
  if(e.target.closest('.hkdel')){l.splice(i,1);hkSave(l);hkRender();note('Key removed.')}
  else if(e.target.closest('.hkzero')){l[i].used=0;l[i].out=null;hkSave(l);hkRender();note('Count reset to 0.')}});
$('hkadd').addEventListener('click',()=>{hkAdding=true;hkRender();const n=document.querySelector('.hkkey[data-new]');if(n)n.focus()});
hkSave(hkLoad());setTimeout(hkRender,0);setInterval(hkRender,5000); // after the rest of this file has loaded (hkRender uses helpers defined further down)
$('maxr').addEventListener('change',()=>{SET.maxr=+$('maxr').value;saveSet();rerender()});
for(const id of ['lastn','minn','slip'])$(id).addEventListener('change',()=>{SET[id]=+$(id).value;saveSet();if(id!=='lastn')rerender();else status('Analyze tokens: applies the next time you press Score.')});
delete SET.adj; // replaced by Settings → Scoring
for(const id of ['openloss','autocheck','nodev','agef'])$(id).addEventListener('change',()=>{SET[id]=$(id).checked;saveSet();rerender()});
// the Wallet tab's "Auto-check spikes & round-trips" is the same setting as Settings → Check round-trips & entry spikes automatically
$('chkall').checked=SET.chkall!==false;$('wchkscope').value=SET.chkall!==false?'all':'kept';
$('chkall').addEventListener('change',()=>{SET.chkall=$('chkall').checked;$('wchkscope').value=SET.chkall?'all':'kept';saveSet();rerender()});
// the same setting from the Wallet tab: check all analyzed tokens, or only the ones inside the filters (fewer credits)
$('wchkscope').addEventListener('change',()=>{SET.chkall=$('wchkscope').value==='all';$('chkall').checked=SET.chkall;saveSet();rerender()});
$('wautochk').checked=!!SET.autocheck;$('autocheck').addEventListener('change',()=>{$('wautochk').checked=SET.autocheck});
$('wautochk').addEventListener('change',()=>{SET.autocheck=$('wautochk').checked;$('autocheck').checked=SET.autocheck;saveSet();rerender();if(SET.autocheck)runCheck()});
function note(t){$('setnote').textContent=t;clearTimeout(note.t);note.t=setTimeout(()=>$('setnote').textContent='',3500)}
/* ---------- menu (three-line button): settings open as a dropdown under the header ---------- */
const menuBg=document.createElement('div');menuBg.className='menubg';menuBg.hidden=true;document.body.appendChild(menuBg);
menuBg.addEventListener('click',()=>menuSet(false));
// keep the page behind from scrolling without jumping it to the top: swallow wheel/touch scrolling outside the menu
for(const ev of ['wheel','touchmove'])document.addEventListener(ev,e=>{if(!$('settings').hidden&&!$('settings').contains(e.target))e.preventDefault()},{passive:false});
function menuSet(open){$('settings').hidden=!open;$('gear').setAttribute('aria-expanded',open);menuBg.hidden=!open;if(open)menuPlace()} // dark backdrop; the page behind doesn't scroll while settings are open
function menuPlace(){const h=document.querySelector('header').getBoundingClientRect();$('settings').style.top=Math.max(8,Math.round(h.bottom+4))+'px'}
$('gear').addEventListener('click',e=>{e.stopPropagation();menuSet($('settings').hidden)});
$('setclose').addEventListener('click',()=>menuSet(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('settings').hidden)menuSet(false)});
document.addEventListener('mousedown',e=>{const m=$('settings');if(!m.hidden&&!m.contains(e.target)&&!$('gear').contains(e.target))menuSet(false)});
addEventListener('resize',()=>{if(!$('settings').hidden)menuPlace()});
if(!getKey())setTimeout(()=>menuSet(true),0);

/* ---------- formatting ---------- */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=a=>a.slice(0,4)+'…'+a.slice(-4);
const fm=v=>v===Infinity?'No max':v>=1e6?'$'+(+(v/1e6).toFixed(2))+'M':v>=1e3?'$'+(+(v/1e3).toFixed(1))+'K':'$'+Math.round(v);
const fmS=v=>v===Infinity?'No max':(+v.toFixed(2))+' SOL';
const sol=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(2)+' SOL';
const pct=v=>(v>=0?'+':'−')+Math.abs(Math.round(v*100))+'%';
const cls=v=>v>0?'pos':v<0?'neg':'';
const ago=t=>{const m=(Date.now()/1000-t)/60;return m<60?Math.max(1,Math.round(m))+'m':m<1440?Math.round(m/60)+'h':Math.round(m/1440)+'d'};
const metaAll=()=>{try{return JSON.parse(localStorage.getItem('ff-meta')||'{}')}catch(e){return {}}};
const tokUrl=(tok,w)=>'https://gmgn.ai/sol/token/'+encodeURIComponent(tok)+(w?'?maker='+encodeURIComponent(w):'');
// GMGN sometimes drops ?maker= on the first visit, so the wallet is also copied for its Filter Wallet box
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a.gm');if(!a)return;const m=a.href.match(/[?&]maker=([^&]+)/);if(m&&navigator.clipboard)navigator.clipboard.writeText(decodeURIComponent(m[1])).catch(()=>{})},true);
const gradeOf=s=>s==null?['Not enough trades','var(--muted)']:s>=100?['Perfect record','var(--amber)']:s>=80?['Excellent to copy','var(--win)']:s>=65?['Good to copy','var(--win)']:s>=50?['Coin flip','var(--amber)']:['Avoid copying','var(--loss)'];

/* ---------- pulling ---------- */
async function pull(addr,offline){
  const key=getKey();
  if(!key&&!offline)throw new Error('Add your Helius key in Settings (gear icon) first.');
  if(!isAddr(addr))throw new Error('That doesn\'t look like a Solana wallet address.');
  const o=opts();const res=await pullWallet(addr,key,21,m=>status('Pulling '+short(addr)+'… '+m),o.lastN,offline);
  if(!res.raw.length)throw new Error(receiverNote(res)||'No token trades found for this wallet.');
  Object.assign(NAMES,res.names);
  return {...res,wallet:addr};
}
function status(t,err){const s=$('status');s.textContent=t||'';s.className='status'+(err?' err':'');if(typeof WB!=='undefined'&&WB.run){const r=document.querySelector('.wbr.run .st');if(r)r.textContent=(t||'analyzing…').replace(/^Pulling \S+… ?/,'')||'analyzing…'}}

let CUR=null; // {raw,px,wallet,credits,newTx}
async function score(addr,offline,auto){
  $('go').disabled=true;$('keepopen').hidden=!(MODE==='popup'&&!offline);status(offline?'Opening saved wallet…':'Pulling '+short(addr)+'…');
  if(!CUR||CUR.wallet!==addr)$('res').hidden=true; // don't leave the previous wallet's score on screen
  // the quick score from Top traders / Automatic, kept so the Wallet tab can explain a difference
  const quick=CUR&&CUR.wallet===addr&&CUR.quick?CUR.quick:(()=>{try{const q=JSON.parse(localStorage.getItem('ws-tts:'+addr)||'null');return q&&q.src!=='wallet'&&q.score!=null?q:null}catch(e){return null}})();
  try{const w=await pull(addr,offline);w.quick=quick;CUR=w;store.set('ws-last',addr);try{const t=JSON.parse(localStorage.getItem('ws-tt')||'{}');if(t[addr]){delete t[addr];localStorage.setItem('ws-tt',JSON.stringify(t))}}catch(e){} /* opened by hand: show it in history */$('addr').value=addr;rerender();
    status(offline?'Opened from saved history. No Helius credits used.':`Done. ${w.raw.length} tokens · ${w.newTx} new transactions · about ${w.credits} Helius credits.`+(receiverNote(w)?' '+receiverNote(w):''));
    renderHist();hiMaybe();if(!offline)hubPush().catch(()=>{});
    if(offline&&getKey()&&CUR.A){const ms=[...new Set(CUR.A.trades.map(t=>t.tok))],d=devGet();
      if(ms.some(m=>!String(d[m]||'').startsWith('2|')||!(m in ageGet())))devLookup(ms,getKey()).then(n=>{if(CUR&&CUR.wallet===addr){rerender();hubPush().catch(()=>{})}}).catch(()=>{})} // who created each token: in the background
    if(offline&&getKey()&&w.raw.some(r=>(r[27]||r[21])&&!((r[27]||r[21]) in platGet()))){platLookup(w.raw.map(r=>r[27]||r[21]),getKey()).then(()=>{rerender();hubPush().catch(()=>{})}).catch(()=>{})}
    if(SET.autocheck&&!offline&&(!(+SET.rsmin)||(CUR.A&&CUR.A.score!=null&&CUR.A.score>=+SET.rsmin)))await runCheck();
    // saved data older than 30 minutes: fetch only the trades made since (cheap), so recent tokens show up
    if(offline&&!auto&&getKey()&&Date.now()/1000-(w.pulled||0)>1800){$('go').disabled=false;status(`Saved data is from ${ago(w.pulled||0)} ago. Getting the new trades since then…`);return score(addr,false,true)}}
  catch(e){status(e.message,true)}
  finally{$('go').disabled=false;$('keepopen').hidden=true;checkTab()}
}
/* ---------- several wallets at once: paste a list (one per line, or commas/spaces) and every wallet gets analyzed ---------- */
const walletsFrom=v=>{const out=[];for(const m of String(v||'').matchAll(/[1-9A-HJ-NP-Za-km-z]{32,44}/g))if(isAddr(m[0])&&!out.includes(m[0]))out.push(m[0]);return out};
var WB={list:[],run:false,stop:false}; // var: read (typeof) by code that can run before this line
// a text box drops line breaks on paste (the addresses would run together), so read the clipboard text directly
$('addr').addEventListener('paste',e=>{const t=(e.clipboardData||window.clipboardData).getData('text');const ws=walletsFrom(t);
  if(ws.length>1){e.preventDefault();$('addr').value=ws.join(', ');status(`${ws.length} wallets pasted. Press Score to analyze them all (about 100+ Helius credits each; saved wallets only fetch new trades).`)}});
function wbRender(){const b=$('wbatch');if(!WB.list.length){b.hidden=true;return}b.hidden=false;
  const done=WB.list.filter(x=>x.st==='done').length,err=WB.list.filter(x=>x.st==='err').length;
  $('wbtitle').textContent=WB.run?`Analyzing ${Math.min(done+err+1,WB.list.length)} of ${WB.list.length} wallets`:`${done} of ${WB.list.length} wallets analyzed`;
  $('wbsub').textContent=WB.run?`Up to the newest ${opts().lastN} tokens per wallet (last 31 days)${SET.autocheck?', plus the spike & round-trip check on tokens inside its filters':''}. The next wallet is pulled in the background while this one finishes.`:(err?`${err} couldn't be analyzed (hover for why). `:'')+'Sorted by score. Tap one to open its full analysis (free, from saved trades).';
  $('wbstop').hidden=!WB.run;$('wbclose').hidden=WB.run;
  const L=WB.run?WB.list:[...WB.list].sort((a,b)=>((b.sc??-1)-(a.sc??-1)));
  $('wblist').innerHTML=L.map((x,i)=>{const col=x.sc!=null?scColor(x.sc):'';
    const right=x.st==='done'?(x.sc!=null?`<span class="sc" style="color:${col};background:color-mix(in srgb,${col} 14%,transparent)">${x.sc}</span>`:'<span class="st">no score</span>'):x.st==='run'?'<span class="st">analyzing…</span>':x.st==='err'?'<span class="st" style="color:var(--loss)">failed</span>':'<span class="st">waiting</span>';
    // the address opens the wallet on GMGN; the rest of a finished row reopens its full analysis here
    return `<div class="wbr${x.st==='run'?' run':''}${x.st==='done'?' ok':''}" data-w="${esc(x.w)}" title="${esc(x.msg||(x.st==='done'?'Open the full analysis (free)':x.w))}"><span class="rk">${i+1}</span><span><a class="wa gm" href="https://gmgn.ai/sol/address/${encodeURIComponent(x.w)}" target="_blank" rel="noopener" title="Open on GMGN">${esc(short(x.w))} ↗</a>${x.grade?` <span class="st">· ${esc(x.grade)}</span>`:''}</span>${right}</div>`}).join('')}
const scColor=n=>n>=100?'var(--amber)':n>=65?'var(--win)':n>=50?'var(--amber)':'var(--loss)';
async function wbRun(ws){if(WB.run)return;WB.list=ws.map(w=>({w,st:'wait'}));WB.run=true;WB.stop=false;wbRender();
  const key=getKey(),o=opts();
  for(let i=0;i<WB.list.length;i++){const x=WB.list[i];if(WB.stop)break;x.st='run';wbRender();
    // while this wallet is analyzed, the next one's trades are already being pulled (shares the 3-request Helius lane),
    // so its own turn only has to fetch the last few seconds of trades
    const nx=WB.list[i+1];if(nx&&key&&!nx.pre)nx.pre=pullWallet(nx.w,key,21,()=>{},o.lastN,false,false).catch(()=>{});
    if(x.pre){status('Pulling '+short(x.w)+'… finishing the pull started in the background');await x.pre}
    await score(x.w,false);
    if(CUR&&CUR.wallet===x.w&&CUR.A){x.st='done';x.sc=CUR.A.score;x.grade=gradeOf(CUR.A.best?CUR.A.score:null)[0]}else{x.st='err';x.msg=$('status').textContent}
    wbRender()}
  WB.run=false;for(const x of WB.list)if(x.st==='wait'||x.st==='run')x.st='wait';wbRender();
  const ok=WB.list.filter(x=>x.st==='done').length;status(`${WB.stop?'Stopped. ':''}Analyzed ${ok} of ${WB.list.length} wallets.`)}
$('wbstop').addEventListener('click',()=>{WB.stop=true;$('wbstop').textContent='Stopping after this one…'});
$('wbclose').addEventListener('click',()=>{WB.list=[];wbRender()});
$('wblist').addEventListener('click',e=>{if(e.target.closest('a'))return;const b=e.target.closest('.wbr');if(!b||!b.classList.contains('ok')||WB.run)return;$('addr').value=b.dataset.w;score(b.dataset.w,!!histIndex()[b.dataset.w])});
$('form').addEventListener('submit',e=>{e.preventDefault();const ws=walletsFrom($('addr').value);
  if(ws.length>1){if(!WB.run){$('wbstop').textContent='Stop';wbRun(ws)}return}
  score(ws[0]||$('addr').value.trim(),false)});

/* ---------- score adjustments: activity, holding time, last 7 days of profit ---------- */
const fmtHold=m=>m<1?Math.round(m*60)+'s':m<60?(m<10?(+m.toFixed(1)):Math.round(m))+'m':(+(m/60).toFixed(1))+'h';
// share of closed tokens held under 10 seconds (bought and dumped almost instantly), needs 5+ closed tokens
function fastShareOf(list){const h=list.filter(t=>!t.open&&t.hold!=null&&t.hold>=0);if(h.length<5)return null;const c=SC(),f=h.filter(t=>t.hold*60<c.fastSec).length,fF=h.filter(t=>t.hold*60<c.flipSec).length,fS=h.filter(t=>t.hold*60<c.shortSec).length;return {share:f/h.length,n:f,of:h.length,shareF:fF/h.length,nF:fF,shareS:fS/h.length,nS:fS}}
function avgHoldOf(list){const h=list.map(t=>t.hold).filter(x=>x!=null&&x>=0);return h.length?h.reduce((a,b)=>a+b,0)/h.length:null}
// realized profit per day over the 7 days before the pull (each token counted on the day of its last sell)
function pnl7Of(all,ref,solUsd){
  if(!ref)return null;const wk=ref-7*86400,days={};
  for(const t of all){if(t.open||!t.lastSell||t.lastSell<wk||t.lastSell>ref+3600)continue;const d=new Date(t.lastSell*1000).toDateString();days[d]=(days[d]||0)+(t.sellSol-t.buySol)}
  const v=Object.values(days);if(!v.length)return null;const tot=v.reduce((a,b)=>a+b,0);
  return {days:v.length,pos:v.filter(x=>x>0).length,neg:v.filter(x=>x<0).length,totUsd:tot*solUsd,perDay:tot*solUsd/v.length};
}
const usd0=x=>(x<0?'−$':'$')+Math.abs(Math.round(x)).toLocaleString();
/* the wallet beyond its best filter: win rate over every analyzed trade, and its last 7 days (all trades, and those inside the filters) */
function formOf(U,kept,o,ref){const wk=(ref||Date.now()/1000)-7*86400,st=l=>{let n=0,w=0,p=0;for(const t of l){const x=adjRet(t,o);if(x==null)continue;n++;if(isWin(x))w++;p+=x*t.buySol}return {n,win:n?w/n:0,pnl:p}};
  return {all:st(U),kept:st(kept),rec:st(U.filter(t=>t.t>=wk)),recF:st(kept.filter(t=>t.t>=wk))}}
function adjustScore(base,buys7,est,hold,p7,perfect,n,fast,rs,trades7,form){ // every number here comes from SC(): the defaults (Automatic) or your own (Custom)
  if(base==null)return {score:null,parts:[]};const parts=[],c=SC(),on=c.on;
  const act=trades7!=null?trades7:buys7!=null?buys7*2:null; // 7-day trades (buys + sells); older saved data only has buys
  // dealbreakers that also stop a perfect 100: very busy (top activity tier), every trading day red, quick flipper
  const heavyBuys=on.act&&act!=null&&act>=c.actHi,allRed=on.p7&&p7&&p7.pos===0&&p7.neg>0,flipper=on.flip&&fast&&fast.shareF>=c.flipShare/100;
  // a perfect record inside the filters only counts if the wallet holds up outside them too: overall win rate, a mostly-green week, recent trades not losing
  const allW=form&&form.all.n?form.all.win*100:null,recUse=form?(form.recF.n>=3?form.recF:form.rec):null,recW=recUse&&recUse.n>=Math.min(3,c.recMinN)?recUse.win*100:null;
  // short-hold strategy: most tokens sold within ~40s. Its win rate doesn't carry over to a copier, so the score is capped (60 by default)
  const shortHold=on.short&&fast&&fast.shareS>=c.shortShare/100;
  const shaky=shortHold||(on.overall&&allW!=null&&allW<c.perfAll)||(on.p7&&p7&&p7.neg>p7.pos)||(on.form&&recW!=null&&recUse.n>=c.recMinN&&recW<c.recMid);
  if(on.perfect&&perfect&&!heavyBuys&&!allRed&&!flipper&&!shaky)return {score:100,parts,perfect};
  // too few tokens to judge, applied after the cap so bonuses can't cancel it
  const few=on.few&&n!=null&&n<3?[n<=1?c.few1:c.few2,`only ${n} token${n===1?'':'s'} to judge`]:null;
  const cap=shortHold?Math.min(on.perfect?Math.min(99,c.cap):100,c.shortCap):on.perfect?Math.min(99,c.cap):100;
  const done=()=>{const raw=parts.reduce((a,p)=>a+p[0],base),s1=Math.min(cap,raw);
    if(raw>cap)parts.push([cap-raw,shortHold?`capped at ${cap}: ${Math.round(fast.shareS*100)}% of tokens sold within ${c.shortSec}s (${fast.nS}/${fast.of}), a copier can't keep up`:`capped at ${cap}${on.perfect?` (100 needs ${c.perfectN}+ tokens, all profitable)`:''}`]);if(few&&few[0])parts.push(few);return {score:Math.max(0,s1+(few?few[0]:0)),parts}};
  const add=(v,l)=>{if(v)parts.push([v,l])};
  // filters turn a losing wallet profitable: its weak overall numbers and red days matter less, because a copier using the filters skips those trades
  const rescued=on.rescue&&form&&form.kept&&form.kept.n>=c.rescueN&&form.kept.pnl>0&&form.all.pnl<0,rTag=' (softened: filters make it profitable)';
  if(on.overall&&allW!=null&&form.all.n>=5){const lab=`${Math.round(allW)}% win over all ${form.all.n} trades analyzed`,v=allW<c.allLow?c.allLowPts:allW<c.allMid?c.allMidPts:0;
    if(v)rescued?add(Math.round(v*c.rescueAll/100),lab+rTag):add(v,lab)}
  // filters make the difference: much more profit inside the filters than without them (a loser overall counts as the biggest jump)
  if(on.edge&&form&&form.kept&&form.kept.n>=c.edgeN&&form.kept.pnl>=c.edgeMin){const k=form.kept,a=form.all,x=a.pnl>0?k.pnl/a.pnl:Infinity,up=(k.win-a.win)*100;
    const lab=`filters: ${sol(k.pnl)} vs ${sol(a.pnl)} without${x!==Infinity?` (${x>=10?Math.round(x):+x.toFixed(1)}×)`:''}`;
    if(x>=c.edgeX2&&up>=c.edgeWinUp)add(c.edgePts2,lab+`, win rate +${Math.round(up)} pts`);else if(x>=c.edgeX1)add(c.edgePts1,lab)}
  if(on.form&&form&&form.rec.n>=c.recMinN){
    if(form.recF.n>=3||form.rec.n){const u=form.recF.n>=3?form.recF:form.rec,w=Math.round(u.win*100),lab=`last 7 days: ${w}% win over ${u.n} trade${u.n===1?'':'s'}${u===form.recF?' in filters':''}`;
      if(w<c.recLow)add(c.recLowPts,lab);else if(w<c.recMid)add(c.recMidPts,lab)}
    if(!form.recF.n&&base>=60)add(c.recNone,`none of its last ${form.rec.n} trades (7 days) fit the recommended filters`)}
  // a strong win rate inside the filters earns a bonus (needs enough trades so 2 lucky wins don't count)
  if(on.winhi&&base>c.winHi&&n!=null&&n>=c.winHiN)add(c.winHiPts,`win rate ${base}% in filters (over ${c.winHi}%)`);
  if(on.win){if(base<c.winLow)add(c.winLowPts,`win rate ${base}% (under ${c.winLow}%)`);else if(base<=c.winMid)add(c.winMidPts,`win rate ${base}% (${c.winMid}% or less)`)}
  if(on.act&&act!=null){const lab=`${est||trades7==null?'~':''}${act.toLocaleString()} trades in 7 days${buys7!=null?` (${buys7.toLocaleString()} buys)`:''}`;
    if(act>=c.actHi)add(c.actHiPts,lab+` (${c.actHi.toLocaleString()}+)`);else if(act>c.actMid)add(c.actMidPts,lab+` (over ${c.actMid.toLocaleString()})`);else if(buys7!=null&&buys7<c.buysLow)add(c.buysLowPts,lab)}
  if(on.hold&&hold!=null&&!flipper){const lab=`avg hold ${fmtHold(hold)}`;
    if(hold*60<c.holdShort)add(c.holdShortPts,lab);else if(hold*60>c.holdLong&&c.holdMax>0)add(Math.max(1,Math.min(c.holdMax,Math.round(c.holdMax*0.625*Math.log(Math.max(hold,1.0001))/Math.log(15)))),lab)}
  if(flipper)add(c.flipPts,`quick flipper: ${Math.round(fast.shareF*100)}% of tokens sold within ${c.flipSec}s (${fast.nF}/${fast.of})`);
  else if(on.fast&&fast&&fast.share>=c.fT1/100){const sh=fast.share*100,v=sh>=c.fT4?c.fP4:sh>=c.fT3?c.fP3:sh>=c.fT2?c.fP2:c.fP1;add(v,`${Math.round(sh)}% of tokens held under ${c.fastSec}s (${fast.n}/${fast.of})`)}
  if(on.p7&&p7){
    if(p7.pos>p7.neg){const v=p7.perDay<c.g1?c.gP1:p7.perDay<c.g2?c.gP2:p7.perDay<c.g3?c.gP3:c.gP4;add(v,`${p7.pos}/${p7.days} days green, ~${usd0(p7.perDay)}/day`)}
    else if(allRed)add(c.allRedPts,`all ${p7.days} trading day${p7.days===1?'':'s'} red in 7d, ${usd0(p7.totUsd)}`);
    else if(p7.neg>p7.pos){const v=p7.totUsd<0?c.redLossPts:c.redPts,lab=`${p7.neg}/${p7.days} days red, ${usd0(p7.totUsd)} in 7d`;rescued&&v<c.rescueRed?add(c.rescueRed,lab+rTag):add(v,lab)}}
  if(rs&&rs.checked>=c.sMinChecked){
    if(on.spike&&rs.spN>=c.sMinChecked&&rs.share*100>=c.sT1){const sh=rs.share*100;add(sh>=c.sT3?c.sP3:sh>=c.sT2?c.sP2:c.sP1,`${rs.heavy}/${rs.spN} buys spiked ${c.spikeRise}%+ (copiers pay more)`)}
    if(on.spike&&rs.heavy>=2&&rs.heavy>rs.rt)add(c.sMorePts,`more heavy spikes (${rs.heavy}) than +${c.rtPct}% round-trips (${rs.rt})`);
    else if(on.rt&&rs.rt>=c.rtN1&&rs.rt>=rs.heavy)add(rs.rt>=c.rtN3?c.rP3:rs.rt>=c.rtN2?c.rP2:c.rP1,`${rs.rt} round-trips of +${c.rtPct}% (take-profit upside)`)}
  return done();
}

/* ---------- tighten the recommended filters: cut off weak market-cap or buy-size ranges at either end ----------
   A range at the bottom or top of the filter that wins under 35% (3+ trades) is cut, as long as what's left
   wins more often, still makes money, and keeps at least "Min trades per filter" trades. Middle ranges can't be cut by a min/max filter. */

// big winners the recommended filters leave out: 2+ trades of +100% outside them. Shows the wider filter that would catch them,
// and whether that range still holds up without them (if not, it's most likely luck, so the filters stay as they are)
function bigWinners(A){
  const f=A.best;if(!f)return null;const o=A.o,big=A.U.filter(t=>!inF(t,f)&&(adjRet(t,o)||0)>=1).sort((x,y)=>adjRet(y,o)-adjRet(x,o));if(big.length<2)return null;
  const dn=(arr,v)=>{let r=arr[0];for(const x of arr)if(x<=v)r=x;return r},up=(arr,v)=>{for(const x of arr)if(x>v)return x;return Infinity};
  const w={lo:Math.min(f.lo,dn(MC,Math.min(...big.map(t=>t.mcap)))),hi:Math.max(f.hi,up(MC,Math.max(...big.map(t=>t.mcap)))),slo:Math.min(f.slo,dn(SG,Math.min(...big.map(t=>t.firstSol)))),shi:Math.max(f.shi,up(SG,Math.max(...big.map(t=>t.firstSol))))};
  const wl=A.U.filter(t=>inF(t,w)),ws=summarize(wl,o),rest=summarize(wl.filter(t=>!big.includes(t)),o),k=A.kept;
  const holds=rest.n>=o.minN&&rest.pnl>k.pnl&&rest.win>=k.win-0.05; // still better without the big wins: a real edge, not luck
  const names=big.slice(0,3).map(t=>`<b>${esc(NAMES[t.tok]||short(t.tok))}</b> <span class="pos">${pct(adjRet(t,o))}</span>`).join(', ')+(big.length>3?` and ${big.length-3} more`:'');
  const wf=`${w.lo?fm(w.lo):'$0'}–${fm(w.hi)} market cap · ${w.slo===0&&w.shi===Infinity?'any buy size':(w.slo?fmS(w.slo):'0 SOL')+'–'+fmS(w.shi)}`;
  const on=!!CUR.wideOn;
  const html=`<div class="tipline bignote"><span class="tag big">Big winners left out</span> ${names} ${big.length>3?'are':big.length>1?'are both':'is'} outside these filters.
    A wider filter (<button type="button" class="widebtn linkbtn">${wf}</button>) would make <b class="${cls(ws.pnl)}">${sol(ws.pnl)}</b> instead of ${sol(k.pnl)}, at ${Math.round(ws.win*100)}% win instead of ${Math.round(k.win*100)}%.
    ${holds?`<b class="pos">Worth a look:</b> even without those ${big.length} trades the wider range makes ${sol(rest.pnl)} at ${Math.round(rest.win*100)}% win.`
      :`<b>Not recommended yet:</b> without those ${big.length} trades the wider range makes ${sol(rest.pnl)} at ${Math.round(rest.win*100)}% win, so the extra profit depends on ${big.length} trades. Not enough trades yet to tell if it repeats.`}
    <button type="button" class="run widebtn">${on?'Hide the wider filter':'Show stats with the wider filter'}</button></div>`;
  return {html,w,list:wl,label:wf};
}
// token age filter: once market cap and buy size are set, also pick a min / max token age (time from the token's creation to
// the wallet's buy) when that clearly does better: at least 15% higher on profit × win rate², still profitable, still enough trades
function ageFilter(f,U,o){
  if(!f||!o.ageF)return f;const list=U.filter(t=>inF(t,f)),known=list.filter(t=>t.age!=null);if(known.length<Math.max(6,Math.ceil(o.minN*0.6)))return f;
  // age edges: the fixed steps plus whole days right around this wallet's own trades (so 30-day-old winners and 255-day-old losers
  // can be split at 31 days, not just at the nearest fixed step)
  const E=[...new Set([...AG,...known.filter(t=>t.age>=24).flatMap(t=>[Math.floor(t.age/24)*24,Math.ceil(t.age/24)*24+24])])].sort((x,y)=>x-y);
  const val=s=>s.pnl>0?s.pnl*s.win*s.win:s.pnl,cur=summarize(list,o),need=Math.max(Math.min(o.minN,list.length-2),Math.ceil(list.length*0.4)),c=[];
  for(let a=0;a<E.length;a++)for(let b=a+1;b<E.length;b++){if(a===0&&b===E.length-1)continue;
    const sub=list.filter(t=>t.age==null||(t.age>=E[a]&&t.age<E[b]));if(sub.length<need||list.length-sub.length<2)continue;
    const s=summarize(sub,o);if(s.pnl<=0)continue;const v=val(s);if(v>val(cur)*1.15)c.push({a,b,v,s})}
  if(!c.length)return f;
  // the widest range that's within 10% of the best one: a broad age rule holds up better than a narrow, lucky window
  const top=Math.max(...c.map(x=>x.v)),best=c.filter(x=>x.v>=top*0.9).sort((x,y)=>y.s.n-x.s.n||y.v-x.v)[0];
  if(!best)return f;
  return {...f,alo:E[best.a],ahi:E[best.b],n:best.s.n,win:best.s.win,pnl:best.s.pnl,ageGain:{from:cur,to:best.s}};
}
function trimWeakEdges(best,U,o){
  if(!best)return {best,trims:[]};
  const f={...best},trims=[];
  const dims=[{k:'mc',val:t=>t.mcap,groups:mcGroups,lo:'lo',hi:'hi',name:'market cap'},{k:'sz',val:t=>t.firstSol,groups:sizeGroups,lo:'slo',hi:'shi',name:'buy size'}];
  for(const d of dims)for(let it=0;it<4;it++){
    const list=U.filter(t=>inF(t,f));if(list.length<=o.minN)break;
    const g=d.groups(list);if(!g||g.length<2)break;
    const rows=groupRows(list,g,d.val,o);if(rows.length<2)break;
    const cut=(r,side)=>{if(!SC().on.weak||r.s.n<3||r.s.win>=SC().weakWin/100)return false;
      const nb=side==='lo'?rows[1]:rows[rows.length-2],edge=side==='lo'?nb.lo:(r.inc?(nb.hi+r.lo)/2:r.lo);
      const nf={...f,[side==='lo'?d.lo:d.hi]:edge},rest=U.filter(t=>inF(t,nf)),sr=summarize(rest,o),sl=summarize(list,o);
      if(rest.length<o.minN||sr.pnl<=0||sr.win<=sl.win)return false;
      Object.assign(f,nf);trims.push(`${r.label} ${d.name} (${Math.round(r.s.win*100)}% win, ${r.s.n} trades)`);return true};
    if(!(cut(rows[0],'lo')||cut(rows[rows.length-1],'hi')))break}
  // QuickSells Low MC still inside the filters: raise Min market cap to $5K to block them, if enough trades are left
  {const list=U.filter(t=>inF(t,f)),qs=list.filter(isQS);
    if(qs.length>=2&&f.lo<SC().qsMc){const nf={...f,lo:SC().qsMc},rest=U.filter(t=>inF(t,nf));
      if(rest.length>=o.minN&&summarize(rest,o).pnl>=summarize(list,o).pnl){Object.assign(f,nf);trims.push(`QuickSells Low MC: ${qs.length} token${qs.length>1?'s':''} sold within ${SC().qsSec}s under ${fm(SC().qsMc)} (counted as losses for a copier) → Min market cap ${fm(SC().qsMc)}`)}}}
  if(trims.length){const k=summarize(U.filter(t=>inF(t,f)),o);Object.assign(f,{n:k.n,win:k.win,pnl:k.pnl})}
  return {best:f,trims};
}

/* ---------- analysis ---------- */
function analyze(){
  const o=opts(),all=hydrate(CUR.raw,CUR.px,o),ag=ageGet();for(const t of all){t.dev=isDev(t.tok,CUR.wallet);const c=ag[t.tok];t.age=c&&t.t>=c?(t.t-c)/3600:null} // age: hours since the token was created, at the wallet's first buy
  // period cut-off (Wallet tab only): tokens first bought in the last 7 / 14 / 30 days, or all of them
  const days=+SET.period||0,cut=days?(CUR.ref||CUR.pulled||Date.now()/1000)-days*86400:0,trades=days?all.filter(t=>t.t>=cut):all;
  const U=recent(trades,o).filter(t=>adjRet(t,o)!==null);
  const base=summarize(U,o),{best:best0}=optimize(U,o),{best:best1,trims}=trimWeakEdges(best0,U,o),best=ageFilter(best1,U,o);
  const keptList=best?U.filter(t=>inF(t,best)):U;
  const kept=summarize(keptList,o);
  const sc=U.length?Math.round((best?kept.win:base.win)*100):null;
  const perfect=kept.n>=SC().perfectN&&kept.win===1?kept.n:0; // enough trades, all profitable: a perfect 100
  const hold=avgHoldOf(U),p7=pnl7Of(recent(trades,{...o,offPlat:[]}),CUR.ref||CUR.pulled,CUR.px||150),rs=rsOf(keptList,o),adj=adjustScore(sc,CUR.buys7,CUR.buys7est,hold,p7,perfect,kept.n,fastShareOf(U),rs,CUR.trades7,formOf(U,keptList,o,CUR.ref||CUR.pulled));
  return {o,trades,U,base,best,keptList,kept,winScore:sc,hold,adj,score:adj.score,trims,rs,days,allN:recent(all,o).length};
}
let VIEW='kept';
function rerender(){if(!CUR)return;const A=analyze();CUR.A=A;
  if(!A.days)store.set('ws-score:'+CUR.wallet,String(A.score??'')); // a shorter period is a what-if view: saved scores stay on all tokens
  periodNote(A);if(!A.days)gmPublish(A);
  // the same score goes to Top traders and Automatic, so all three tabs show one number for a wallet
  if(A.score!=null&&!A.days&&typeof WB!=='undefined'){const x=WB.list.find(x=>x.w===CUR.wallet);if(x&&x.st==='done'&&x.sc!==A.score){x.sc=A.score;x.grade=gradeOf(A.best?A.score:null)[0];wbRender()}} // keep the wallet list in step with the latest analysis
  if(A.score!=null&&!A.days){try{lsPut('ws-tts:'+CUR.wallet,JSON.stringify({rv:rulesV(),score:A.score,win:A.winScore,parts:A.adj.parts,perfect:A.adj.perfect||0,reliable:!!A.best,n:A.kept.n,all:A.U.length,pnl:A.kept.pnl,hold:A.hold,buys7:CUR.buys7,src:'wallet'}))}catch(e){}}
  $('res').hidden=false;
  // score ring
  const s=A.score,[g,col]=gradeOf(A.best?s:null);
  $('score').textContent=s??'–';
  document.querySelector('.scorecard').classList.toggle('gold',A.best!=null&&s===100);document.querySelector('.scorecard').classList.toggle('great',A.best!=null&&s>=90&&s<100);
  const rv=$('ringval');rv.style.stroke=col;rv.style.strokeDashoffset=String(314.16*(1-(s||0)/100));
  $('grade').textContent=A.best?g:'No reliable filter yet';$('grade').style.color=A.best?col:'var(--amber)';
  const k=A.kept,b=A.base;
  $('why').innerHTML=A.best
    ?`Wins <b>${Math.round(k.win*k.n)} of ${k.n}</b> trades inside these filters${SC().on.winmin&&SC().winMin>0?` <span class="hint">(win = +${SC().winMin}% or more)</span>`:''}${k.n<15?' <span class="amb">· small sample</span>':''}${(()=>{const q=A.U.filter(t=>inF(t,A.best)&&isQS(t)).length;return q?` <span class="neg">· ${q} QuickSell${q>1?'s':''} counted as loss${q>1?'es':''}</span>`:''})()}. Without filters: <b>${Math.round(b.win*100)}%</b> of ${b.n}.`
    :`Wins <b>${Math.round(b.win*100)}%</b> of ${b.n} trades, but no filter has at least ${A.o.minN} trades. Lower "Min trades per filter" or analyze more tokens.`;
  if(A.adj.perfect)$('why').innerHTML+=`<span class="adjline"><b class="gold">Perfect record: ${A.adj.perfect}/${A.adj.perfect} trades profitable → 100</b></span>`;
  else if(A.adj.parts.length)$('why').innerHTML+=`<span class="adjline">Win rate ${A.winScore}${A.adj.parts.map(([v,l])=>` <b class="${v<0?'neg':'pos'}">${v>0?'+':'−'}${Math.abs(v)}</b> ${esc(l)}`).join(' ·')}</span>`;
  const devN=A.trades.filter(t=>t.dev).length;
  // scored differently in Top traders / Automatic? say what the full analysis found that the quick scan didn't
  const q=CUR.quick;if(q&&A.score!=null&&Math.abs(q.score-A.score)>=10){const norm=l=>String(l).replace(/[−+\-]?[\d.,]+[%sKMk]*/g,'#').trim(),fp=A.adj.parts,qp=q.parts||[];
    const added=fp.filter(p=>!qp.some(x=>norm(x[1])===norm(p[1]))),gone=qp.filter(p=>!fp.some(x=>norm(x[1])===norm(p[1]))),pts=([v,l])=>`<b class="${v<0?'neg':'pos'}">${v>0?'+':'−'}${Math.abs(v)}</b> ${esc(l)}`;
    const why=[];if(q.all!=null&&q.all!==A.U.length)why.push(`trades analyzed ${q.all} → ${A.U.length}${A.U.length>q.all?' (newer trades fetched)':''}`);
    if(q.n!=null&&A.best&&q.n!==k.n)why.push(`trades in filters ${q.n} → ${k.n}`);if(q.win!=null&&A.winScore!=null&&q.win!==A.winScore)why.push(`win rate ${q.win} → ${A.winScore}`);
    if(added.length)why.push('new: '+added.map(pts).join(' · '));if(gone.length)why.push('no longer applies: '+gone.map(pts).join(' · '));
    $('why').innerHTML+=`<span class="quicknote">Top traders' quick scan scored this <b>${q.score}</b>; the full analysis gives <b>${A.score}</b>.${why.length?' What changed: '+why.join('; ')+'.':''}${q.rv!==rulesV()?' (The quick score was also from older scoring rules.)':''}</span>`}
  if(devN)$('why').innerHTML+=` <span class="devnote"><span class="tag devt">DEV</span> created ${devN} of the tokens it bought${A.o.noDev?' (left out)':''}</span>`;
  const wl=$('wlink');wl.href='https://gmgn.ai/sol/address/'+encodeURIComponent(CUR.wallet);wl.textContent=short(CUR.wallet)+' on GMGN ↗';
  // filters
  const f=A.best;
  $('filters').innerHTML=f?[['Min market cap',f.lo?fm(f.lo):'$0',f.lo],['Max market cap',fm(f.hi),f.hi],['Min SOL buy',f.slo?fmS(f.slo):'0 SOL',f.slo],['Max SOL buy',fmS(f.shi),f.shi]].concat(f.alo!=null?[['Min token age',f.alo?fmAge(f.alo):'Any',f.alo?fmAge(f.alo):''],['Max token age',fmAge(f.ahi),f.ahi===Infinity?'':fmAge(f.ahi)]]:[])
    .map(([n,v,raw])=>`<button type="button" class="fv" data-copy="${raw===Infinity?'':esc(raw)}"><span class="k">${n}</span><span class="v">${esc(v)}</span></button>`).join('')
    :'<p class="empty">Not enough trades to pick filters.</p>';
  $('kpis').innerHTML=[['Profit',sol(k.pnl),cls(k.pnl)],['Return',pct(k.roi),cls(k.roi)],['Trades kept',`${k.n}/${b.n}`,'']]
    .map(([n,v,c])=>`<div class="kpi"><span class="k">${n}</span><span class="v ${c}">${v}</span></div>`).join('')+
    (f?`<div class="kpi"><span class="k">All trades</span><span class="v ${cls(b.pnl)}">${sol(b.pnl)}</span></div><div class="kpi"><span class="k">All win rate</span><span class="v">${Math.round(b.win*100)}%</span></div>`:'');
  if(A.trims&&A.trims.length)$('kpis').innerHTML+=`<p class="tipline trimnote">Skips weak ranges: ${A.trims.map(esc).join(' · ')}.</p>`;
  if(f&&f.ageGain){const a=f.ageGain.from,b=f.ageGain.to;$('kpis').innerHTML+=`<p class="tipline agenote"><span class="tag age">Token age</span> Only tokens ${f.alo?fmAge(f.alo)+' to '+fmAge(f.ahi):'under '+fmAge(f.ahi)} old when it bought${f.alo&&f.ahi===Infinity?'':''}: ${Math.round(a.win*100)}% → <b>${Math.round(b.win*100)}%</b> win, ${sol(a.pnl)} → <b class="${cls(b.pnl)}">${sol(b.pnl)}</b> (${a.n-b.n} trade${a.n-b.n>1?'s':''} left out).</p>`}
  {const qs=A.U.filter(isQS),inside=A.best?qs.filter(t=>inF(t,A.best)):qs;
    if(qs.length)$('kpis').innerHTML+=`<p class="tipline qsnote"><span class="tag qs">QuickSell Low MC</span> ${qs.length} token${qs.length>1?'s were':' was'} sold within ${SC().qsSec}s after buying under ${fm(SC().qsMc)}. Counted as losses: a copy bot buys later and can't sell that fast.${inside.length?` <b>Suggested: Min market cap ${fm(SC().qsMc)}</b> to block ${inside.length>1?'them':'it'}.`:A.best&&A.best.lo>=SC().qsMc?' Your Min market cap already blocks them.':''}</p>`}
  renderCmp(A);
  renderSZ(A);renderPL(A);renderRT(A);renderRE(A);renderToks(A);
  $('foot').innerHTML=`Trades up to ${CUR.pulled?esc(ago(CUR.pulled))+' ago':'now'} · <button type="button" class="linkbtn footup" id="footup">update</button> · `+esc(`Last ${A.o.lastN} tokens bought · fill gap ${Math.round(A.o.slip*100)}% · ${A.o.openLoss?'unsold counted as losses':'unsold left out'}${A.o.offPlat.length?' · without '+A.o.offPlat.join(', '):''}`);
}
$('filters').addEventListener('click',e=>{const b=e.target.closest('.fv');if(!b)return;const v=b.dataset.copy;
  if(navigator.clipboard)navigator.clipboard.writeText(v).catch(()=>{});
  const k=b.querySelector('.k'),old=k.textContent;b.classList.add('copied');k.textContent=v?'Copied':'No max: leave blank';setTimeout(()=>{b.classList.remove('copied');k.textContent=old},1100)});

/* ---------- side by side: the trades inside the recommended filters vs every trade analyzed ---------- */
function cmpStats(list,o,ref){const rs=list.map(t=>[t,adjRet(t,o)]).filter(([,r])=>r!=null),n=rs.length;if(!n)return null;
  let pnl=0,inv=0,w=0,big=0;const wins=[],losses=[],holds=[];
  for(const [t,r] of rs){pnl+=r*t.buySol;inv+=t.buySol;if(isWin(r)){w++;wins.push(r)}else losses.push(r);if(r>=1)big++;if(t.hold!=null&&!t.open)holds.push(t.hold)}
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null,wk=(ref||Date.now()/1000)-7*86400,rec=rs.filter(([t])=>t.t>=wk),rw=rec.filter(([,r])=>isWin(r)).length;
  return {n,win:w/n,pnl,roi:inv?pnl/inv:0,avgWin:avg(wins),avgLoss:avg(losses),big,hold:median(holds),recN:rec.length,recWin:rec.length?rw/rec.length:null}}
function renderCmp(A){
  const card=$('cmpcard');if(!A.best||!A.U.length){card.hidden=true;return}card.hidden=false;
  const ref=CUR.ref||CUR.pulled,f=cmpStats(A.keptList,A.o,ref),a=cmpStats(A.U,A.o,ref);if(!f||!a){card.hidden=true;return}
  const bw=bigWinners(A),wd=bw&&CUR.wideOn?cmpStats(bw.list,A.o,ref):null; // the wider filter that would catch the big winners, shown as a column when asked
  const better=(x,y,hi=true)=>x==null||y==null||Math.abs(x-y)<1e-9?'':(hi?x>y:x<y)?' up':' down';
  const rows=[['Trades',f.n,a.n,v=>String(v),null],
    ['Win rate',f.win,a.win,v=>Math.round(v*100)+'%',true],
    ['Profit',f.pnl,a.pnl,v=>sol(v),true],
    ['Return',f.roi,a.roi,v=>pct(v),true],
    ['Avg win',f.avgWin,a.avgWin,v=>v==null?'–':pct(v),true],
    ['Avg loss',f.avgLoss,a.avgLoss,v=>v==null?'–':pct(v),true],
    ['+100% wins',f.big,a.big,v=>String(v),true],
    ['Median hold',f.hold,a.hold,v=>v==null?'–':fmtHold(v),null],
    ['Last 7 days',f.recWin,a.recWin,(v,x)=>v==null?'no trades':Math.round(v*100)+'% win · '+x.recN,true]];
  const wv={'Trades':'n','Win rate':'win','Profit':'pnl','Return':'roi','Avg win':'avgWin','Avg loss':'avgLoss','+100% wins':'big','Median hold':'hold','Last 7 days':'recWin'};
  $('cmp').classList.toggle('cmpw',!!wd);
  $('cmp').innerHTML=`<div class="cmph"><span></span><span>With filters</span>${wd?'<span class="wdh">Wider</span>':''}<span>All trades</span></div>`+rows.map(([k,x,y,fmt,hi])=>`<div class="cmpr"><span class="k">${k}</span>
    <b class="${hi==null?'':better(x,y,hi).trim()}">${esc(fmt(x,f))}</b>${wd?`<b class="wd ${hi==null?'':better(wd[wv[k]],x,hi).trim()}">${esc(fmt(wd[wv[k]],wd))}</b>`:''}<b>${esc(fmt(y,a))}</b></div>`).join('')+
    `<p class="tipline">${f.pnl>a.pnl?`The filters keep <b>${f.n}</b> of ${a.n} trades and add <b class="pos">${sol(f.pnl-a.pnl)}</b> by skipping the rest.`:`Copying every trade would have made <b class="${cls(a.pnl-f.pnl)}">${sol(a.pnl-f.pnl)}</b> more than the filters.`}</p>`+(wd?`<p class="tipline wdline">Wider = <b>${esc(bw.label)}</b>. A preview only: the score and recommended filters stay the same.</p>`:'')+(bw?bw.html:'');
  $('cmp').querySelectorAll('.widebtn').forEach(b=>b.addEventListener('click',()=>{CUR.wideOn=!CUR.wideOn;renderCmp(CUR.A)}));
}

/* ---------- buy size & market cap: win rate for the sizes and entries this wallet actually uses ---------- */
const niceSol=v=>v<=0?0:v<1?Math.round(v*20)/20:v<5?Math.round(v*10)/10:Math.round(v*2)/2;
const niceMc=v=>{if(v<=0)return 0;const p=Math.pow(10,Math.floor(Math.log10(v))-1);return Math.round(v/p)*p};
const fmtS=v=>(+v.toFixed(v<1?2:2))+'';
function quantBins(vals,k,nice){ // k groups with about the same number of trades, edges rounded to tidy numbers
  const s=vals.slice().sort((a,b)=>a-b),edges=[];for(let i=1;i<k;i++){const e=nice(s[Math.floor(i*s.length/k)]);if(e>0&&(!edges.length||e>edges[edges.length-1]))edges.push(e)}
  const b=[];let lo=0;for(const e of edges){b.push([lo,e]);lo=e}b.push([lo,Infinity]);return b}
function sizeGroups(list){
  const v=list.map(t=>t.firstSol).filter(x=>x>0).sort((a,b)=>a-b);if(v.length<4)return null;
  // wallets often use a few fixed sizes: group values within ~6% of each other
  let cl=[];for(const x of v){const c=cl[cl.length-1];if(c&&x<=c.max*1.06+0.005){c.max=x;c.n++}else cl.push({min:x,max:x,n:1})}
  if(cl.length>1)for(let i=0;i<cl.length;i++){if(cl[i].n>=2)continue;const L=cl[i-1],R=cl[i+1],to=!L?R:!R?L:(cl[i].min-L.max<=R.min-cl[i].max?L:R);to.min=Math.min(to.min,cl[i].min);to.max=Math.max(to.max,cl[i].max);to.n+=cl[i].n;cl.splice(i,1);i--}
  if(cl.length>=2&&cl.length<=6)return cl.map(c=>({lo:c.min,hi:c.max,inc:true,label:(c.max-c.min)/c.min<0.08?'≈'+fmtS((c.min+c.max)/2)+' SOL':fmtS(c.min)+'–'+fmtS(c.max)+' SOL'}));
  const k=Math.min(5,Math.max(2,Math.floor(v.length/6)));
  const topS=Math.max(...v);
  return quantBins(v,k,niceSol).map(([lo,hi])=>({lo,hi,label:hi===Infinity?fmtS(lo)+'–'+fmtS(topS)+' SOL':lo===0?'under '+fmtS(hi)+' SOL':fmtS(lo)+'–'+fmtS(hi)+' SOL'}));
}
function mcGroups(list){
  const v=list.map(t=>t.mcap).filter(x=>x>0);if(v.length<4)return null;
  const k=Math.min(5,Math.max(2,Math.floor(v.length/6)));
  const top=Math.max(...v); // the top range shows its real ceiling: the highest entry it made
  return quantBins(v,k,niceMc).map(([lo,hi])=>({lo,hi,label:hi===Infinity?fm(lo)+'–'+fm(top):lo===0?'under '+fm(hi):fm(lo)+'–'+fm(hi)}));
}
function groupRows(list,groups,val,o){
  return groups.map(g=>{const ts=list.filter(t=>{const x=val(t);return g.inc?x>=g.lo-1e-9&&x<=g.hi+1e-9:x>=g.lo&&x<g.hi});return {...g,s:summarize(ts,o)}}).filter(r=>r.s.n>0)}
function szTable(rows,title,what){
  if(!rows||rows.length<2)return '';
  const ok=rows.filter(r=>r.s.n>=3),score=r=>r.s.win+(r.s.pnl>0?0.0001*r.s.pnl:-1),best=ok.length?ok.reduce((a,b)=>score(b)>score(a)?b:a):null,worst=ok.length>1?ok.reduce((a,b)=>(b.s.win<a.s.win||(b.s.win===a.s.win&&b.s.pnl<a.s.pnl))?b:a):null; // best: highest win rate that still makes money
  return `<div class="szt"><div class="szh"><span>${title}</span><span>Trades</span><span>Win</span><span>Net</span></div>${rows.map(r=>{const w=Math.round(r.s.win*100);
    return `<div class="szr${r===best?' best':''}${r===worst&&r.s.pnl<0?' worst':''}"><span class="szl">${esc(r.label)}</span><span>${r.s.n}</span><span><i class="bar" style="--w:${w}%"></i>${w}%</span><span class="${cls(r.s.pnl)}">${sol(r.s.pnl)}</span></div>`}).join('')}
    ${best?`<p class="tipline">Best ${what}: <b>${esc(best.label)}</b> · ${Math.round(best.s.win*100)}% win over ${best.s.n} trades${worst&&worst!==best?`. Weakest: ${esc(worst.label)} (${Math.round(worst.s.win*100)}% win)`:''}.</p>`:''}</div>`}
function renderSZ(A){
  const list=A.U,o=A.o,card=$('szcard');
  const sz=sizeGroups(list),mc=mcGroups(list),ak=list.filter(t=>t.age!=null),ageG=ak.length>=6?[[0,1,'under 1h'],[1,6,'1–6h'],[6,24,'6–24h'],[24,72,'1–3 days'],[72,216,'3–9 days'],[216,720,'9–30 days'],[720,2160,'30–90 days'],[2160,Infinity,'90+ days']].map(([lo,hi,label])=>({lo,hi,label})):null;
  const hi=list.filter(t=>t.mcap>0).sort((a,b)=>b.mcap-a.mcap).slice(0,5);
  const hiLine=hi.length?`<p class="tipline">Highest entries: ${hi.map(t=>{const r=adjRet(t,o);return `<b>${fm(t.mcap)}</b>${r==null?'':` <span class="${cls(r)}">${pct(r)}</span>`}`}).join(' · ')}</p>`:'';
  const h=(sz?szTable(groupRows(list,sz,t=>t.firstSol,o),'Buy size','buy size'):'')+(ageG?szTable(groupRows(ak,ageG,t=>t.age,o),'Token age at buy','token age'):'')+(mc?szTable(groupRows(list,mc,t=>t.mcap,o),'Entry market cap','entry').replace(/<\/div>$/,hiLine+'</div>'):'');
  card.hidden=!h;$('szbody').innerHTML=h+(h?mcqBox():'');if(h)mcqRun();
}
/* ---------- "how does it do under $X?": your own market cap cut-off, split into under vs over ---------- */
const MCQ_K='ws-mcq';
function mcqBox(){let v=25000;try{v=+localStorage.getItem(MCQ_K)||25000}catch(e){}
  return `<div class="mcq"><div class="mcqh">Check a market cap cut-off</div>
    <div class="mcqrow"><label>Under $<input type="number" id="mcqv" min="0" step="1000" value="${v}"></label>
    ${[10000,20000,25000,30000,50000,100000].map(x=>`<button type="button" class="mcqb${x===v?' on':''}" data-v="${x}">${fm(x).replace('$','')}</button>`).join('')}</div>
    <div id="mcqout"></div></div>`}
function mcqRun(){const A=CUR&&CUR.A,el=$('mcqv');if(!A||!el)return;const X=Math.max(0,+el.value||0),o=A.o,ref=CUR.ref||CUR.pulled;
  try{localStorage.setItem(MCQ_K,String(X))}catch(e){}document.querySelectorAll('.mcqb').forEach(b=>b.classList.toggle('on',+b.dataset.v===X));
  const list=A.U.filter(t=>t.mcap>0),u=cmpStats(list.filter(t=>t.mcap<X),o,ref),ov=cmpStats(list.filter(t=>t.mcap>=X),o,ref),all=cmpStats(list,o,ref);
  const cell=(s,f)=>s?f(s):'–';
  const rows=[['Trades',s=>String(s.n)],['Win rate',s=>Math.round(s.win*100)+'%'],['Profit',s=>sol(s.pnl)],['Return',s=>pct(s.roi)],['Avg win',s=>s.avgWin==null?'–':pct(s.avgWin)],['Avg loss',s=>s.avgLoss==null?'–':pct(s.avgLoss)],['+100% wins',s=>String(s.big)]];
  const tone=(s,k)=>!s||!all?'':k==='Win rate'?(s.win>all.win+0.005?'up':s.win<all.win-0.005?'down':''):k==='Profit'?cls(s.pnl):k==='Return'?cls(s.roi):'';
  $('mcqout').innerHTML=`<div class="cmph"><span></span><span>Under ${esc(fm(X))}</span><span>${esc(fm(X))} and up</span></div>`+
    rows.map(([k,f])=>`<div class="cmpr"><span class="k">${k}</span><b class="${tone(u,k)}">${esc(cell(u,f))}</b><b class="${tone(ov,k)}">${esc(cell(ov,f))}</b></div>`).join('')+
    `<p class="tipline">${!u?`No trades under ${esc(fm(X))}.`:!ov?`Every trade is under ${esc(fm(X))}.`:u.pnl>=ov.pnl?`Under ${esc(fm(X))} it made <b class="${cls(u.pnl)}">${sol(u.pnl)}</b> on ${u.n} trades. A <b>Max market cap of ${esc(fm(X))}</b> would ${ov.pnl<0?`skip ${sol(ov.pnl)} of losses`:`give up ${sol(ov.pnl)}`}.`:`It does better at ${esc(fm(X))} and up (${sol(ov.pnl)} on ${ov.n} trades) than under (${sol(u.pnl)}).`} Green/red win rates are compared with all ${all.n} trades (${Math.round(all.win*100)}%).</p>`}
$('szbody').addEventListener('input',e=>{if(e.target.id==='mcqv')mcqRun()});
$('szbody').addEventListener('click',e=>{const b=e.target.closest('.mcqb');if(!b)return;$('mcqv').value=b.dataset.v;mcqRun()});

/* ---------- platforms: where the wallet bought each token ---------- */
const PL_ORDER=['Pump.fun','PumpSwap','Raydium','Meteora','Orca','Moonshot','Other'];
function renderPL(A){
  const o=A.o,off=o.offPlat,all=recent(A.trades,{...o,offPlat:[]}).filter(t=>adjRet(t,o)!==null);
  const fams={};for(const t of all){const f=t.plat||'Unknown';(fams[f]=fams[f]||[]).push(t)}
  const names=Object.keys(fams).sort((a,b)=>(PL_ORDER.indexOf(a)+1||99)-(PL_ORDER.indexOf(b)+1||99));
  const card=$('plcard');if(names.length<2&&!off.length){card.hidden=!names.length;
    $('plbody').innerHTML=names.length?`<p class="empty">Every token was bought on <b>${esc(names[0])}</b>.</p>`:'';return}
  card.hidden=false;
  const on=all.filter(t=>!(t.plat&&off.includes(t.plat))),base=summarize(on,o);
  const rows=names.map(f=>{const s=summarize(fams[f],o),isOff=off.includes(f),det=[...new Set(fams[f].map(t=>t.platD).filter(Boolean))].join(', ');
    return `<button type="button" class="pl${isOff?' off':''}" data-f="${esc(f)}" ${f==='Unknown'?'disabled':''} title="${esc(det||'Platform not looked up yet')}${f==='Unknown'?'':isOff?' · tap to turn back on':' · tap to leave out'}">
      <span class="pn">${esc(f)}</span><span class="pc">${s.n}</span><span class="pw">${Math.round(s.win*100)}%</span><span class="pp ${cls(s.pnl)}">${sol(s.pnl)}</span><span class="sw" aria-hidden="true"></span></button>`}).join('');
  // suggestion: the platform whose removal lifts the win rate most, if it also loses money
  let tip='';const cand=names.filter(f=>f!=='Unknown'&&!off.includes(f)&&fams[f].length>=3).map(f=>{const rest=on.filter(t=>t.plat!==f),s=summarize(rest,o),own=summarize(fams[f],o);return {f,s,own}}).filter(x=>x.own.pnl<0&&x.s.win>base.win).sort((a,b)=>(b.s.win-a.s.win)||(b.s.pnl-a.s.pnl))[0];
  if(cand)tip=`<p class="tipline">Suggested: turn off <b>${esc(cand.f)}</b>. Win rate ${Math.round(base.win*100)}% → <b>${Math.round(cand.s.win*100)}%</b>, net ${sol(base.pnl)} → <b class="${cls(cand.s.pnl)}">${sol(cand.s.pnl)}</b> (${cand.own.n} trades left out).</p>`;
  else tip=`<p class="tipline">${off.length?'':'No platform is dragging this wallet down. '}Tap a platform to see the score without it.</p>`;
  $('plbody').innerHTML=`<div class="plh"><span>Bought on</span><span>Trades</span><span>Win</span><span>Net</span><span></span></div>${rows}${tip}`;
}
$('plbody').addEventListener('click',e=>{const b=e.target.closest('.pl');if(!b||b.disabled)return;const f=b.dataset.f,off=new Set(SET.offplat||[]);off.has(f)?off.delete(f):off.add(f);SET.offplat=[...off];saveSet();rerender()});

/* ---------- re-entries: same token bought again after selling out ---------- */
function renderRE(A){
  const st=roundStudy(A.keptList,A.o),card=$('recard');
  if(!st.n||!st.re){card.hidden=!st.n;$('rebody').innerHTML=st.n?`<p class="empty">Never bought a token again after selling out${A.best?' (in filters)':''}. "Max trades per token" makes no difference.</p>`:'';return}
  card.hidden=false;const cur=A.o.maxRounds||0,lab=['1st trade','2nd trade','3rd+'];
  $('rebody').innerHTML=`<p class="tipline" style="margin:0 0 8px">${st.re} of ${st.n} tokens${A.best?' in filters':''} were bought again after selling out.</p>
    <div class="rtgrid">${st.by.map((b,i)=>b.n?`<div class="rt"><div class="k">${lab[i]}</div><div class="v ${cls(b.pnl)}">${sol(b.pnl)}</div><div class="s">${b.n} trades · ${Math.round(b.w/b.n*100)}% win</div></div>`:'').join('')}</div>
    <div class="ks">${st.ks.map(k=>`<button type="button" class="kbtn${k===st.best?' best':''}${k.K===cur?' on':''}" data-k="${k.K}" title="${Math.round(k.win*100)}% win rate"><span>${k.K||'All'}</span><b class="${cls(k.pnl)}">${sol(k.pnl)}</b></button>`).join('')}</div>
    <p class="tipline">Best: copy <b>${st.best.K?'up to '+st.best.K+' trade'+(st.best.K>1?'s':'')+' per token':'every trade'}</b>. Tap a number to apply it here.</p>`;
}
$('rebody').addEventListener('click',e=>{const b=e.target.closest('.kbtn');if(!b)return;SET.maxr=+b.dataset.k;saveSet();$('maxr').value=String(SET.maxr);rerender()});

/* ---------- round-trips and entry spikes ---------- */
const median=a=>{if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
function rtOf(t,o){const v=oppGet(t),r=adjRet(t,o);return v&&v.peak!=null&&r!=null&&!t.open&&r<0?v.peak:null}
function spikeOf(t){const v=oppGet(t),s=v&&v.spike;if(!s||!s.found||!s.pre||!s.next)return null;return {rise:s.next/s.pre-1,bot:s.next/s.me-1}}
// a heavy spike: price up spikeRise% within a block of its buy; a big round-trip: up rtPct% and still closed red (both from Settings)
/* Round-trips vs entry spikes over the tokens already checked, and the profit a copier could expect:
   heavy spikes cost what a bot one block behind pays extra; big round-trips could have been sold at +100% with a take-profit
   (only counted if the copier, buying after the spike, would still have seen +100%). */
function rsOf(list,o){
  const HEAVY=SC().spikeRise/100,TP=SC().rtPct/100;const ch=list.filter(t=>t.pool&&t.pxIn&&oppGet(t));if(!ch.length)return null;
  const sp=ch.map(spikeOf).filter(Boolean),heavy=sp.filter(x=>x.rise>=HEAVY).length;
  let pnl=0,spCost=0,tpGain=0,rt=0,closed=0;
  for(const t of ch){const r=adjRet(t,o);if(r==null||t.open)continue;closed++;pnl+=r*t.buySol;
    const s=spikeOf(t),gap=s&&s.rise>=HEAVY&&s.bot>0?s.bot:0,r2=(1+r)/(1+gap)-1;spCost+=(r-r2)*t.buySol;
    const pk=rtOf(t,o);if(pk!=null&&pk>=TP){rt++;if((1+pk)/(1+gap)-1>=TP)tpGain+=((1+TP)*0.97-1-r2)*t.buySol}}
  return {checked:ch.length,spN:sp.length,heavy,share:sp.length?heavy/sp.length:0,rt,closed,pnl,spCost,tpGain,pot:pnl-spCost+tpGain};
}
// tokens the round-trip & spike check covers: the ones in filters (they count in the score), plus every other analyzed token when
// "all analyzed tokens" is on (only for labels on GMGN and in the token list; the score still uses the tokens in filters)
function chkList(A){const k=A.keptList,ks=new Set(k);return (SET.chkall&&!(typeof WB!=='undefined'&&WB.run)?[...k,...(A.U||[]).filter(t=>!ks.has(t))]:k).filter(t=>t.pool&&t.pxIn)}
function renderRT(A){
  const o=A.o,list=chkList(A),checked=list.filter(t=>oppGet(t));
  const left=list.length-checked.length,scope=SET.chkall||!A.best?'analyzed':'in filters';
  let h='';
  if(checked.length){
    const rts=checked.filter(t=>{const p=rtOf(t,o);return p!=null&&p>=0.5}),big=rts.filter(t=>rtOf(t,o)>=1);
    const sp=checked.map(spikeOf).filter(Boolean),spMed=median(sp.map(x=>x.rise)),botMed=median(sp.map(x=>x.bot)),spBig=sp.filter(x=>x.rise>=0.15).length;
    const closed=checked.filter(t=>adjRet(t,o)!=null&&!t.open).length;
    h+=`<div class="rtgrid">
      <div class="rt"><div class="k">Round-trips (+50%, sold red)</div><div class="v ${rts.length?'neg':''}">${rts.length}<span class="s"> of ${closed}</span></div><div class="s">${big.length} went +100% first</div></div>
      <div class="rt"><div class="k">Entry spike (median)</div><div class="v ${spMed>=0.15?'amb':''}">${spMed==null?'–':pct(spMed)}</div><div class="s">${spBig} of ${sp.length} jumped 15%+</div></div></div>`;
    if(botMed!=null&&botMed>0.02)h+=`<p class="tipline">A bot one block behind pays about <b>${pct(botMed)}</b> more than this wallet. Set fill gap to ${Math.round(botMed*100)}% in Settings for a realistic score.</p>`;
    if(rts.length)h+=`<p class="tipline">${rts.length} of ${closed} trades ${scope} were up 50%+ and still closed red. A take-profit protects against this.</p>`;
    const rs=A.rs;
    if(rs&&rs.closed){
      h+=`<div class="rsbox"><div class="rsrow"><span>Profit on checked trades</span><b class="${cls(rs.pnl)}">${sol(rs.pnl)}</b></div>
        <div class="rsrow"><span>Heavy spikes (${SC().spikeRise}%+) · ${rs.heavy} of ${rs.spN}${rs.share>=0.5?' <b class="neg">consistent</b>':''}</span><b class="${rs.spCost>0?'neg':''}">${rs.spCost>0?'−'+sol(rs.spCost).replace(/^[+−-]/,''):'–'}</b></div>
        <div class="rsrow"><span>+${SC().rtPct}% round-trips · ${rs.rt} (sold at +${SC().rtPct}% instead)</span><b class="${rs.tpGain>0?'pos':''}">${rs.tpGain>0?sol(rs.tpGain):'–'}</b></div>
        <div class="rsrow tot"><span>Potential copy profit</span><b class="${cls(rs.pot)}">${sol(rs.pot)}</b></div></div>`;
      const sAdj=A.adj.parts.filter(p=>/spike|round-trip/.test(p[1]));
      h+=`<p class="tipline">${sAdj.length?'Score: '+sAdj.map(([v,l])=>`<b class="${v<0?'neg':'pos'}">${v>0?'+':'−'}${Math.abs(v)}</b> ${esc(l)}`).join(' · '):rs.checked<4?'Check 4+ tokens to count this in the score.':''}</p>`.replace('<p class="tipline"></p>','');
    }
  }else h+=`<p class="empty">Shows how often this wallet lets winners turn into losses, and how much the price jumps on its buys.</p>`;
  if(CHK.on&&CUR&&CHK.wallet===CUR.wallet)h+=chkBar();
  else{if(CHK.fail&&CHK.wallet===(CUR&&CUR.wallet)&&left)h+=`<p class="tipline amb">${CHK.fail} token${CHK.fail>1?'s':''} couldn't be checked last time (${esc(CHK.why||'Helius busy or no price data')}). The button tries ${CHK.fail>1?'them':'it'} again.</p>`;
    if(left)h+=`<button type="button" class="run" id="runchk">Check ${left} token${left>1?'s':''} ${scope} · about ${left*20} credits</button>`}
  $('rtbody').innerHTML=h;
  const rb=$('runchk');if(rb)rb.addEventListener('click',runCheck);
}
let checking=false;
// progress of the spike & round-trip check, shown as a bar in the Round-trips card (in place of the Check button)
const CHK={on:false,wallet:'',done:0,total:0,fail:0,why:'',t0:0};
function chkBar(){const p=CHK.total?CHK.done/CHK.total:0,left=CHK.total-CHK.done,per=CHK.done?(Date.now()-CHK.t0)/CHK.done:null;
  const eta=per&&left?` · about ${fmtSecs(left*per/1000)} left`:left&&!CHK.done?' · starting (the first token can take up to a minute)':'';
  return `<div class="chkprog" id="chkprog"><div class="chkbar${CHK.done?'':' wait'}"><i style="width:${Math.max(3,Math.round(p*100))}%"></i></div>
    <div class="chkline">Checking <b>${CHK.done} of ${CHK.total}</b> tokens${eta}${CHK.fail?` · <span class="amb">${CHK.fail} failed</span>`:''}</div></div>`}
const fmtSecs=s=>s<60?Math.max(1,Math.round(s))+'s':Math.floor(s/60)+'m '+String(Math.round(s%60)).padStart(2,'0')+'s';
const paintChk=()=>{const el=$('chkprog');if(el)el.outerHTML=chkBar()};
async function runCheck(){
  if(checking){status('The spike & round-trip check is already running: see the progress bar in Round-trips.');return}
  if(!CUR||!CUR.A)return;const key=getKey();if(!key){status('Add your Helius key in Settings first.',true);return}
  const list=chkList(CUR.A).filter(t=>!oppGet(t));if(!list.length){status('Every token in scope is already checked.');return}
  checking=true;const wallet=CUR.wallet;Object.assign(CHK,{on:true,wallet,done:0,total:list.length,fail:0,why:'',t0:Date.now()});rerender();
  let next=0,credits=0,fatal=null,last=0;const ticker=setInterval(paintChk,1000);try{
  const tick=()=>{status(`Checking spikes & round-trips · ${CHK.done} of ${list.length}`);paintChk();if(Date.now()-last>1500){last=Date.now();rerender()}};
  // one stuck lookup can't freeze the check: each token gets 90s, then it's counted as failed and the check moves on
  const limit=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('timed out')),ms))]);
  const worker=async()=>{while(!fatal&&next<list.length){const t=list[next++];try{const v=await limit(checkToken(t,key,wallet),90000);credits+=v.credits;oppPut(t,v)}catch(e){if(/key/i.test(e.message))fatal=e;else{CHK.fail++;CHK.why=/timed out/.test(e.message)?'took too long':/429|rate|busy/i.test(e.message)?'Helius busy':'no trade data found'}}CHK.done++;tick()}};
  tick();await Promise.all(Array.from({length:Math.min(2,list.length)},worker)); // 2 at a time: the free Helius plan's limit
  }finally{checking=false;CHK.on=false;clearInterval(ticker)} // never left marked as running if something fails part-way
  rerender();hubPush().catch(()=>{});
  const ok=list.length-CHK.fail;
  status(fatal?fatal.message:`Checked ${ok} of ${list.length} tokens${CHK.fail?` · ${CHK.fail} failed (${CHK.why}), press Check to retry`:''} · about ${credits} Helius credits.`,!!fatal||CHK.fail>0);
}

/* ---------- token list ---------- */
$('toks').addEventListener('click',e=>{const b=e.target.closest('.newerout');if(b){const s=document.querySelector('#tokseg button[data-v=all]');if(s)s.click()}});
document.addEventListener('click',e=>{if(e.target.closest('#footup')&&CUR)score(CUR.wallet,false,true)});
// the Tokens card's In filters / All switch (by id: there are several switches in the panel now)
$('tokseg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;VIEW=b.dataset.v;
  document.querySelectorAll('#tokseg button').forEach(x=>x.classList.toggle('on',x===b));if(CUR&&CUR.A)renderToks(CUR.A)});
function renderToks(A){
  const o=A.o,meta=metaAll(),list=recent(A.trades,o).slice().sort((x,y)=>y.t-x.t);
  const tick=t=>(NAMES[t.tok]||'').toLowerCase().replace(/[^a-z0-9]/g,''),cnt={};for(const t of list){const k=tick(t);if(k)cnt[k]=(cnt[k]||0)+1}
  const show=VIEW==='kept'&&A.best?list.filter(t=>inF(t,A.best)):list;
  const newerOut=VIEW==='kept'&&A.best&&show.length?list.filter(t=>t.t>show[0].t).length:0; // recent tokens hidden because they're outside the filters
  $('toks').innerHTML=show.length?show.map(t=>{const r=adjRet(t,o),inside=!A.best||inF(t,A.best),nm=NAMES[t.tok]||short(t.tok),full=(meta[t.tok]&&meta[t.tok][2])||'';
    const rt=rtOf(t,o),sp=spikeOf(t);
    const tags=(rt!=null&&rt>=0.5?`<span class="tag rt" title="Was up ${pct(rt)} before it closed red">RT ${pct(rt)}</span>`:'')+(isQS(t)?`<span class="tag qs" title="Sold within ${SC().qsSec}s, bought under ${fm(SC().qsMc)} market cap: a copy bot would most likely lose here, so it counts as a loss">QuickSell Low MC</span>`:'')+(sp&&sp.rise>=0.15?`<span class="tag spk" title="Price jumped this much within one block of its buy">spike ${pct(sp.rise)}</span>`:'')+(t.rounds>1?`<span class="tag rnd" title="Bought in and sold out ${t.rounds} separate times${t.cut?'; only the first '+o.maxRounds+' counted':''}">${t.cut?o.maxRounds+'/':''}${t.rounds}×</span>`:'')+(t.dev?'<span class="tag devt" title="This wallet created this token (it signed the token\'s first transaction)">DEV</span>':'')+(cnt[tick(t)]>1?'<span class="tag dup" title="Another token here uses the same ticker">same ticker</span>':'');
    const qsIn=A.best&&inside&&isQS(t);
    return `<div class="tk${inside?'':' out'}${t.dev?' dev':''}${qsIn?' qsin':''}"${qsIn?` title="QuickSell inside the filters: profitable for the wallet, but a copy bot buys later and can't sell that fast, so it counts as a loss (${pct(SC().qsLoss/100)}) and not as a win"`:''}>
      <div style="min-width:0"><a class="nm gm" href="${esc(tokUrl(t.tok,CUR.wallet))}" target="_blank" rel="noopener" title="${esc((full?full+' · ':'')+t.tok)}">${esc(nm)}${tags}</a>
        <div class="sub">${ago(t.t)} ago · ${(+t.firstSol.toFixed(2))} SOL${t.age!=null?' · token '+fmAge(t.age)+' old':''}${t.platD?' · '+esc(t.platD):''}${full&&cnt[tick(t)]>1?' · '+esc(full):''}</div></div>
      <div class="mc">${fm(t.mcap)}<div class="sub">MC</div></div>
      <div class="res ${r==null?'':r>0&&!isWin(r)?'amb':cls(r)}" ${r!=null&&r>0&&!isWin(r)?`title="Under +${SC().winMin}%: counted as a loss for the win rate"`:''}>${r==null?'<span class="hint">open</span>':t.open?'<span class="neg">unsold</span>':pct(r)+(t.held?`<div class="sub" title="${Math.round(t.held.frac*100)}% of the position is still held, valued at today's price">held</div>`:'')}</div></div>`}).join('')
    :'<p class="empty">No tokens inside these filters.</p>';
  if(newerOut)$('toks').insertAdjacentHTML('afterbegin',`<button type="button" class="suggest newerout" data-v="all">${newerOut} newer token${newerOut>1?'s are':' is'} outside these filters (latest ${esc(ago(list[0].t))} ago). Show all</button>`);
}

/* ---------- saved wallets (open with no Helius credits) ---------- */
function renderHist(){
  const ix=histIndex(),tts=(()=>{try{return JSON.parse(localStorage.getItem('ws-tt')||'{}')}catch(e){return {}}})(),ws=Object.keys(ix).filter(w=>!tts[w]).sort((a,b)=>(ix[b].pulled||0)-(ix[a].pulled||0)).slice(0,8);
  $('hist').innerHTML=ws.map(w=>{const s=store.get('ws-score:'+w),n=s===''||s==null?null:+s,col=n==null?'var(--muted)':n>=65?'var(--win)':n>=50?'var(--amber)':'var(--loss)';
    return `<span class="chip"><button type="button" class="open" data-w="${esc(w)}" title="Open from saved history. Uses no Helius credits.">${esc(short(w))}</button>${n==null?'':`<span class="sc" style="color:${col};background:color-mix(in srgb,${col} 14%,transparent)">${n}</span>`}<button type="button" class="x" data-w="${esc(w)}" aria-label="Remove ${esc(short(w))}">×</button></span>`}).join('');
}
function hiMaybe(){try{if(typeof hiRender==='function')hiRender()}catch(e){}}
$('hist').addEventListener('click',async e=>{const o=e.target.closest('.open'),x=e.target.closest('.x');
  if(o)score(o.dataset.w,true);
  if(x){const w=x.dataset.w,ix=histIndex();delete ix[w];histSave(ix);store.del('ws-score:'+w);try{await idb.del(w)}catch(e){}try{await hubForget(w)}catch(e){}renderHist();hiMaybe()}});
renderHist();

/* ---------- wallet from the GMGN tab you're on ---------- */
const walletFromUrl=u=>{if(!u)return null;let m=u.match(/gmgn\.ai\/[a-z]+\/address\/([1-9A-HJ-NP-Za-km-z]{32,44})/);if(m)return m[1];m=u.match(/gmgn\.ai\/.*[?&]maker=([1-9A-HJ-NP-Za-km-z]{32,44})/);return m?m[1]:null};
async function checkTab(){
  if(typeof chrome==='undefined'||!chrome.tabs)return;
  try{let tab;if(MODE==='win'){const w=await chrome.windows.getLastFocused({windowTypes:['normal']});[tab]=await chrome.tabs.query({active:true,windowId:w.id})}else [tab]=await chrome.tabs.query({active:true,currentWindow:true});const w=walletFromUrl(tab&&tab.url);const b=$('fromtab');
    if(w&&SET.autotab&&w!==(CUR&&CUR.wallet)&&w!==checkTab.last&&!$('go').disabled&&!WB.run){checkTab.last=w;b.hidden=true;$('addr').value=w;score(w,!!histIndex()[w]);return} // auto-check the wallet page you're on
    if(w&&w!==(CUR&&CUR.wallet)){b.hidden=false;b.dataset.w=w;b.innerHTML=`Score the wallet from this tab: <b>${esc(short(w))}</b>`;if(!$('addr').value)$('addr').value=w}else b.hidden=true}catch(e){}
}
$('autotab').checked=!!SET.autotab;$('autotab').addEventListener('change',()=>{SET.autotab=$('autotab').checked;saveSet();checkTab.last=null;if(SET.autotab)checkTab()});
$('fromtab').addEventListener('click',()=>{const w=$('fromtab').dataset.w;if(w){$('addr').value=w;$('fromtab').hidden=true;score(w,false)}});
if(typeof chrome!=='undefined'&&chrome.tabs){chrome.tabs.onActivated.addListener(checkTab);if(chrome.windows&&MODE==='win')chrome.windows.onFocusChanged.addListener(checkTab);chrome.tabs.onUpdated.addListener((id,ch)=>{if(ch.url||ch.status==='complete')checkTab()});checkTab()}

/* ---------- window modes ---------- */
$('popout').addEventListener('click',async()=>{
  if(typeof chrome==='undefined'||!chrome.windows)return;
  await chrome.windows.create({url:chrome.runtime.getURL('panel.html?mode=win'),type:'popup',width:430,height:780});
  if(MODE==='popup')window.close()});
$('dock').addEventListener('click',async()=>{
  if(typeof chrome==='undefined'||!chrome.sidePanel)return;
  try{const w=await chrome.windows.getLastFocused({windowTypes:['normal']});await chrome.sidePanel.open({windowId:w.id});if(MODE!=='panel')window.close()}
  catch(e){status('Chrome blocked the side panel here. Right-click the extension icon and choose "Open side panel".',true)}});
if(MODE==='panel')$('dock').hidden=true;
// reopen the last wallet from saved history (no Helius credits), so closing the popup loses nothing
// wallets pulled on the Filter Finder page come in through the shared sync first
(async()=>{try{await hubPull();DEVC=null}catch(e){}renderHist();
  const last=store.get('ws-last');if(last&&histIndex()[last])score(last,true)})();

/* ---------- changelog: hover list on the update button, and a What's new window after updating ---------- */
let CL=[];
async function clLoad(){try{const j=await (await fetch(chrome.runtime.getURL('changelog.json')+'?t='+Date.now(),{cache:'no-store'})).json();if(Array.isArray(j))CL=j}catch(e){}return CL}
const clBetween=(lo,hi)=>CL.filter(e=>verNewer(e.version,lo)&&!verNewer(e.version,hi)); // newer than lo, up to hi
const clHtml=list=>list.map(e=>`<div class="clv"><div class="clh">v${esc(e.version)}</div><ul>${(e.changes||[]).map(c=>`<li>- ${esc(c)}</li>`).join('')}</ul></div>`).join('');
const updTip=document.createElement('div');updTip.className='updtip';updTip.hidden=true;updTip.setAttribute('role','tooltip');document.body.appendChild(updTip);
function tipShow(){if(!UPD)return;let cur='0';try{cur=chrome.runtime.getManifest().version}catch(e){}
  const list=clBetween(cur,UPD);
  updTip.innerHTML=`<div class="tiph"><span class="tv">v${esc(cur)} → v${esc(UPD)}</span> · click to update</div>`+(list.length?clHtml(list):'<p class="hint">No change notes for this version.</p>');
  updTip.hidden=false;const r=$('upd').getBoundingClientRect(),w=Math.min(300,innerWidth-16);updTip.style.width=w+'px';
  updTip.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';updTip.style.top=(r.bottom+6)+'px'}
const tipHide=()=>{updTip.hidden=true};
$('upd').addEventListener('mouseenter',tipShow);$('upd').addEventListener('focus',tipShow);
$('upd').addEventListener('mouseleave',tipHide);$('upd').addEventListener('blur',tipHide);$('upd').addEventListener('click',tipHide);
async function whatsNew(){
  let cur;try{cur=chrome.runtime.getManifest().version}catch(e){return}
  let seen=null;try{seen=localStorage.getItem('ws-seen-ver')}catch(e){}
  if(!seen){try{localStorage.setItem('ws-seen-ver',cur)}catch(e){}return}
  if(!verNewer(cur,seen))return;
  await clLoad();const list=clBetween(seen,cur);
  const done=()=>{try{localStorage.setItem('ws-seen-ver',cur)}catch(e){}ov.remove();document.removeEventListener('keydown',key)};
  const key=e=>{if(e.key==='Escape')done()};
  const ov=document.createElement('div');ov.className='wnover';
  ov.innerHTML=`<div class="wnbox" role="dialog" aria-modal="true" aria-labelledby="wnt"><button type="button" class="wnx" aria-label="Close">×</button>
    <div class="wnk">Updated</div><h2 id="wnt">What's new in v${esc(cur)}</h2><div class="wnbody">${list.length?clHtml(list):'<p class="hint">Updated from v'+esc(seen)+'.</p>'}</div></div>`;
  document.body.appendChild(ov);ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('.wnx'))done()});document.addEventListener('keydown',key);
  ov.querySelector('.wnx').focus();
}
whatsNew();

/* ---------- Settings → Scoring: Automatic (built-in rules) or Custom (every rule editable) ---------- */
const SC_UI=[
  {id:'act',t:'Trades in the last 7 days',d:'Buys + sells, like GMGN\'s 7D TXs. The top tier also blocks a perfect 100.',f:[['actHi','Very busy at (trades)'],['actHiPts','Points'],['actMid','Busy over (trades)'],['actMidPts','Points'],['buysLow','Quiet under (buys)'],['buysLowPts','Points']]},
  {id:'hold',t:'Average hold time',d:'Short holds lose points; long holds earn a bonus that grows up to the max at about an hour.',f:[['holdShort','Short under (sec)'],['holdShortPts','Points'],['holdLong','Bonus over (sec)'],['holdMax','Max bonus']]},
  {id:'p7',t:'Green days (last 7 days)',d:'Most trading days green: points by profit per day. Most red: a penalty. Every day red also blocks a perfect 100.',f:[['g1','Under ($/day)'],['gP1','Points'],['g2','Under ($/day)'],['gP2','Points'],['g3','Under ($/day)'],['gP3','Points'],['gP4','Above that'],['redPts','Mostly red'],['redLossPts','Mostly red + week lost'],['allRedPts','Every day red']]},
  {id:'winmin',t:'What counts as a win',d:'A trade only counts as a win at this profit or more. Smaller gains (like +1% or +2%) count as losses for every win rate. Profit totals are unchanged.',f:[['winMin','Min profit for a win (%)']]},
  {id:'win',t:'Low win rate',d:'Win rate inside its recommended filters.',f:[['winLow','Under (%)'],['winLowPts','Points'],['winMid','At most (%)'],['winMidPts','Points']]},
  {id:'fast',t:'Fast flips',d:'Share of sold tokens held under a few seconds.',f:[['fastSec','Held under (sec)'],['fT1','At (% of tokens)'],['fP1','Points'],['fT2','At (%)'],['fP2','Points'],['fT3','At (%)'],['fP3','Points'],['fT4','At (%)'],['fP4','Points']]},
  {id:'short',t:'Short holds (score cap)',d:'Most tokens sold within this many seconds: a copier buys later and sells later, so a high win rate doesn\'t carry over. The score can\'t go above the cap, and no perfect 100.',f:[['shortSec','Sold within (sec)'],['shortShare','Share at least (%)'],['shortCap','Max score']]},
  {id:'flip',t:'Quick flipper',d:'Most tokens sold within seconds: a copier can\'t get those fills. Also blocks a perfect 100.',f:[['flipSec','Sold within (sec)'],['flipShare','Share at least (%)'],['flipPts','Points']]},
  {id:'qs',t:'QuickSells Low MC',d:'Sold within seconds after buying at a low market cap: counted as a loss for the copier, and Min market cap is raised to block them.',f:[['qsSec','Sold within (sec)'],['qsMc','Market cap under ($)'],['qsLoss','Copier loss (%)']]},
  {id:'overall',t:'Overall win rate',d:'Win rate over every analyzed trade, not just inside the filters. A perfect 100 also needs at least the set win rate here.',f:[['allLow','Under (%)'],['allLowPts','Points'],['allMid','Under (%)'],['allMidPts','Points'],['perfAll','Perfect 100 needs (%)']]},
  {id:'form',t:'Recent form (last 7 days)',d:'How its trades from the last 7 days did (inside the filters when there are 3+, otherwise all). A weak week also blocks a perfect 100.',f:[['recMinN','Min trades to judge'],['recLow','Under (% win)'],['recLowPts','Points'],['recMid','Under (% win)'],['recMidPts','Points'],['recNone','Filters fit none of them']]},
  {id:'perfect',t:'Perfect record',d:'Every trade profitable with at least this many trades scores 100; everyone else is capped.',f:[['perfectN','Trades needed'],['cap','Cap for the rest']]},
  {id:'few',t:'Too few tokens',d:'Applied after the cap, so bonuses can\'t cancel it.',f:[['few1','1 token'],['few2','2 tokens']]},
  {id:'spike',t:'Entry spikes',d:'Needs the round-trip & spike check. Price jumping within a block of its buys means copiers pay more.',f:[['spikeRise','Heavy spike (% jump)'],['sMinChecked','Min tokens checked'],['sT1','At (% of buys)'],['sP1','Points'],['sT2','At (%)'],['sP2','Points'],['sT3','At (%)'],['sP3','Points'],['sMorePts','More spikes than round-trips']]},
  {id:'rt',t:'Round-trips',d:'Needs the round-trip & spike check. Trades that went up this much before closing red: take-profit upside.',f:[['rtPct','Round-trip (% up)'],['rtN1','At (trades)'],['rP1','Points'],['rtN2','At (trades)'],['rP2','Points'],['rtN3','At (trades)'],['rP3','Points']]},
  {id:'rescue',t:'Filters make it profitable',d:'When the wallet loses money overall but is profitable inside the recommended filters, the red-days penalty is reduced to this and the overall win rate penalty is cut to this share. A copier using the filters skips the losing trades.',f:[['rescueN','Min trades in filters'],['rescueRed','Red days penalty becomes (points)'],['rescueAll','Overall win rate penalty kept (%)']]},
  {id:'winhi',t:'High win rate',d:'Bonus when the win rate inside the filters is above this, over at least this many trades.',f:[['winHi','Above (% win)'],['winHiN','Min trades in filters'],['winHiPts','Points']]},
  {id:'edge',t:'Filters make the difference',d:'Bonus when the wallet makes far more profit inside the recommended filters than without them (losing overall but profitable in the filters counts as the biggest jump).',f:[['edgeN','Min trades in filters'],['edgeMin','Min profit in filters (SOL)'],['edgeX1','At (× the no-filter profit)'],['edgePts1','Points'],['edgeX2','Bigger at (×)'],['edgeWinUp','and win rate up (pts)'],['edgePts2','Points']]},
  {id:'weak',t:'Weak filter ranges',d:'Market-cap or buy-size ranges at the edge of the filters that win less than this are cut.',f:[['weakWin','Cut under (% win)']]}];
function scRenderUI(){
  const saved=scSaved(),custom=saved.mode==='custom',v={...SC_DEF,...(saved.v||{})},off=new Set(saved.off||[]);
  $('scauto').checked=!custom;$('scrules').classList.toggle('locked',!custom);
  $('scrules').innerHTML=SC_UI.map(r=>{const isOn=custom?!off.has(r.id):true;return `<div class="scr${isOn?'':' off'}" data-r="${r.id}">
    <label class="scrh"><input type="checkbox" class="scon" ${isOn?'checked':''} ${custom?'':'disabled'}> <b>${esc(r.t)}</b></label>
    <p class="hint">${esc(r.d)}</p>
    <div class="scf">${r.f.map(([k,l])=>`<label class="fld"><span>${esc(l)}</span><input type="number" step="any" data-k="${k}" value="${custom?v[k]:SC_DEF[k]}" ${custom&&isOn?'':'disabled'}></label>`).join('')}</div></div>`}).join('');
}
function scStore(next,msg){try{localStorage.setItem('ws-scoring',JSON.stringify(next))}catch(e){}scReset();scRenderUI();
  $('scnote').textContent=msg||'';clearTimeout(scStore.t);scStore.t=setTimeout(()=>$('scnote').textContent='',3000);
  if(CUR)rerender();try{if(TT.res)ttRender()}catch(e){}try{msRender()}catch(e){}}
$('scauto').addEventListener('change',()=>{const s=scSaved();scStore({...s,mode:$('scauto').checked?'auto':'custom',v:s.v||{...SC_DEF}},$('scauto').checked?'Automatic scoring on.':'Custom scoring on. Change any rule below.')});
$('scrules').addEventListener('change',e=>{const s=scSaved();if(s.mode!=='custom')return;const r=e.target.closest('.scr');
  if(e.target.classList.contains('scon')){const off=new Set(s.off||[]);e.target.checked?off.delete(r.dataset.r):off.add(r.dataset.r);scStore({...s,off:[...off]},'Saved.')}
  else if(e.target.dataset.k){const n=parseFloat(e.target.value);if(!isFinite(n)){e.target.value=(s.v||SC_DEF)[e.target.dataset.k]??SC_DEF[e.target.dataset.k];return}
    scStore({...s,v:{...SC_DEF,...(s.v||{}),[e.target.dataset.k]:n}},'Saved. Scores update everywhere.')}});
$('screset').addEventListener('click',()=>{const s=scSaved();scStore({mode:s.mode||'auto',v:{...SC_DEF},off:[]},'Back to the default numbers.')});
scRenderUI();

/* ---------- period cut-off above the score ---------- */
function periodNote(A){document.querySelectorAll('#period button').forEach(b=>b.classList.toggle('on',+b.dataset.d===(+SET.period||0)));
  const el=$('periodnote');if(!A.days){el.textContent='';return}
  const span=CUR.raw.length?Math.max(...CUR.raw.map(a=>a[1]))-Math.min(...CUR.raw.map(a=>a[1])):0;
  el.innerHTML=`${A.U.length} of ${A.allN} tokens were bought in the last ${A.days} days.${span<A.days*86400*0.9&&A.U.length===A.allN?` The analyzed tokens only go back ${Math.max(1,Math.round(span/86400))} days: raise "Last tokens bought" to cover more.`:''} Saved scores in other tabs still use all tokens.`}
$('period').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;SET.period=+b.dataset.d;saveSet();if(CUR)rerender();else periodNote({days:0})});

/* ---------- Wallet Score on GMGN pages: the analysis is shared with gm.js (runs on gmgn.ai) through chrome.storage ---------- */
const gmStore=typeof chrome!=='undefined'&&chrome.storage&&chrome.storage.local;
function gmSet(obj){if(!gmStore)return;try{chrome.storage.local.set(obj)}catch(e){}}
// per-token labels for GMGN pages (In / Out of filter, DEV, Spike, RT, QuickSell): used by the full analysis and by Top traders / Automatic scores
function gmTokensOf(trades,o,best){const tokens={};let devN=0;for(const t of recent(trades,{...o,noDev:false})){if(t.dev)devN++;const r=adjRet(t,o),sp=spikeOf(t),rt=rtOf(t,o);
    tokens[t.tok]={r:r==null?null:Math.round(r*1000)/1000,out:!!(best&&!inF(t,best)),held:!!t.held,open:!!t.open,qs:isQS(t),sp:sp&&sp.rise>=0.15?Math.round(sp.rise*100):null,rt:rt!=null&&rt>=0.5?Math.round(rt*100):null,dev:!!t.dev}}
  return {tokens,devN}}
const gmFilters=f=>f?{lo:f.lo,hi:f.hi===Infinity?null:f.hi,slo:f.slo,shi:f.shi===Infinity?null:f.shi,alo:f.alo!=null?f.alo:null,ahi:f.alo!=null&&f.ahi!==Infinity?f.ahi:null}:null;
function gmPublish(A){if(!gmStore||!CUR)return;const o=A.o,[g,col]=gradeOf(A.best?A.score:null);
  const {tokens,devN}=gmTokensOf(A.trades,o,A.best);
  const f=A.best,ref=CUR.ref||CUR.pulled,cf=f?cmpStats(A.keptList,o,ref):null,ca=cmpStats(A.U,o,ref);
  const warn=A.adj.parts.filter(p=>p[0]<0).sort((a,b)=>a[0]-b[0]).slice(0,4).map(p=>p[1]);
  gmSet({['gm:'+CUR.wallet]:{w:CUR.wallet,at:Date.now(),score:A.score,grade:A.best?g:'No reliable filter yet',col,
    filters:gmFilters(f),
    f:cf?{n:cf.n,win:cf.win,pnl:cf.pnl}:null,a:ca?{n:ca.n,win:ca.win,pnl:ca.pnl}:null,warn,winMin:SC().on.winmin?SC().winMin:0,dev:{n:devN,off:!!o.noDev},tokens}});
  gmTrim();
}
function gmPublishLite(w,s){if(!gmStore||!s||s.score==null)return; // Top traders / Automatic scores: score, filters and token labels from the quick pull
  chrome.storage.local.get('gm:'+w,r=>{const old=r&&r['gm:'+w];if(old&&old.tokens&&!old.lite&&old.at>Date.now()-6e5)return; // a full analysis from the last 10 minutes stays
    const [g,col]=gradeOf(s.reliable?s.score:null),G=s._gm;
    gmSet({['gm:'+w]:{w,at:Date.now(),score:s.score,grade:s.reliable?g:'No reliable filter yet',col,lite:true,warn:(s.parts||[]).filter(p=>p[0]<0).sort((a,b)=>a[0]-b[0]).slice(0,4).map(p=>p[1]),f:s.n?{n:s.n,win:(s.win??0)/100,pnl:s.pnl}:null,a:s.all?{n:s.all,win:s.allWin,pnl:s.allPnl}:null,
      winMin:SC().on.winmin?SC().winMin:0,filters:G?G.filters:(old&&old.filters)||null,dev:G?{n:G.devN,off:false}:(old&&old.dev)||null,tokens:G?G.tokens:(old&&old.tokens)||null}});gmTrim()})}
let gmTrimT=0;function gmTrim(){clearTimeout(gmTrimT);gmTrimT=setTimeout(()=>{if(!gmStore)return;chrome.storage.local.get(null,all=>{const ks=Object.keys(all).filter(k=>k.startsWith('gm:')&&all[k]&&all[k].w).sort((a,b)=>(all[b].at||0)-(all[a].at||0));if(ks.length>300)chrome.storage.local.remove(ks.slice(300))})},2000)}
$('gmgn').checked=SET.gmgn!==false;gmSet({'gm:on':SET.gmgn!==false});
$('gmgn').addEventListener('change',()=>{SET.gmgn=$('gmgn').checked;saveSet();gmSet({'gm:on':SET.gmgn})});
// "Analyze" pressed on a GMGN page: score that wallet here
function gmTake(q){if(!q||Date.now()-q.at>15000||!isAddr(q.w)||$('go').disabled||WB.run)return;gmStore.remove('gm:req');showView('wallet');$('addr').value=q.w;score(q.w,!!histIndex()[q.w]);gmSet({'gm:ack':{w:q.w,at:Date.now()}})}
if(gmStore&&chrome.storage.onChanged)chrome.storage.onChanged.addListener((ch,area)=>{const r=ch['gm:req'];if(area!=='local'||!r||!r.newValue)return;gmTake(r.newValue)});
// the panel was just opened by GMGN's Analyze button: take the request waiting for it
if(gmStore)setTimeout(()=>gmStore.get('gm:req',r=>gmTake(r&&r['gm:req'])),300);

/* ---------- Settings → Storage: what uses the browser storage, per category, with a clear button each ---------- */
const LS_CATS=[
  {id:'hd',name:'Saved Holders checks',test:k=>k==='hd-hist',lose:'Clear removes them from History → Holders; running one again costs credits'},
  {id:'opp',name:'Spike & round-trip checks',test:k=>k.startsWith('ff-opp1:'),lose:'Clear removes Spike/RT details and GMGN labels until the check is run again (~20 credits per token)'},
  {id:'meta',name:'Token names',test:k=>k==='ff-meta'||k==='ms-tokens',lose:'Looked up again when needed (a few credits)'},
  {id:'tt',name:'Last Top traders search',test:k=>k==='tt-last',lose:'The last list won\'t reopen by itself'},
  {id:'px',name:'Today\'s prices & logs',test:k=>k==='ff-curpx'||k==='ms-log',lose:'Nothing: rebuilt for free'},
  {id:'dev',name:'Dev & platform checks',test:k=>k==='ff-dev'||k==='ff-plat'||k==='ff-age',lose:'Checked again on the next analysis (credits)'},
  {id:'sc',name:'Wallet scores & History list',test:k=>k.startsWith('ws-tts:')||k.startsWith('ws-score:')||k==='ff-hist'||k==='ws-tt',keep:true,lose:'Clear these from the History tab'},
  {id:'etc',name:'Settings, keys & other',test:()=>true,keep:true}];
function lsBreakdown(){const out=LS_CATS.map(c=>({...c,n:0,ch:0,keys:[]}));
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i),v=localStorage.getItem(k)||'',c=out.find(c=>c.test(k));c.ch+=k.length+v.length;c.keys.push(k);
    c.n+=c.id==='hd'?(()=>{try{return JSON.parse(v).length}catch(e){return 1}})():c.id==='meta'&&k==='ff-meta'?(()=>{try{return Object.keys(JSON.parse(v)).length}catch(e){return 1}})():1}}catch(e){}
  return out}
const mbS=ch=>{const b=ch*2;return b>=1048576?(b/1048576).toFixed(2)+' MB':Math.max(1,Math.round(b/1024))+' KB'};
function lsMeter(){const el=$('lsmeter');if(!el)return;const cats=lsBreakdown(),tot=cats.reduce((a,c)=>a+c.ch,0),pc=tot/LS_CAP;
  const bar=$('lsbar');bar.style.width=Math.min(100,pc*100).toFixed(1)+'%';bar.className=pc>0.85?'hi':pc>0.6?'mid':'';
  el.textContent=`${mbS(tot)} of 10 MB used (${Math.round(pc*100)}%)${pc>0.85?' · almost full: scores may not save':''}`;el.classList.toggle('neg',pc>0.85);
  $('lscats').innerHTML=cats.filter(c=>c.ch>0).sort((a,b)=>b.ch-a.ch).map(c=>`<div class="lsc"><span><b>${esc(c.name)}</b>${c.n&&!c.keep?` <span class="hint" style="display:inline">· ${c.n.toLocaleString()}</span>`:''}${c.lose?`<span class="hint">${esc(c.lose)}</span>`:''}</span>
    <span class="sz">${mbS(c.ch)}</span>${c.keep?'<span></span>':`<button type="button" class="ghost" data-clr="${c.id}">Clear</button>`}</div>`).join('');
  if(navigator.storage&&navigator.storage.estimate)navigator.storage.estimate().then(e=>{const idb=Math.max(0,(e.usage||0)-tot*2);$('lsidb').textContent=`Saved wallet trades: ${(idb/1048576).toFixed(1)} MB (stored separately, no limit, never cleared here)`}).catch(()=>{})}
$('lscats').addEventListener('click',e=>{const b=e.target.closest('[data-clr]');if(!b)return;
  if(b.dataset.armed!=='1'){b.dataset.armed='1';b.classList.add('armed');b.textContent='Sure?';setTimeout(()=>{if(b.isConnected){b.dataset.armed='';b.classList.remove('armed');b.textContent='Clear'}},3500);return}
  const c=lsBreakdown().find(c=>c.id===b.dataset.clr);if(c)c.keys.forEach(k=>{try{localStorage.removeItem(k)}catch(x){}});
  if(c&&c.id==='dev'){DEVC=null;PLATC=null}if(c&&c.id==='px'){try{cpxGet.c=null}catch(x){}}
  lsMeter();try{hiRender()}catch(x){}try{if(CUR)rerender()}catch(x){}});
// "Free up space now": clears every category that has a Clear button (scores, History, keys, settings and wallet trades stay)
$('lsfree').addEventListener('click',()=>{const b=$('lsfree');
  if(b.dataset.armed!=='1'){b.dataset.armed='1';b.classList.add('armed');b.textContent='Clears everything with a Clear button above · click again';setTimeout(()=>{if(b.dataset.armed==='1'){b.dataset.armed='';b.classList.remove('armed');b.textContent='Free up space now'}},4000);return}
  b.dataset.armed='';b.classList.remove('armed');const before=lsChars();
  for(const c of lsBreakdown())if(!c.keep)c.keys.forEach(k=>{try{localStorage.removeItem(k)}catch(x){}});
  DEVC=null;PLATC=null;try{cpxGet.c=null}catch(x){}
  b.textContent=`Freed ${mbS(Math.max(0,before-lsChars()))}`;setTimeout(()=>b.textContent='Free up space now',2500);lsMeter();try{hiRender()}catch(x){}try{if(CUR)rerender()}catch(x){}});
$('lsauto').checked=SET.lsauto!==false;LS_AUTO=SET.lsauto!==false;
$('lsauto').addEventListener('change',()=>{SET.lsauto=$('lsauto').checked;LS_AUTO=SET.lsauto;saveSet();lsAutoCheck()});
// automatic: when storage passes 85%, free space before it fills (checked on open, every minute, and when Settings opens)
function lsAutoCheck(){if(!LS_AUTO)return;if(lsChars()/LS_CAP>0.85){lsFree(0.6);lsMeter()}}
$('gear').addEventListener('click',()=>setTimeout(lsMeter,50));$('lsgrp').addEventListener('toggle',lsMeter);
lsAutoCheck();setInterval(lsAutoCheck,60000);lsMeter();
