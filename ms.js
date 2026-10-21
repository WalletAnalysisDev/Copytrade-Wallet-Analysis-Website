/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* Migrated tab: find migrated tokens that pass your filters (GeckoTerminal, free), read each token's top traders
   (Helius), then score the best of them as wallets to copy. Runs one token at a time; can repeat on a timer. */
const MS={running:false,stop:false,timer:null,nextAt:0,sort:'score',log:[]};
const MS_DEF={mc:8000,mcMax:null,holders:null,devMax:10,top10Max:60,active:true,vol:200000,age:3,fees:3,n:5,k:10,roi:50,depth:50,skip:12,auto:0,rs:0,plats:['pumpswap']};
const MS_PLATS=['pumpswap','meteora-damm-v2','raydium'];
let MSS={...MS_DEF};try{MSS={...MS_DEF,...JSON.parse(localStorage.getItem('ms-set')||'{}')}}catch(e){}
const msSave=()=>{try{localStorage.setItem('ms-set',JSON.stringify(MSS))}catch(e){}};
const msTokens=()=>{try{return JSON.parse(localStorage.getItem('ms-tokens')||'{}')}catch(e){return {}}};
const msTokensSave=t=>{try{localStorage.setItem('ms-tokens',JSON.stringify(t))}catch(e){}};
const usdK=v=>v>=1e6?'$'+(+(v/1e6).toFixed(2))+'M':v>=1e3?'$'+(+(v/1e3).toFixed(1))+'K':'$'+Math.round(v);
const ageTxt=h=>h<1?Math.round(h*60)+'m':h<48?(+h.toFixed(1))+'h':Math.round(h/24)+'d';

/* ---------- settings ---------- */
const msFields={devMax:'ms-devmax',top10Max:'ms-top10',mcMax:'ms-mcmax',holders:'ms-holders',mc:'ms-mc',vol:'ms-vol',age:'ms-age',fees:'ms-fees',n:'ms-n',k:'ms-k',roi:'ms-roi',depth:'ms-depth',skip:'ms-skip',auto:'ms-auto',rs:'ms-rs'};
for(const [k,id] of Object.entries(msFields)){$(id).value=MSS[k]==null?'':String(MSS[k]);
  $(id).addEventListener('change',()=>{const v=$(id).value.trim();MSS[k]=v===''?(['roi','mcMax','holders','devMax','top10Max'].includes(k)?null:MS_DEF[k]):+v;msSave();msEst();if(k==='auto')msSchedule()})}
$('ms-active').checked=MSS.active!==false;$('ms-active').addEventListener('change',()=>{MSS.active=$('ms-active').checked;msSave()});
for(const p of MS_PLATS){const el=$('ms-p-'+p);el.checked=MSS.plats.includes(p);
  el.addEventListener('change',()=>{MSS.plats=MS_PLATS.filter(x=>$('ms-p-'+x).checked);msSave()})}
function msEst(){const per=(+MSS.depth)*10+(+MSS.k)*(100+(+MSS.rs||0)*20);
  $('ms-est').innerHTML=`About <b>${(per*MSS.n).toLocaleString()}</b> Helius credits per run at most (${MSS.n} token${MSS.n>1?'s':''} × ~${(+MSS.depth*10).toLocaleString()} to read trades + ~${(MSS.k*(100+(+MSS.rs||0)*20)).toLocaleString()} to score ${MSS.k} traders${+MSS.rs?`, including round-trip & spike checks on up to ${MSS.rs} tokens each`:''}). Finding tokens is free. Traders already scored cost nothing.`}
msEst();

/* ---------- log ---------- */
function msLog(html,cls){MS.log.push({t:Date.now(),html,cls:cls||''});if(MS.log.length>200)MS.log.shift();
  try{localStorage.setItem('ms-log',JSON.stringify(MS.log.slice(-60)))}catch(e){}msLogRender()}
function msLogRender(){$('ms-log').innerHTML=MS.log.slice().reverse().map(l=>`<div class="ln ${l.cls}"><span>${new Date(l.t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span> ${l.html}</div>`).join('') /* newest first */}
try{MS.log=JSON.parse(localStorage.getItem('ms-log')||'[]')}catch(e){}msLogRender();
$('ms-clearlog').addEventListener('click',()=>{MS.log=[];try{localStorage.removeItem('ms-log')}catch(e){}msLogRender()});

/* ---------- finding migrated tokens (GeckoTerminal, free, about 30 calls a minute) ---------- */
let gtLast=0;
// GeckoTerminal allows about 30 calls a minute; every call has a 15s timeout and every problem is written to the log
async function gtGet(url,what){
  for(let a=0;a<4&&!MS.stop;a++){const w=gtLast+2700-Date.now();if(w>0)await sleep(w);gtLast=Date.now(); // 2.7s apart: under GeckoTerminal's ~30/min, so it rarely rate-limits
    const ac=new AbortController(),to=setTimeout(()=>ac.abort(),15000);let r;
    try{r=await fetch(url,{signal:ac.signal,cache:'no-store'})}
    catch(e){clearTimeout(to);msLog(`GeckoTerminal ${what}: ${e.name==='AbortError'?'no answer after 15s':'could not connect'}${a<3?', trying again…':''}`,'err');await sleep(3000);continue}
    clearTimeout(to);
    if(r.status===429){gtLast=Date.now()+15000;msLog(`GeckoTerminal is rate-limiting (${what}), waiting 15s…`,'skip');continue}
    if(!r.ok){msLog(`GeckoTerminal ${what}: answered ${r.status}${r.status===403?' (blocked)':''}.`,'err');return null}
    try{return await r.json()}catch(e){msLog(`GeckoTerminal ${what}: unreadable answer.`,'err');return null}}
  return null}
let msCache=null;
async function msCandidates(){
  const ck=MSS.plats.join(',')+'|'+MSS.vol;if(msCache&&msCache.k===ck&&Date.now()-msCache.at<180000){msLog('Using the token list from the last 3 minutes (no GeckoTerminal calls).','skip');return msCache.list}
  const out=[],seen=new Set(),now=Date.now();
  for(const dex of MSS.plats){for(let page=1;page<=10&&!MS.stop;page++){
    const nm={'pumpswap':'PumpSwap','meteora-damm-v2':'Meteora DAMM v2','raydium':'Raydium'}[dex]||dex;
    const j=await gtGet(`https://api.geckoterminal.com/api/v2/networks/solana/dexes/${dex}/pools?page=${page}&sort=h24_volume_usd_desc&include=base_token`,`${nm} page ${page}`);
    if(j&&j.data)msLog(`${nm} page ${page}: ${j.data.length} pools, top volume ${usdK(+(j.data[0]&&j.data[0].attributes.volume_usd.h24)||0)}`,'skip');
    if(!j||!j.data||!j.data.length)break;
    const inc=Object.fromEntries((j.included||[]).map(x=>[x.id,x.attributes]));let low=false;
    for(const p of j.data){const a=p.attributes,bt=p.relationships.base_token.data.id,mint=bt.replace(/^solana_/,''),tk=inc[bt]||{};
      const vol=+(a.volume_usd&&a.volume_usd.h24)||0;if(vol<MSS.vol){low=true;continue}
      if(seen.has(mint)||mint==='So11111111111111111111111111111111111111112')continue;seen.add(mint);
      const tx=a.transactions&&a.transactions.h24||{};
      out.push({mint,pool:a.address,sym:tk.symbol||a.name.split(' / ')[0],name:tk.name||'',dex,vol,mc:+(a.market_cap_usd||a.fdv_usd)||0,
        poolAgeH:(now-Date.parse(a.pool_created_at))/36e5,buyers:tx.buyers||0,sellers:tx.sellers||0,
        m5:((a.transactions.m5||{}).buys||0)+((a.transactions.m5||{}).sells||0),m15:((a.transactions.m15||{}).buys||0)+((a.transactions.m15||{}).sells||0)})}
    if(low)break}}
  const list=out.sort((a,b)=>b.vol-a.vol);if(!MS.stop)msCache={k:ck,at:Date.now(),list};return list;
}

/* ---------- token age: the token's first transaction (one Helius call, only when the pool itself is younger than the minimum) ---------- */
async function tokenAgeH(mint,key){
  const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransactionsForAddress',params:[mint,{transactionDetails:'signatures',limit:1,sortOrder:'asc'}]})});
  const t=j.result&&j.result.data&&j.result.data[0];return t&&t.blockTime?(Date.now()/1000-t.blockTime)/3600:null;
}

/* ---------- one run ---------- */
async function msRun(imported){ // imported: token addresses pasted in the Import box (skips finding tokens)
  if(MS.running)return;const key=getKey();
  if(!key){msLog('Add your Helius key in Settings (gear icon) first.','err');return}
  if(!imported&&!MSS.plats.length){msLog('Pick at least one "Migrated to" platform.','err');return}
  MS.running=true;MS.stop=false;$('ms-go').disabled=true;$('ms-impgo').disabled=true;$('ms-stop').hidden=false;$('ms-stop').textContent='Stop';$('ms-next').textContent='';
  let credits=0,scored=0,searched=0;
  try{
    let pass,T=msTokens(),now=Date.now();const applyF=!imported||MSS.impFilter;
    if(imported){
      msLog(`Scanning ${imported.length} imported token${imported.length>1?'s':''}${applyF?' (with your filters)':''}…`);
      pass=[];for(let i=0;i<imported.length&&!MS.stop;i+=30){const part=imported.slice(i,i+30); // names, market cap and volume, 30 tokens per free call
        const j=await gtGet(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/${part.join(',')}`,'imported tokens');
        const by=Object.fromEntries(((j&&j.data)||[]).map(d=>[d.attributes.address,d.attributes]));
        for(const mint of part){const a=by[mint]||{};pass.push({mint,sym:a.symbol||short(mint),name:a.name||'',dex:'import',vol:+(a.volume_usd&&a.volume_usd.h24)||0,mc:+(a.market_cap_usd||a.fdv_usd)||0,poolAgeH:0,buyers:0,sellers:0,imported:true})}}
      if(applyF)pass=pass.filter(c=>{if(c.mc&&(c.mc<MSS.mc||(MSS.mcMax!=null&&c.mc>MSS.mcMax))){T[c.mint]={...c,at:now,status:'skip',why:`market cap ${usdK(c.mc)}`};return false}return true});
    }else{
    msLog(`Looking for migrated tokens: market cap ${usdK(MSS.mc)}${MSS.mcMax!=null?'–'+usdK(MSS.mcMax):'+'}, 24h volume ≥ ${usdK(MSS.vol)}${MSS.holders!=null?`, ${MSS.holders}+ holders`:''}…`);
    const cands=await msCandidates();if(MS.stop)throw new Error('stopped');
    // order: market cap range → traded in the last ~10 min → not checked recently; the busiest right now go first
    const inRange=cands.filter(c=>c.mc>=MSS.mc&&(MSS.mcMax==null||c.mc<=MSS.mcMax));
    // traded in the last ~10 minutes: a trade in the last 5 minutes, or 5+ in the last 15 (GeckoTerminal counts in 5 and 15 minute windows)
    const live=MSS.active!==false?inRange.filter(c=>c.m5>0||c.m15>=5):inRange;
    pass=live.filter(c=>{const d=T[c.mint];return !d||!d.at||now-d.at>MSS.skip*36e5}).sort((a,b)=>(b.m15-a.m15)||(b.vol-a.vol));
    for(const c of pass)c.fewSellers=c.buyers>=50&&c.sellers<c.buyers*0.05; // flagged, not skipped: can mean a honeypot, a bundle, or just GeckoTerminal's count
    msLog(`Found ${cands.length} with 24h volume ≥ ${usdK(MSS.vol)} · ${inRange.length} in your market cap range${MSS.active!==false?` · ${live.length} traded in the last 10 min`:''} · ${live.length-pass.length} of those checked in the last ${MSS.skip}h · <b>${pass.length} to scan</b>.`);
    if(!pass.length){
      if(MSS.active!==false&&live.length<=inRange.length/4)msLog(`Most high-volume tokens have gone quiet: only ${live.length} of ${inRange.length} traded in the last 10 minutes. ${live.length?`Those were already checked in the last ${MSS.skip}h (lower "Skip tokens checked in last" to re-check them).`:''} Turn on "Repeat automatically" to catch new ones as they get active.`,'skip');
      else if(live.length)msLog(`Every matching token was checked in the last ${MSS.skip}h. Lower "Skip tokens checked in last" to re-check them.`,'skip');
    }
    }
    let picked=0;const cap=imported?50:MSS.n;
    for(const c of pass){if(MS.stop||picked>=cap)break;
      const lab2=[c.mc?usdK(c.mc)+' MC':'',c.vol?usdK(c.vol)+' vol':''].filter(Boolean).join(', '),label=`<b>${esc(c.sym)}</b>${lab2?` (${lab2})`:''}${c.imported?' · imported':''}${c.fewSellers?' ⚠ few sellers':''}`;
      // holders, honeypot flag and top-10 share (GeckoTerminal token info, free)
      const info=await gtGet(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${c.mint}/info`,`${c.sym} info`);
      const ia=info&&info.data&&info.data.attributes;if(ia){c.holders=ia.holders&&ia.holders.count;c.top10=ia.holders&&ia.holders.distribution_percentage&&+ia.holders.distribution_percentage.top_10;c.honeypot=ia.is_honeypot}
      if(ia){c.dev=+ia.developer_holding_percentage;c.mintAuth=ia.mint_authority;c.freezeAuth=ia.freeze_authority;c.gtScore=ia.gt_score}
      const skip=why=>{T[c.mint]={...c,at:Date.now(),status:'skip',why};msLog(`${label}: skipped, ${why}.`,'skip');msTokensSave(T);msRender()};
      if(c.mintAuth==='yes'){skip('dev can still mint more tokens');continue}
      if(c.freezeAuth==='yes'){skip('dev can freeze wallets');continue}
      if(c.symFix===undefined&&ia&&ia.symbol&&c.imported){c.sym=ia.symbol;c.symFix=1}
      if(applyF&&MSS.devMax!=null&&isFinite(c.dev)&&c.dev>MSS.devMax){skip(`dev holds ${c.dev.toFixed(1)}%`);continue}
      if(applyF&&MSS.top10Max!=null&&isFinite(c.top10)&&c.top10>MSS.top10Max){skip(`top 10 hold ${c.top10.toFixed(0)}%`);continue}
      if(applyF&&c.gtScore!=null&&c.gtScore<20){skip(`GeckoTerminal trust score ${Math.round(c.gtScore)}`);continue}
      if(c.honeypot==='yes'||c.honeypot===true){T[c.mint]={...c,at:Date.now(),status:'skip',why:'honeypot'};msLog(`${label}: skipped, flagged as a honeypot.`,'skip');msTokensSave(T);msRender();continue}
      if(applyF&&MSS.holders!=null){if(c.holders==null)msLog(`${label}: holder count not available, checking anyway.`,'skip');
        else if(c.holders<MSS.holders){T[c.mint]={...c,at:Date.now(),status:'skip',why:`${c.holders} holders`};msLog(`${label}: skipped, only ${c.holders} holders.`,'skip');msTokensSave(T);msRender();continue}}
      // age
      let age=c.imported?null:c.poolAgeH;
      if(applyF&&(age==null||age<MSS.age)){try{const a=await tokenAgeH(c.mint,key);credits+=10;if(a!=null)age=a}catch(e){}}
      if(applyF&&age!=null&&age<MSS.age){T[c.mint]={...c,ageH:age,at:Date.now(),status:'skip',why:`only ${ageTxt(age)} old`};msLog(`${label}: skipped, only ${ageTxt(age)} old.`,'skip');msTokensSave(T);msRender();continue}
      picked++;searched++;
      msLog(`${label}: reading trades…`);
      let r;try{r=await topTraders(c.mint,key,+MSS.depth,()=>{});credits+=r.credits}
      catch(e){if(/key/i.test(e.message))throw e;msLog(`${label}: ${esc(e.message)}`,'err');continue}
      if(applyF&&r.fees<MSS.fees&&r.done){T[c.mint]={...c,ageH:age,at:Date.now(),status:'skip',why:`fees ${r.fees.toFixed(2)} SOL`};msLog(`${label}: skipped, total fees only ${r.fees.toFixed(2)} SOL.`,'skip');msTokensSave(T);msRender();continue}
      const m=MSS.roi==null?null:MSS.roi/100,elig=[];let looked=0;
      for(const w of r.traders){if(looked>=200||elig.length>=MSS.k)break;looked++;if(m==null||(w.roi!=null&&w.roi>=m-1e-9))elig.push(w)}
      T[c.mint]={...c,ageH:age,at:Date.now(),status:'ok',fees:r.fees,feesCut:!r.done,txs:r.txs,traders:elig.map(w=>({addr:w.addr,realized:w.realized,roi:w.roi,multi:w.multi||null}))};
      msTokensSave(T);
      msLog(`${label}: ${r.txs.toLocaleString()} trades, ${r.fees.toFixed(1)}${r.done?'':'+'} SOL fees · ${elig.length} trader${elig.length===1?'':'s'}${m!=null?` at +${MSS.roi}% or more`:''}.`,'ok');
      msRender();
      // score the eligible traders (shared with the Top traders tab, so a wallet is only scored once)
      const o=opts();
      for(const w of elig){if(MS.stop)break;if(ttScoreGet(w.addr))continue;
        try{const known=!!histIndex()[w.addr];
          const res=await pullWallet(w.addr,key,21,()=>{},o.lastN,false,true);credits+=res.credits||0;
          if(+MSS.rs&&rsWorth(res,w.addr))credits+=await rsCheck(res.raw,res.px,w.addr,key,+MSS.rs||0);
          if(!known)ttMark(w.addr,true);Object.assign(NAMES,res.names||{});
          const s=res.raw.length?scoreOf(res.raw,res.px,w.addr,res.buys7,res.buys7est,res.ref||res.pulled,res.trades7):null;
          if(!lsPut(scoreKey(w.addr),JSON.stringify(s||{score:null,why:receiverNote(res)||'No token buys found'})))throw new Error('Browser storage is full: the score could not be saved.');if(s)gmPublishLite(w.addr,s);
          if(s){store.set('ws-score:'+w.addr,String(s.score));if(s.score>=90)msLog(`★ ${esc(short(w.addr))} scored <b>${s.score}</b> (from ${esc(c.sym)})`,'ok')}
          scored++}
        catch(e){if(/key|storage is full/i.test(e.message))throw e;if(!/reach|busy|internet/i.test(e.message)){try{localStorage.setItem(scoreKey(w.addr),JSON.stringify({score:null,why:e.message}))}catch(x){}}}
        msRender()}
    }
    msTokensSave(T);msCredAdd(credits);
    msLog(`${MS.stop?'Stopped. ':'Run finished. '}${searched} token${searched===1?'':'s'} searched · ${scored} wallet${scored===1?'':'s'} scored · about ${credits.toLocaleString()} Helius credits.`);
  }catch(e){if(e.message!=='stopped')msLog(esc(e.message),'err');else msLog('Stopped.')}
  finally{MS.running=false;$('ms-go').disabled=false;$('ms-impgo').disabled=false;$('ms-stop').hidden=true;msRender();msSchedule()}
}
function msSchedule(){clearTimeout(MS.timer);MS.timer=null;$('ms-next').textContent='';
  if(!+MSS.auto||MS.stop||MS.running)return;
  MS.nextAt=Date.now()+MSS.auto*60000;MS.timer=setTimeout(msRun,MSS.auto*60000);
  $('ms-next').textContent=`Next run at ${new Date(MS.nextAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})} (keep this window open)`}
$('ms-go').addEventListener('click',()=>{MS.stop=false;msRun()});
$('ms-stop').addEventListener('click',()=>{MS.stop=true;$('ms-stop').textContent='Stopping…';clearTimeout(MS.timer);$('ms-next').textContent=''});
$('ms-reset').addEventListener('click',()=>{const b=$('ms-reset');if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent='click again';setTimeout(()=>{b.dataset.armed='';b.textContent='reset'},3000);return}
  b.dataset.armed='';b.textContent='reset';try{localStorage.removeItem('ms-tokens')}catch(e){}msRender()});

/* ---------- results ---------- */
document.querySelector('#ms-trcard .seg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;MS.sort=b.dataset.s;
  document.querySelectorAll('#ms-trcard .seg button').forEach(x=>x.classList.toggle('on',x===b));msRender()});
function msRender(){
  const T=msTokens(),toks=Object.entries(T).sort((a,b)=>(b[1].at||0)-(a[1].at||0));
  // traders across every token searched
  const by=new Map();
  for(const [mint,t] of toks){if(t.status!=='ok')continue;for(const w of t.traders||[]){let x=by.get(w.addr);if(!x){x={addr:w.addr,hits:[],best:-Infinity,multi:null};by.set(w.addr,x)}
    x.hits.push({mint,sym:t.sym,realized:w.realized,roi:w.roi});x.best=Math.max(x.best,w.realized);if(w.multi&&(!x.multi||w.multi.n>x.multi.n))x.multi=w.multi}}
  ttRefreshStale([...by.keys()]);
  let rows=[...by.values()].map(x=>({...x,s:ttScoreGet(x.addr)}));const totalRows=rows.length;
  if(MSS.minScore!=null)rows=rows.filter(x=>x.s&&x.s.score!=null&&x.s.score>=MSS.minScore);
  if(MSS.noMulti)rows=rows.filter(x=>!x.multi);
  const sv=x=>x.s&&x.s.score!=null?x.s.score:-1;
  rows.sort(MS.sort==='pnl'?(a,b)=>b.best-a.best:MS.sort==='hits'?(a,b)=>(b.hits.length-a.hits.length)||(sv(b)-sv(a)):(a,b)=>(sv(b)-sv(a))||(b.best-a.best));
  $('ms-trcard').hidden=!totalRows;MS.shownRows=rows;MS.shown=rows.map(x=>x.addr);
  const great=rows.filter(r=>sv(r)>=90).length,un=rows.filter(r=>!r.s).length;
  $('ms-trhead').textContent=`Traders found · ${rows.length}${rows.length<totalRows?' of '+totalRows:''}`;
  $('ms-trsub').textContent=`${great} scored 90+${un?` · ${un} not scored yet`:''}. Click a score for the full analysis, a wallet for GMGN.`;
  $('ms-trlist').innerHTML=rows.slice(0,150).map((x,i)=>{const s=x.s;
    const sc=!s?`<span class="sc na" title="Not scored yet (next run, or stopped before it)">…</span>`:s.score==null?`<span class="sc na" title="${esc(s.why||'')}">n/a</span>`
      :`<span class="sc" data-open="${esc(x.addr)}" role="button" tabindex="0" style="color:${scCol(s.score)};background:color-mix(in srgb,${scCol(s.score)} 14%,transparent)" title="Open the full analysis">${s.score}${s.reliable?'':'*'}</span>`;
    const tier=x.multi?' multi':s&&s.score!=null?(s.score>=100?' gold':s.score>=90?' great':''):'';
    const mw=x.multi?`<span class="mwt" title="Trades in the same block as ${x.multi.n-1} other wallet(s)">Multi-Wallet ×${x.multi.n}</span>`:'';
    const chips=x.hits.slice(0,4).map(h=>`<span class="tchip" title="${esc(h.sym)}: ${sol(h.realized)}${h.roi!=null?' ('+pct(h.roi)+')':''}">${esc(h.sym)} ${h.roi!=null?pct(h.roi):''}</span>`).join('')+(x.hits.length>4?`<span class="tchip">+${x.hits.length-4}</span>`:'');
    return `<div class="ttr${tier}"><span class="rk">${i+1}</span>
      <div style="min-width:0"><a class="wa" href="https://gmgn.ai/sol/address/${encodeURIComponent(x.addr)}" target="_blank" rel="noopener" title="Open this wallet on GMGN">${esc(short(x.addr))} ↗</a>${mw}
        <div class="sub">${chips}${s&&s.score!=null?` · ${s.n} trades${s.hold!=null?' · hold '+fmtHold(s.hold):''}`:''}</div></div>
      <div class="pnl ${cls(x.best)}">${sol(x.best)}<div class="sub">${x.hits.length} token${x.hits.length>1?'s':''}</div></div>${sc}</div>`}).join('');
  // tokens checked
  $('ms-tkcard').hidden=!toks.length;
  $('ms-tklist').innerHTML=toks.slice(0,60).map(([mint,t])=>`<div class="tkr"><div style="min-width:0"><a href="https://gmgn.ai/sol/token/${encodeURIComponent(mint)}" target="_blank" rel="noopener">${esc(t.sym)}</a>
      <span class="hint">${t.mc?' · '+usdK(t.mc)+' MC':''}${t.vol?' · '+usdK(t.vol)+' vol':''}${t.imported?' · imported':''}${t.ageH!=null?' · '+ageTxt(t.ageH):''}${t.holders!=null?' · '+t.holders.toLocaleString()+' holders':''}${t.top10!=null&&t.top10>=50?` · <span class="amb" title="Top 10 holders own ${t.top10.toFixed(0)}%">top 10 hold ${t.top10.toFixed(0)}%</span>`:''}${t.fees!=null?` · ${t.fees.toFixed(1)}${t.feesCut?'+':''} SOL fees`:''}${t.fewSellers?` · <span class="amb" title="${t.sellers} sellers vs ${t.buyers} buyers in 24h">⚠ few sellers</span>`:''}</span></div>
      <span class="st ${t.status}">${t.status==='ok'?`${(t.traders||[]).length} traders`:esc(t.why||'skipped')}</span></div>`).join('');
}
$('ms-trlist').addEventListener('click',e=>{const o=e.target.closest('[data-open]');if(!o)return;const w=o.dataset.open;showView('wallet');$('addr').value=w;score(w,!!histIndex()[w])});
msRender();
if(store.get('ws-view')==='ms')showView('ms');

/* ---------- import: paste one or many token addresses (comma, space or new line between them; GMGN links work too) ---------- */
const MINT_RE=/[1-9A-HJ-NP-Za-km-z]{32,44}/g;
function msParseImport(){const seen=new Set(),out=[];for(const m of ($('ms-imp').value||'').match(MINT_RE)||[])if(!seen.has(m)){seen.add(m);out.push(m)}return out}
$('ms-imp').addEventListener('input',()=>{const n=msParseImport().length;$('ms-impcount').textContent=n?`${n} token${n>1?'s':''} found`:'';$('ms-impgo').textContent=n?`Scan ${n} token${n>1?'s':''}`:'Scan imported'});
$('ms-impgo').addEventListener('click',()=>{const list=msParseImport();if(!list.length){msLog('Paste at least one token address in Import.','err');return}if(list.length>50)msLog(`Only the first 50 of ${list.length} imported tokens are scanned per run.`,'skip');MS.stop=false;msRun(list.slice(0,50))});
$('ms-impf').checked=!!MSS.impFilter;$('ms-impf').addEventListener('change',()=>{MSS.impFilter=$('ms-impf').checked;msSave()});

/* ---------- collapsible sections (remembered) ---------- */
function msFold(btn,body,key){const set=open=>{body.hidden=!open;btn.textContent=open?'hide':'show';btn.setAttribute('aria-expanded',open)};
  let open=true;try{open=localStorage.getItem(key)!=='0'}catch(e){}set(open);
  btn.addEventListener('click',()=>{open=body.hidden;set(open);try{localStorage.setItem(key,open?'1':'0')}catch(e){}})}
msFold($('ms-logfold'),$('ms-log'),'ms-fold-log');
msFold($('ms-setfold'),$('ms-setbody'),'ms-fold-set');

/* ---------- Helius credits used by this tab today ---------- */
function msCredAdd(n){const d=new Date().toDateString();let c={};try{c=JSON.parse(localStorage.getItem('ms-cred')||'{}')}catch(e){}if(c.d!==d)c={d,n:0};c.n+=n||0;try{localStorage.setItem('ms-cred',JSON.stringify(c))}catch(e){}msCredShow()}
function msCredShow(){let c={};try{c=JSON.parse(localStorage.getItem('ms-cred')||'{}')}catch(e){}$('ms-cred').textContent=c.d===new Date().toDateString()&&c.n?`${c.n.toLocaleString()} Helius credits used here today`:''}
msCredShow();

/* ---------- traders found: clear, copy, minimum score, hide multi-wallets ---------- */
$('ms-trclear').addEventListener('click',()=>{const b=$('ms-trclear');if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent='click again';setTimeout(()=>{b.dataset.armed='';b.textContent='clear'},3000);return}
  b.dataset.armed='';b.textContent='clear';const T=msTokens();for(const k in T)if(T[k].traders)T[k].traders=[];msTokensSave(T);msRender();msLog('Traders found cleared (scores are kept, so re-finding a wallet costs nothing).','skip')});
$('ms-minsc').value=MSS.minScore==null?'':MSS.minScore;
$('ms-minsc').addEventListener('input',()=>{const v=$('ms-minsc').value.trim();MSS.minScore=v===''?null:+v;msSave();msRender()});
$('ms-nomulti').checked=!!MSS.noMulti;$('ms-nomulti').addEventListener('change',()=>{MSS.noMulti=$('ms-nomulti').checked;msSave();msRender()});
async function msCopy(btn,list){const txt=list.join('\n');try{await navigator.clipboard.writeText(txt);const o=btn.textContent;btn.textContent=`copied ${list.length}`;setTimeout(()=>btn.textContent=o,1500)}catch(e){btn.textContent='copy blocked'}}
$('ms-copy').addEventListener('click',()=>msCopy($('ms-copy'),MS.shown||[]));
$('ms-copy90').addEventListener('click',()=>msCopy($('ms-copy90'),(MS.shownRows||[]).filter(x=>x.s&&x.s.score>=90).map(x=>x.addr)));
msRender();
