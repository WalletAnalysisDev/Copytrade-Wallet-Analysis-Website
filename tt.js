/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* Top traders tab: find the most profitable traders of a token, then score each one as a wallet to copy. */
const TT={res:null,mint:'',name:'',sort:'pnl',running:false,stop:false};
const ttSet=()=>{try{return JSON.parse(localStorage.getItem('ws-tt')||'{}')}catch(e){return {}}}; // wallets saved only by batch scoring (kept out of the history chips)
const ttMark=(w,on)=>{const s=ttSet();if(on)s[w]=1;else delete s[w];try{localStorage.setItem('ws-tt',JSON.stringify(s))}catch(e){}};
const mintsFrom=v=>{const out=[];for(const m of String(v||'').matchAll(/[1-9A-HJ-NP-Za-km-z]{32,44}/g))if(!out.includes(m[0]))out.push(m[0]);return out}; // several tokens: commas, spaces or new lines
const mintFrom=v=>{v=(v||'').trim();const m=v.match(/gmgn\.ai\/[a-z]+\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/)||v.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);return m?m[1]:''};
/* only traders at or above the Min PnL % (on this token) get scored */
// Min PnL: a % return (ttMin is a ratio, 1 = +100%) or SOL of realized profit, picked next to the box
const ttSolMode=()=>$('ttminmode').value==='sol';
const ttMin=()=>{const v=$('ttminroi').value.trim();return v===''?null:ttSolMode()?+v:+v/100};
const ttMaxB=()=>{const v=$('ttmaxb').value.trim();return v===''||!(+v>0)?null:Math.floor(+v)};
const ttBuys=w=>w.hits?Math.max(...w.hits.map(h=>h.nb||0)):(w.nb||0); // several tokens: the most buys on any one of them
const ttOkB=w=>{const b=ttMaxB();return b==null||ttBuys(w)<=b};
const ttOk=w=>{const m=ttMin();return ttOkB(w)&&(m==null||(ttSolMode()?(w.realized!=null&&w.realized>=m-1e-9):(w.roi!=null&&w.roi>=m-1e-9)))};
const ttMinTxt=m=>ttSolMode()?`+${+m.toFixed(3)} SOL`:`+${Math.round(m*100)}%`;
try{$('ttrs').value=localStorage.getItem('tt-rs')||'0'}catch(e){}
/* "Only if score ≥": one setting shared by Top traders, Automatic and the Wallet tab */
function rsMinSync(v){SET.rsmin=Math.max(0,Math.min(100,+v||0));saveSet();for(const id of ['ttrsmin','ms-rsmin','rsmin']){const el=document.getElementById(id);if(el&&document.activeElement!==el)el.value=SET.rsmin||''}}
for(const id of ['ttrsmin','ms-rsmin','rsmin']){const el=document.getElementById(id);if(el){el.value=SET.rsmin||'';el.addEventListener('change',()=>rsMinSync(el.value))}}
try{$('ttautotok').checked=localStorage.getItem('tt-autotok')==='1'}catch(e){}
$('ttautotok').addEventListener('change',()=>{try{localStorage.setItem('tt-autotok',$('ttautotok').checked?'1':'0')}catch(e){}if($('ttautotok').checked)ttCheckTab()});
try{$('ttauto').checked=localStorage.getItem('tt-auto')==='1'}catch(e){}
$('ttauto').addEventListener('change',()=>{try{localStorage.setItem('tt-auto',$('ttauto').checked?'1':'0')}catch(e){}});
$('ttrs').addEventListener('change',()=>{try{localStorage.setItem('tt-rs',$('ttrs').value)}catch(e){}});
try{const v=localStorage.getItem('tt-minroi');$('ttminroi').value=v==null?'50':v}catch(e){$('ttminroi').value='50'}
try{const md=localStorage.getItem('tt-minmode');if(md==='sol'||md==='pct')$('ttminmode').value=md}catch(e){}
$('ttminmode').addEventListener('change',()=>{try{localStorage.setItem('tt-minmode',$('ttminmode').value)}catch(e){}$('ttminroi').step=ttSolMode()?'0.5':'10';if(TT.res)ttRender()});$('ttminroi').step=ttSolMode()?'0.5':'10';
try{$('ttmaxb').value=localStorage.getItem('tt-maxb')||''}catch(e){}
$('ttmaxb').addEventListener('input',()=>{try{localStorage.setItem('tt-maxb',$('ttmaxb').value.trim())}catch(e){}if(TT.res)ttRender()});
$('ttminroi').addEventListener('input',()=>{try{localStorage.setItem('tt-minroi',$('ttminroi').value.trim())}catch(e){}if(TT.res)ttRender()});
/* Helius credits used in Top traders: this scoring run, this session (since the panel was opened) and today */
const TTC={run:0,session:0,running:false};
function ttCredAdd(n){n=+n||0;if(!n)return;TTC.session+=n;if(TTC.running)TTC.run+=n;
  const d=new Date().toDateString();let c={};try{c=JSON.parse(localStorage.getItem('tt-cred')||'{}')}catch(e){}if(c.d!==d)c={d,n:0};c.n+=n;try{localStorage.setItem('tt-cred',JSON.stringify(c))}catch(e){}ttCredShow()}
function ttCredShow(){const el=$('ttcred');if(!el)return;let c={};try{c=JSON.parse(localStorage.getItem('tt-cred')||'{}')}catch(e){}const today=c.d===new Date().toDateString()?c.n:0;
  if(!TTC.session&&!today){el.hidden=true;return}el.hidden=false;
  const f=n=>'~'+Math.round(n).toLocaleString();
  el.innerHTML=`<div class="credh">Helius credits used (approx.)</div><div class="cc${TTC.running?' live':''}"><span class="k">${TTC.running?'Scoring now':'Last scoring'}</span><b>${f(TTC.run)}</b></div><div class="cc"><span class="k">Session</span><b>${f(TTC.session)}</b></div><div class="cc"><span class="k">Today</span><b>${f(today)}</b></div>`}
function ttStatus(t,err){const s=$('ttstatus');s.textContent=t||'';s.className='status'+(err?' err':'')}

/* ---------- tabs ---------- */
function showView(v){document.querySelectorAll('.tabs button').forEach(b=>{const on=b.dataset.v===v;b.classList.toggle('on',on);b.setAttribute('aria-selected',on)});
  $('vwallet').hidden=v!=='wallet';$('vtt').hidden=v!=='tt';const ms=document.getElementById('vms');if(ms)ms.hidden=v!=='ms';const hi=document.getElementById('vhist');if(hi){hi.hidden=v!=='hist';if(v==='hist')try{hiRender()}catch(e){}}store.set('ws-view',v);if(v==='tt')ttCheckTab()}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)showView(b.dataset.v)});

/* ---------- scoring one wallet without opening it ---------- */
function scoreOf(raw,px,wallet,buys7,est,ref,trades7){
  const o=opts(),tr=hydrate(raw,px,o);for(const t of tr)t.dev=isDev(t.tok,wallet);
  const U=recent(tr,o).filter(t=>adjRet(t,o)!==null);if(!U.length)return null;
  const base=summarize(U,o),{best:b0}=optimize(U,o),{best}=trimWeakEdges(b0,U,o),k=best?summarize(U.filter(t=>inF(t,best)),o):base;
  const inside=best?U.filter(t=>inF(t,best)):U,rs=rsOf(inside,o);
  const win=Math.round(k.win*100),hold=avgHoldOf(U),p7=pnl7Of(recent(tr,{...o,offPlat:[]}),ref,px||150),adj=adjustScore(win,buys7,est,hold,p7,k.n>=SC().perfectN&&k.win===1?k.n:0,k.n,fastShareOf(U),rs,trades7,formOf(U,inside,o,ref));
  const out={rv:rulesV(),trades7,score:adj.score,win,parts:adj.parts,perfect:adj.perfect||0,reliable:!!best,n:k.n,all:U.length,pnl:k.pnl,hold,buys7,rs:rs?{rt:rs.rt,heavy:rs.heavy,spN:rs.spN,checked:rs.checked,pot:rs.pot}:null,allPnl:base.pnl,allWin:base.win,p7usd:p7?p7.totUsd:null,p7days:p7?p7.days:0,p7pos:p7?p7.pos:0};
  // GMGN labels for this wallet's tokens: kept off the saved score (not stored), handed to gmPublishLite
  try{const G=gmTokensOf(tr,o,best);Object.defineProperty(out,'_gm',{value:{tokens:G.tokens,devN:G.devN,filters:gmFilters(best)},enumerable:false})}catch(e){}
  return out;
}
/* Optional round-trip & entry-spike check while scoring (Top traders and Automatic): checks up to `max` of the newest
   tokens inside the wallet's filters, about 20 Helius credits each. Results are shared with the Wallet tab. */
/* only spend credits on the check when the wallet already scores at least the "Only if score ≥" setting (0 = every wallet) */
function rsWorth(res,w){const min=+SET.rsmin||0;if(!min)return true;const s=res.raw.length?scoreOf(res.raw,res.px,w,res.buys7,res.buys7est,res.ref||res.pulled,res.trades7):null;return !!(s&&s.score!=null&&s.score>=min)}
async function rsCheck(raw,px,wallet,key,max,onp){
  if(!max||!raw.length)return 0;const o=opts(),tr=hydrate(raw,px,o);
  const U=recent(tr,o).filter(t=>adjRet(t,o)!==null);if(!U.length)return 0;
  const {best:b0}=optimize(U,o),{best}=trimWeakEdges(b0,U,o);
  const list=(best?U.filter(t=>inF(t,best)):U).filter(t=>t.pool&&t.pxIn).sort((a,b)=>b.t-a.t).slice(0,max).filter(t=>!oppGet(t));
  let credits=0,next=0,done=0,fatal=null;
  const worker=async()=>{while(!fatal&&next<list.length){const t=list[next++];try{const v=await checkToken(t,key,wallet,true);credits+=v.credits;oppPut(t,v)}catch(e){if(/key/i.test(e.message))fatal=e}done++;if(onp)onp(done,list.length)}};
  await Promise.all(Array.from({length:Math.min(3,list.length)},worker));if(fatal)throw fatal;return credits;
}
const scoreKey=w=>'ws-tts:'+w;
const ttScoreGet=w=>{try{return JSON.parse(localStorage.getItem(scoreKey(w))||'null')}catch(e){return null}};
/* Saved scores carry the scoring-rules version. A score saved under older rules is recomputed from the wallet's saved
   trades (no Helius credits) the next time it's on screen, so Top traders, Automatic and the Wallet tab always agree. */
const ttRefreshQ=new Set(),ttRefreshTried=new Set();let ttRefreshing=false;
function ttRefreshStale(addrs){
  for(const a of addrs){const s=ttScoreGet(a);if(s&&s.score!=null&&s.rv!==rulesV()&&!ttRefreshTried.has(a))ttRefreshQ.add(a)}
  if(ttRefreshing||!ttRefreshQ.size)return;ttRefreshing=true;
  (async()=>{const o=opts();
    while(ttRefreshQ.size){const a=ttRefreshQ.values().next().value;ttRefreshQ.delete(a);ttRefreshTried.add(a);
      try{const res=await pullWallet(a,getKey(),21,()=>{},o.lastN,true,true); // offline: saved trades only
        const s=res.raw.length?scoreOf(res.raw,res.px,a,res.buys7,res.buys7est,res.ref||res.pulled,res.trades7):null;
        if(s){lsPut(scoreKey(a),JSON.stringify(s));store.set('ws-score:'+a,String(s.score));gmPublishLite(a,s)}}catch(e){}
      await new Promise(r=>setTimeout(r,0))}
    ttRefreshing=false;try{if(TT.res)ttRender()}catch(e){}try{msRender()}catch(e){}})();
}

/* ---------- find top traders ---------- */
$('ttform').addEventListener('submit',async e=>{e.preventDefault();if(TT.running)return;
  const mint=mintFrom($('ttmint').value),key=getKey(),mints=mintsFrom($('ttmint').value);
  if(!key){ttStatus('Add your Helius key in Settings (gear icon) first.',true);return}
  if(!mint){ttStatus('Paste a token address or a GMGN token link.',true);return}
  if(typeof HD!=='undefined'&&HD.mode==='holders'){if(!HD.running){TT.autoLast=mint;hdRun(mint)}return}
  if(mints.length>1){ttMulti(mints,key);return}
  TT.autoLast=mint;
  TT.running=true;$('ttgo').disabled=true;$('ttkeep').hidden=MODE!=='popup';$('ttres').hidden=true;
  try{
    ttStatus('Looking up the token…');
    let meta=metaAll();
    if(!meta[mint]){try{const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'m',method:'getAssetBatch',params:{ids:[mint]}})});const a=(j.result||[])[0];
      if(a){const ti=a.token_info||{};meta[mint]=[(a.content?.metadata?.symbol||'').slice(0,24),ti.supply&&ti.decimals!=null?ti.supply/Math.pow(10,ti.decimals):null,(a.content?.metadata?.name||'').slice(0,40)];try{localStorage.setItem('ff-meta',JSON.stringify(meta))}catch(x){}}}catch(x){}}
    const name=(meta[mint]&&meta[mint][0])||short(mint);
    ttStatus(`Reading ${name}'s trades…`);
    const r=await topTraders(mint,key,+$('ttdepth').value,m=>ttStatus(m));
    TT.res={...r,traders:r.traders.slice(0,TT_DEPTH),total:r.traders.length,at:Date.now()};TT.mint=mint;TT.name=name; /* keeps the top 200 by profit; the list shows the first N that clear Min PnL */
    try{localStorage.setItem('tt-last',JSON.stringify({res:TT.res,mint,name}))}catch(x){}
    ttCredAdd(r.credits);
    ttStatus(`Done. ${r.txs.toLocaleString()} transactions read · about ${r.credits} Helius credits.`+(r.done?'':` Stopped at your limit, so traders after ${new Date(r.last*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} aren't counted.`));
    ttRender();
  }catch(err){ttStatus(err.message,true)}
  finally{TT.running=false;$('ttgo').disabled=false;$('ttkeep').hidden=true;if(TT.res)ttRender()}
  if(TT.res&&TT.mint===mint&&$('ttauto').checked)ttScoreLeft(true); // auto-score everyone the search found
});

/* ---------- several tokens at once: one merged list of every trader, tagged with how many of the tokens it traded ---------- */
async function ttMeta(mints,key){const meta=metaAll(),need=mints.filter(m=>!meta[m]);
  if(need.length){try{const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'m',method:'getAssetBatch',params:{ids:need}})});
    for(const a of (j.result||[])){if(!a||!a.id)continue;const ti=a.token_info||{};meta[a.id]=[(a.content?.metadata?.symbol||'').slice(0,24),ti.supply&&ti.decimals!=null?ti.supply/Math.pow(10,ti.decimals):null,(a.content?.metadata?.name||'').slice(0,40)]}
    lsPut('ff-meta',JSON.stringify(meta))}catch(x){}}
  return meta}
async function ttMulti(mints,key){
  mints=mints.slice(0,10);TT.autoLast=mints[0];TT.running=true;TT.stop=false;$('ttgo').disabled=true;$('ttkeep').hidden=MODE!=='popup';$('ttres').hidden=true;
  $('ttstop').hidden=false;$('ttstop').textContent='Stop';
  const by=new Map(),per=[];let txs=0,credits=0,allDone=true,last=0;
  try{const meta=await ttMeta(mints,key);
    for(let i=0;i<mints.length&&!TT.stop;i++){const m=mints[i],sym=(meta[m]&&meta[m][0])||short(m);
      ttStatus(`Token ${i+1} of ${mints.length} · ${sym}: reading trades…`);
      let r;try{r=await topTraders(m,key,+$('ttdepth').value,x=>ttStatus(`Token ${i+1} of ${mints.length} · ${sym}: ${x}`))}catch(err){if(/key/i.test(err.message))throw err;per.push({m,sym,err:err.message});continue}
      txs+=r.txs;credits+=r.credits||0;ttCredAdd(r.credits);if(!r.done){allDone=false;last=Math.max(last,r.last||0)}per.push({m,sym,n:r.traders.length});
      for(const w of r.traders){let x=by.get(w.addr);
        if(!x){x={addr:w.addr,bSol:0,sSol:0,qIn:0,qOut:0,nb:0,ns:0,realized:0,held:0,hits:[]};by.set(w.addr,x)}
        x.bSol+=w.bSol;x.sSol+=w.sSol;x.nb+=w.nb;x.ns+=w.ns;x.realized+=w.realized;x.held+=w.bSol*(1-(w.soldFrac??1));
        if(w.multi&&(!x.multi||w.multi.n>x.multi.n))x.multi=w.multi;x.hits.push({sym,roi:w.roi,pnl:w.realized,nb:w.nb})}}
    const tr=[...by.values()].map(x=>({...x,roi:x.bSol>0?x.realized/x.bSol:null,soldFrac:x.bSol>0?1-x.held/x.bSol:1,toks:mints.length}));
    // wallets that made money on more of the tokens first, then by total profit
    const won=x=>x.hits.filter(h=>h.pnl>0).length;tr.sort((a,b)=>won(b)-won(a)||b.hits.length-a.hits.length||b.realized-a.realized);
    const depth=Math.min(600,TT_DEPTH*Math.min(3,mints.length)),name=per.filter(p=>!p.err).map(p=>p.sym).join(' + ')||'tokens';
    TT.res={traders:tr.slice(0,depth),depth,total:tr.length,txs,done:allDone,last,at:Date.now(),multiTok:per};TT.mint=mints.join(',');TT.name=name;
    try{localStorage.setItem('tt-last',JSON.stringify({res:TT.res,mint:TT.mint,name}))}catch(x){}
    const bad=per.filter(p=>p.err);
    ttStatus(`${TT.stop?'Stopped. ':''}Done. ${per.length-bad.length} tokens · ${txs.toLocaleString()} transactions read · ${tr.length.toLocaleString()} traders · about ${credits.toLocaleString()} Helius credits.`+(bad.length?` Couldn't read: ${bad.map(p=>p.sym).join(', ')}.`:''));
  }catch(err){ttStatus(err.message,true)}
  finally{TT.running=false;$('ttgo').disabled=false;$('ttkeep').hidden=true;$('ttstop').hidden=true;if(TT.res)ttRender()}
  if(TT.res&&TT.mint===mints.join(',')&&$('ttauto').checked)ttScoreLeft(true);
}

/* ---------- list ---------- */
document.querySelector('#ttres .seg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;TT.sort=b.dataset.s;
  document.querySelectorAll('#ttres .seg button').forEach(x=>x.classList.toggle('on',x===b));ttRender()});
const scCol=n=>n>=100?'var(--amber)':n>=65?'var(--win)':n>=50?'var(--amber)':'var(--loss)';
/* the N traders to show: going down the profit ranking, the first N that clear Min PnL, looking at most TT_DEPTH deep */
const TT_DEPTH=200;
function ttView(R){
  const N=+$('ttn').value||25,m=ttMin(),out=[];let looked=0;
  const D=R.depth||TT_DEPTH;for(const w of R.traders){if(looked>=D)break;looked++;if(ttOk(w)){out.push({w,rank:looked});if(out.length>=N)break}}
  return {list:out,looked,N,m,end:looked>=Math.min(D,R.traders.length)};
}
$('ttn').addEventListener('change',()=>{if(TT.res)ttRender()});
function ttRender(){
  const R=TT.res;if(!R){$('ttres').hidden=true;return}$('ttres').hidden=typeof HD!=='undefined'&&HD.mode==='holders';
  const V=ttView(R);
  $('tthead').textContent=`Top ${V.list.length} traders · ${TT.name}`;
  $('ttsub').textContent=R.multiTok?`Across ${R.multiTok.filter(p=>!p.err).length} tokens, ${R.txs.toLocaleString()} trades${R.done?'':' (some histories cut at your limit)'}. ${R.total} wallets traded at least one. Wallets that made money on more of the tokens come first, then by total profit.`
    :`Ranked by realized profit in SOL, from ${R.txs.toLocaleString()} trades${R.done?'':' (history cut at your limit)'}. ${R.total} wallets made trades.`;
  ttRefreshStale(V.list.map(({w})=>w.addr));
  const m=V.m,rows=V.list.map(({w,rank})=>({w,i:rank-1,s:ttScoreGet(w.addr),ok:true}));
  if(TT.sort==='score')rows.sort((a,b)=>(b.ok-a.ok)||(((b.s&&b.s.score)??-1)-((a.s&&a.s.score)??-1)));
  $('ttlist').innerHTML=rows.map(({w,i,s,ok})=>{
    const sc=!s&&!ok?`<span class="sc na" title="Realized PnL on this token is below your Min PnL">below</span>`:!s?`<button type="button" class="scb" data-w="${esc(w.addr)}" title="Pull this wallet's recent trades and score it">Score</button>`
      :s.score==null?`<span class="sc na" title="${esc(s.why||'')}">n/a</span>`
      :`<span class="sc" data-open="${esc(w.addr)}" role="button" tabindex="0" style="color:${scCol(s.score)};background:color-mix(in srgb,${scCol(s.score)} 14%,transparent)" title="Open the full analysis · ${s.reliable?`Wins ${Math.round((s.win??s.score)*s.n/100)} of ${s.n} trades in its best filters`:`No filter with enough trades; ${s.n} trades overall`}${s.parts&&s.parts.length?` · win rate ${s.win}${s.parts.map(([v,l])=>` ${v>0?'+':'−'}${Math.abs(v)} ${l}`).join(',')}`:''}">${s.score}${s.reliable?'':'*'}</span>`;
    const tier=w.multi?' multi':s&&s.score!=null?(s.score>=100?' gold':s.score>=90?' great':''):'';
    const mw=w.multi?`<span class="mwt" title="Trades in the same block as ${w.multi.n-1} other wallet${w.multi.n>2?'s':''} on 60%+ of its buys and sells: ${w.multi.with.map(a=>short(a)).join(', ')}">Multi-Wallet ×${w.multi.n}</span>`:'';
    const won=w.hits?w.hits.filter(h=>h.pnl>0).length:0;
    const tk=w.hits?`<span class="tkt${won>=2?' rep':''}" title="${esc(w.hits.map(h=>`${h.sym}: ${sol(h.pnl)}${h.roi!=null?' ('+pct(h.roi)+')':''}`).join(' · '))}">${won} of ${w.toks} tokens</span>`:'';
    return `<div class="ttr${ok?'':' low'}${tier}" data-w="${esc(w.addr)}"><span class="rk">${i+1}</span>
      <div style="min-width:0"><a class="wa" href="https://gmgn.ai/sol/address/${encodeURIComponent(w.addr)}" target="_blank" rel="noopener" title="Open this wallet on GMGN">${esc(short(w.addr))} ↗</a>${mw}${tk}
        <div class="sub">bought ${w.bSol.toFixed(2)} · sold ${w.sSol.toFixed(2)} SOL · ${w.nb}/${w.ns} txs${w.soldFrac<0.95?` · holds ${Math.round((1-w.soldFrac)*100)}%`:''}${s&&s.score!=null?` · ${s.n} trades${s.hold!=null?' · hold '+fmtHold(s.hold):''}${s.buys7!=null?' · '+s.buys7+' buys/7d':''}`:''}</div></div>
      <div class="pnl ${cls(w.realized)}">${sol(w.realized)}<div class="sub">${w.roi!=null?pct(w.roi):''}</div></div>${sc}</div>`}).join('');
  const nw=V.list.filter(({w})=>!ttScoreGet(w.addr)).length,old=V.list.filter(({w})=>ttScoreGet(w.addr)&&ttStale(w.addr)).length,left=nw+old;
  {const rt=TT.running?[]:ttRsTodo(),b=$('ttrsall'),N=+$('ttrs').value||25;b.hidden=TT.running?!b.textContent.startsWith('Checking'):!rt.length;b.disabled=TT.running;
    if(!TT.running)b.textContent=`Check all spikes & round-trips · ${rt.length} wallet${rt.length===1?'':'s'}${+SET.rsmin?` (${+SET.rsmin}+)`:''} · ~${(rt.length*N*20).toLocaleString()} cr`}
  $('ttscore').hidden=TT.running?false:!left;$('ttscore').disabled=TT.running;
  const mb=ttMaxB(),crit=[m!=null?`${ttMinTxt(m)} or more`:null,mb!=null?`${mb} buy${mb>1?'s':''} or fewer`:null].filter(Boolean).join(', '),cut=m!=null||mb!=null;
  if(!TT.running)$('ttscore').textContent=left?`Score ${left} ${cut?`at ${crit}`:left===V.list.length?'(all)':'left'}${old?` (${old} to refresh with new trades)`:''} · about ${(nw*100+old*20).toLocaleString()} credits`:'All scored and up to date';
  $('ttsub').textContent+=cut?(V.list.length>=V.N?` Showing the first ${V.N} at ${crit} (checked the top ${V.looked}; skipped ${V.looked-V.list.length}).`:` Only ${V.list.length} match ${crit} in the top ${V.looked} traders${V.looked>=(R.depth||TT_DEPTH)?` (search stops at ${R.depth||TT_DEPTH})`:''}.`):'';
}
$('ttlist').addEventListener('click',e=>{const o=e.target.closest('[data-open]'),b=e.target.closest('.scb');
  if(o){const w=o.dataset.open;showView('wallet');$('addr').value=w;score(w,!!histIndex()[w])}
  if(b&&!TT.running)ttBatch([b.dataset.w])});
// a wallet needs (re)scoring when it has no score yet, or its saved trades are over 30 minutes old: the re-score fetches only the new trades
const TT_STALE=1800;
const ttStale=a=>{const p=(histIndex()[a]||{}).pulled;return !p||Date.now()/1000-p>TT_STALE};
const ttNeeds=a=>!ttScoreGet(a)||ttStale(a);
function ttScoreLeft(auto){if(TT.res&&!TT.running){const l=ttView(TT.res).list.map(({w})=>w).filter(w=>ttNeeds(w.addr)).map(w=>w.addr),rs=auto===true?$('ttautors').checked:true;
  // wallets scored in an earlier search were skipped here, so they never got the check: with "Include round-trips & spikes" on, check them too
  const after=()=>{if(auto===true&&rs&&!TT.stop&&ttRsTodo().length)ttRsAll()};
  if(l.length)ttBatch(l,{rs,auto:auto===true}).then(after);else after()}}
/* "Check spikes & round-trips": the check alone, on wallets already scored (at or above "only if score ≥") that haven't had it.
   Uses each wallet's saved trades, so only the check itself costs credits. */
function ttRsTodo(){if(!TT.res)return [];const min=+SET.rsmin||0;
  return ttView(TT.res).list.map(({w})=>w.addr).filter(a=>{const s=ttScoreGet(a);return s&&s.score!=null&&s.score>=min&&!s.rsc})}
async function ttRsAll(){if(TT.running)return;const key=getKey();if(!key){ttStatus('Add your Helius key in Settings first.',true);return}
  const list=ttRsTodo();if(!list.length)return;const N=+$('ttrs').value||25,o=opts();let credits=0,fatal=null,done=0;
  TT.running=true;TT.stop=false;$('ttstop').hidden=false;$('ttstop').textContent='Stop';TTC.run=0;TTC.running=true;ttCredShow();ttRender();
  for(let i=0;i<list.length&&!TT.stop;i++){const w=list[i];$('ttrsall').textContent=`Checking spikes & round-trips ${i+1} of ${list.length}`;
    try{let res=await pullWallet(w,key,21,()=>{},o.lastN,true,true); // saved trades: free
      if(!res.raw.length){res=await pullWallet(w,key,21,m=>ttStatus(`${short(w)}: ${m}`),o.lastN,false,true);credits+=res.credits||0;ttCredAdd(res.credits)}
      const rc=await rsCheck(res.raw,res.px,w,key,N,(d,n)=>ttStatus(`${short(w)}: checking round-trips & spikes ${d} of ${n}`));credits+=rc;ttCredAdd(rc);ttSaveScore(w,res,Date.now());done++;ttRender()}
    catch(err){if(/key|storage is full/i.test(err.message)){fatal=err;break}}}
  TT.running=false;$('ttstop').hidden=true;TTC.running=false;ttCredShow();
  ttStatus(fatal?fatal.message:`${TT.stop?'Stopped. ':''}Checked spikes & round-trips on ${done} wallet${done===1?'':'s'} · about ${credits.toLocaleString()} Helius credits.`,!!fatal);ttRender()}
$('ttrsall').addEventListener('click',ttRsAll);
for(const id of ['ttrs','ttrsmin'])$(id).addEventListener('input',()=>{if(id==='ttrsmin')rsMinSync($('ttrsmin').value);if(TT.res&&!TT.running)setTimeout(ttRender,0)});
try{$('ttautors').checked=localStorage.getItem('tt-autors')==='1'}catch(e){}
$('ttautors').addEventListener('change',()=>{try{localStorage.setItem('tt-autors',$('ttautors').checked?'1':'0')}catch(e){}});
$('ttscore').addEventListener('click',()=>ttScoreLeft(false));
$('ttstop').addEventListener('click',()=>{TT.stop=true;$('ttstop').textContent='Stopping…'});

// rsc: when the round-trip & spike check ran on this wallet (so "Check spikes & round-trips" knows what's left)
function ttSaveScore(w,res,rsc){const s=res.raw.length?scoreOf(res.raw,res.px,w,res.buys7,res.buys7est,res.ref||res.pulled,res.trades7):null;
  if(s&&rsc)s.rsc=rsc;else if(s){const old=ttScoreGet(w);if(old&&old.rsc)s.rsc=old.rsc}
  if(!lsPut(scoreKey(w),JSON.stringify(s||{score:null,why:receiverNote(res)||'No token buys found'})))throw new Error('Browser storage is full: the score could not be saved.');if(s){store.set('ws-score:'+w,String(s.score));gmPublishLite(w,s)}return s}
async function ttBatch(list,opt={}){
  const key=getKey();if(!key){ttStatus('Add your Helius key in Settings first.',true);return}
  TT.running=true;TT.stop=false;$('ttstop').hidden=false;$('ttstop').textContent='Stop';$('ttkeep').hidden=MODE!=='popup';
  let done=0,credits=0,next=0,fatal=null;const failed=[];const o=opts(),t0=Date.now(),rsN=opt.rs===false?0:(+$('ttrs').value||(opt.auto&&opt.rs?25:0)),pulled={};TTC.run=0;TTC.running=true;ttCredShow();
  const save=(w,res,rsc)=>ttSaveScore(w,res,rsc);
  const label=()=>{const per=done?(Date.now()-t0)/done:4000;$('ttscore').textContent=`Scoring ${Math.min(done+1,list.length)} of ${list.length} · about ${Math.max(1,Math.round((list.length-done)*per/1000/2))}s left`;$('ttscore').disabled=true};
  // pass 1: score every wallet, two at a time (fast: no round-trip checks yet)
  const worker=async()=>{while(!TT.stop&&!fatal&&next<list.length){const w=list[next++];label();
    const row=document.querySelector(`.ttr[data-w="${w}"]`);if(row)row.classList.add('busy');
    try{const known=!!histIndex()[w];
      const res=await pullWallet(w,key,21,m=>ttStatus(`${short(w)}: ${m}`),o.lastN,false,true);credits+=res.credits||0;ttCredAdd(res.credits);
      if(!known)ttMark(w,true);Object.assign(NAMES,res.names||{});const s=save(w,res);if(s&&rsN)pulled[w]={res,s};
    }catch(err){if(/key|storage is full/i.test(err.message)){fatal=err;break}if(!/reach|busy|internet/i.test(err.message)){try{localStorage.setItem(scoreKey(w),JSON.stringify({score:null,why:err.message}))}catch(x){}}else failed.push(w)} // connection problems: leave it unscored so it can be retried
    done++;ttRender()}};
  await Promise.all(Array.from({length:Math.min(2,list.length)},worker));
  // Helius was busy for some wallets (e.g. another check ran at the same time): try those again, one at a time, after a short pause
  let retryLeft=[...failed];
  if(failed.length&&!TT.stop&&!fatal){ttStatus(`Helius was busy for ${failed.length} wallet${failed.length>1?'s':''}: trying again…`);await sleep(4000);
    for(let i=0;i<failed.length&&!TT.stop&&!fatal;i++){const w=failed[i];$('ttscore').textContent=`Retrying ${i+1} of ${failed.length}`;
      try{const res=await pullWallet(w,key,21,m=>ttStatus(`${short(w)} (retry): ${m}`),o.lastN,false,true);credits+=res.credits||0;ttCredAdd(res.credits);
        if(!histIndex()[w])ttMark(w,true);Object.assign(NAMES,res.names||{});const s=save(w,res);if(s&&rsN)pulled[w]={res,s};retryLeft=retryLeft.filter(x=>x!==w);ttRender()}
      catch(err){if(/key|storage is full/i.test(err.message)){fatal=err;break}}}}
  // pass 2: round-trip & spike check only for wallets at or above "only if score ≥", best first; scores update as each finishes
  const min=+SET.rsmin||0,todo=Object.entries(pulled).filter(([w,x])=>x.s.score!=null&&x.s.score>=min).sort((a,b)=>b[1].s.score-a[1].s.score);
  for(let i=0;i<todo.length&&!TT.stop&&!fatal;i++){const [w,{res}]=todo[i];
    $('ttscore').textContent=`Round-trip & spike check ${i+1} of ${todo.length}`;
    try{const rc=await rsCheck(res.raw,res.px,w,key,rsN,(d,n)=>ttStatus(`${short(w)}: checking round-trips & spikes ${d} of ${n}`));credits+=rc;ttCredAdd(rc);save(w,res,Date.now());ttRender()}
    catch(err){if(/key/i.test(err.message)){fatal=err;break}}}
  if(fatal)ttStatus(fatal.message,true);
  TT.running=false;$('ttstop').hidden=true;$('ttkeep').hidden=true;
  TTC.running=false;ttCredShow();
  const okN=done-retryLeft.length;
  if(!fatal)ttStatus(`${TT.stop?'Stopped. ':''}Scored ${okN} wallet${okN===1?'':'s'}${retryLeft.length?` · ${retryLeft.length} couldn't be reached (Helius busy): press Score all again for those`:''}${todo.length?` · checked round-trips & spikes on ${todo.length}`:''} · about ${credits.toLocaleString()} Helius credits.`);
  ttRender();
}

/* ---------- token from the GMGN tab you're on ---------- */
async function ttCheckTab(){
  if(typeof chrome==='undefined'||!chrome.tabs)return;
  try{let tab;if(MODE==='win'){const w=await chrome.windows.getLastFocused({windowTypes:['normal']});[tab]=await chrome.tabs.query({active:true,windowId:w.id})}else [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const m=tab&&tab.url&&tab.url.match(/gmgn\.ai\/[a-z]+\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/),b=$('ttfromtab');
    if(m&&$('ttautotok').checked&&m[1]!==TT.autoLast&&!TT.running&&!(typeof HD!=='undefined'&&HD.running)){b.hidden=true;$('ttmint').value=m[1];$('ttform').requestSubmit();return} // auto-check the token just opened
    if(m&&m[1]!==TT.mint){b.hidden=false;b.dataset.m=m[1];b.innerHTML=`Use the token from this tab: <b>${esc(short(m[1]))}</b>`;if(!$('ttmint').value)$('ttmint').value=m[1]}else b.hidden=true}catch(e){}
}
/* ---------- tokens on screen on the GMGN Trenches page (gm.js shares them): scan the first X of a column ---------- */
const TTR={d:null};
function ttTrRender(){const b=$('tttrench'),d=TTR.d;if(!b)return;const fresh=d&&Date.now()-d.at<5*60e3,col=$('tttrcol').value,list=fresh&&d.cols&&d.cols[col]||[];
  b.hidden=!fresh||!Object.values(d.cols||{}).some(l=>l.length);if(b.hidden)return;
  const n=Math.max(1,Math.min(10,Math.floor(+$('tttrn').value)||5)),pick=list.slice(0,n),names={migrated:'Migrated',almost:'Almost bonded','new':'New'};
  $('tttrgo').disabled=!pick.length||TT.running;
  $('tttrgo').innerHTML=pick.length?`Scan ${pick.length} ${names[col]} token${pick.length>1?'s':''} from GMGN: <b>${pick.map(x=>esc(x.sym||short(x.m))).join(', ')}</b>`:`No ${names[col]} tokens on screen in GMGN Trenches`}
if(typeof chrome!=='undefined'&&chrome.storage&&chrome.storage.local&&chrome.runtime&&chrome.runtime.id){
  chrome.storage.local.get('gm:trenches',r=>{TTR.d=r&&r['gm:trenches']||null;ttTrRender()});
  chrome.storage.onChanged.addListener((ch,area)=>{if(area==='local'&&ch['gm:trenches']){TTR.d=ch['gm:trenches'].newValue||null;ttTrRender()}});
  setInterval(ttTrRender,30e3)}
for(const id of ['tttrn','tttrcol'])$(id).addEventListener('input',()=>{try{localStorage.setItem('tt-tr',JSON.stringify({n:$('tttrn').value,col:$('tttrcol').value}))}catch(e){}ttTrRender()});
try{const s=JSON.parse(localStorage.getItem('tt-tr')||'null');if(s){$('tttrn').value=s.n||5;$('tttrcol').value=s.col||'migrated'}}catch(e){}
$('tttrgo').addEventListener('click',()=>{const d=TTR.d;if(!d||TT.running)return;const col=$('tttrcol').value,n=Math.max(1,Math.min(10,Math.floor(+$('tttrn').value)||5)),pick=(d.cols[col]||[]).slice(0,n).map(x=>x.m);
  if(!pick.length)return;$('ttmint').value=pick.join(',');$('ttform').requestSubmit()});
$('ttfromtab').addEventListener('click',()=>{$('ttmint').value=$('ttfromtab').dataset.m;$('ttfromtab').hidden=true;$('ttform').requestSubmit()});
if(typeof chrome!=='undefined'&&chrome.tabs){chrome.tabs.onActivated.addListener(()=>{if(!$('vtt').hidden)ttCheckTab()});chrome.tabs.onUpdated.addListener((id,ch)=>{if(ch.url&&!$('vtt').hidden)ttCheckTab()})}

/* ---------- restore the last search ---------- */
try{const l=JSON.parse(localStorage.getItem('tt-last')||'null');if(l&&l.res){TT.res=l.res;TT.mint=l.mint;TT.name=l.name;$('ttmint').value=l.mint;ttRender()}}catch(e){}
{const v0=store.get('ws-view');if(v0&&v0!=='wallet'&&document.getElementById(v0==='tt'?'vtt':'v'+v0))showView(v0)}

ttCredShow();
