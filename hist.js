/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* History tab, three views:
   - All: every wallet analyzed (Wallet tab, Top traders, Automatic) and every Holders check
   - Top traders: wallets scored from Top traders or Automatic
   - Holders: tokens checked in Holders, with their red flags; tap one to reopen the saved check (no credits) */
const HI={sort:'new',q:'',view:'all'};
try{const v=localStorage.getItem('hi-view');if(['all','tt','hd'].includes(v))HI.view=v}catch(e){}
function hiWallets(){
  const ix=histIndex(),tt=ttSet(),out=new Map();
  for(const w in ix)out.set(w,{kind:'w',w,at:ix[w].pulled||0,saved:true});
  for(const k of Object.keys(localStorage)){if(!k.startsWith('ws-tts:'))continue;const w=k.slice(7);if(!out.has(w))out.set(w,{kind:'w',w,at:0,saved:false})}
  for(const x of out.values()){const s=ttScoreGet(x.w),ws=store.get('ws-score:'+x.w);x.s=s;x.score=s&&s.score!=null?s.score:ws!=null&&ws!==''?+ws:null;x.tt=!!tt[x.w]||!x.saved;x.from=x.tt?'Top traders / Automatic':'Wallet tab'}
  return [...out.values()];
}
const hiChecks=()=>hdHistGet().map(c=>({kind:'h',...c,at:Math.floor((c.at||0)/1000)}));
function hiItems(view){const v=view||HI.view;return v==='hd'?hiChecks():v==='tt'?hiWallets().filter(x=>x.tt):[...hiWallets(),...hiChecks()]}
function hiRender(){
  if($('vhist').hidden)return;
  document.querySelectorAll('#hiview button').forEach(b=>b.classList.toggle('on',b.dataset.v===HI.view));
  const all=hiItems(),q=HI.q.trim().toLowerCase(),wallets=all.filter(x=>x.kind==='w'),checks=all.filter(x=>x.kind==='h');
  let list=q?all.filter(x=>x.kind==='w'?x.w.toLowerCase().includes(q):(x.mint.toLowerCase().includes(q)||(x.sym||'').toLowerCase().includes(q))):all;
  const scoreOfX=x=>x.kind==='w'?(x.score??-1):-1-(x.warnN||0); // in Score order, holder checks sort by fewest red flags
  list.sort(HI.sort==='score'?(a,b)=>scoreOfX(b)-scoreOfX(a)||(b.at-a.at):(a,b)=>(b.at-a.at)||(scoreOfX(b)-scoreOfX(a)));
  const n90=wallets.filter(x=>x.score!=null&&x.score>=90).length;
  const parts=[];if(HI.view!=='hd')parts.push(`${wallets.length} wallet${wallets.length===1?'':'s'}${n90?` · ${n90} scored 90+`:''}`);if(HI.view!=='tt')parts.push(`${checks.length} holder check${checks.length===1?'':'s'}`);
  $('hisub').textContent=all.length?parts.join(' · '):'';
  $('hiclear').hidden=!all.length;$('hiclear').textContent=HI.view==='all'?'Clear history':HI.view==='tt'?'Clear Top traders history':'Clear Holders history';$('hicopy').hidden=!n90;
  $('hiq').placeholder=HI.view==='hd'?'Search a token or symbol':HI.view==='tt'?'Search an address':'Search an address or token';
  const empty={all:'Nothing analyzed yet. Wallets you score and tokens you check in Holders show up here.',tt:'No wallets scored from Top traders or Automatic yet.',hd:'No Holders checks yet. Run one from Top traders → Holders.'}[HI.view];
  $('hilist').innerHTML=list.length?list.map(x=>x.kind==='w'?hiWalletRow(x):hiCheckRow(x)).join(''):`<p class="empty">${all.length?'Nothing matches that search.':empty}</p>`;
}
function hiWalletRow(x){const s=x.s,sc=x.score;
  const badge=sc!=null?`<span class="sc" style="color:${scCol(sc)};background:color-mix(in srgb,${scCol(sc)} 14%,transparent)">${sc}</span>`:'<span class="sc na">–</span>';
  const meta=[x.at?ago(x.at)+' ago':'',s&&s.n?`${s.n} trades in filters · ${Math.round((s.win??0))}% win`:'',HI.view==='all'?x.from:''].filter(Boolean).join(' · ');
  return `<div class="hir${sc!=null&&sc>=100?' gold':sc!=null&&sc>=90?' great':''}" data-w="${esc(x.w)}">
    <button type="button" class="hiopen" title="${x.saved?'Open the full analysis (saved: no Helius credits)':'Open: pulls the wallet again'}"><span class="wa">${esc(short(x.w))}</span><span class="sub">${esc(meta)}</span></button>
    <a class="gm hig" href="https://gmgn.ai/sol/address/${encodeURIComponent(x.w)}" target="_blank" rel="noopener" title="Open on GMGN">↗</a>
    ${badge}<button type="button" class="icon hix" title="Remove from history" aria-label="Remove ${esc(short(x.w))}">×</button></div>`}
function hiCheckRow(x){const f=x.flags||{},chips=[['bundler','Bundlers'],['insider','Insiders'],['sniper','Snipers'],['phish','Phishing'],['funder','Same funder'],['multi','Multi-wallet']].filter(([k])=>f[k]).map(([k,l])=>`<span class="tag ${HD_LABELS[k][1]}">${l} ${f[k]}</span>`).join('');
  const risk=x.warnN?`<span class="sc hirisk bad" title="${esc((x.warn||[]).join(' · '))}">${x.warnN}⚠</span>`:'<span class="sc hirisk ok" title="No major red flags">OK</span>';
  return `<div class="hir hic" data-m="${esc(x.mint)}" data-at="${x.at}">
    <button type="button" class="hiopen" title="Open this Holders check again (saved: no Helius credits)"><span class="wa"><span class="hitag">Holders</span>${esc(x.sym||short(x.mint))}</span>
      <span class="sub">${esc([ago(x.at)+' ago',`${(x.holders||0).toLocaleString()} holders`,`top 10 ${pctS(x.top10||0)}`].join(' · '))}</span>${chips?`<span class="hichips">${chips}</span>`:''}</button>
    <a class="gm hig" href="https://gmgn.ai/sol/token/${encodeURIComponent(x.mint)}" target="_blank" rel="noopener" title="Open the token on GMGN">↗</a>
    ${risk}<button type="button" class="icon hix" title="Remove from history" aria-label="Remove this check">×</button></div>`}
async function hiForget(w){const ix=histIndex();delete ix[w];histSave(ix);store.del('ws-score:'+w);try{localStorage.removeItem('ws-tts:'+w)}catch(e){}ttMark(w,false);
  try{await idb.del(w)}catch(e){}try{await hubForget(w)}catch(e){}}
$('hilist').addEventListener('click',async e=>{const row=e.target.closest('.hir');if(!row)return;
  if(row.dataset.m){const at=+row.dataset.at;
    if(e.target.closest('.hix')){hdHistSet(hdHistGet().filter(c=>!(c.mint===row.dataset.m&&Math.floor(c.at/1000)===at)));hiRender();return}
    if(e.target.closest('.hiopen')){const c=hdHistGet().find(c=>c.mint===row.dataset.m&&Math.floor(c.at/1000)===at);if(c)hdOpenSaved(c)}return}
  const w=row.dataset.w;
  if(e.target.closest('.hix')){await hiForget(w);hiRender();renderHist();return}
  if(e.target.closest('.hiopen')){showView('wallet');$('addr').value=w;score(w,!!histIndex()[w])}});
$('hiview').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;HI.view=b.dataset.v;try{localStorage.setItem('hi-view',HI.view)}catch(x){}hiRender()});
$('hiq').addEventListener('input',()=>{HI.q=$('hiq').value;hiRender()});
document.querySelector('#vhist .ctitle .seg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;HI.sort=b.dataset.s;
  document.querySelectorAll('#vhist .ctitle .seg button').forEach(x=>x.classList.toggle('on',x===b));hiRender()});
$('hicopy').addEventListener('click',()=>{const t=hiItems().filter(x=>x.kind==='w'&&x.score!=null&&x.score>=90).map(x=>x.w).join('\n');if(navigator.clipboard)navigator.clipboard.writeText(t).catch(()=>{});
  const b=$('hicopy'),o=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=o,1200)});
$('hiclear').addEventListener('click',async()=>{const b=$('hiclear');
  if(b.dataset.armed!=='1'){b.dataset.armed='1';b.textContent='Click again to clear';setTimeout(()=>{b.dataset.armed='';hiRender()},4000);return}
  b.dataset.armed='';const v=HI.view;
  if(v==='hd'||v==='all')hdHistSet([]);
  if(v==='tt'){for(const x of hiWallets().filter(x=>x.tt))await hiForget(x.w)}
  if(v==='all'){try{Object.keys(localStorage).filter(k=>k==='ff-hist'||k.startsWith('ws-score:')||k==='ws-tt'||k.startsWith('ws-tts:')).forEach(k=>localStorage.removeItem(k))}catch(e){}
    try{await idb.clear()}catch(e){}try{await hubClear()}catch(e){}}
  renderHist();hiRender();try{if(TT.res)ttRender()}catch(e){}try{msRender()}catch(e){}});
// the Protector tab was removed: drop what it saved
try{Object.keys(localStorage).filter(k=>k.startsWith('wp-')).forEach(k=>localStorage.removeItem(k))}catch(e){}
hiRender(); // in case History was the tab open last time
