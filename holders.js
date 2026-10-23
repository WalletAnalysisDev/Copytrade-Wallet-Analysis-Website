/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* Holders: who holds the token right now, and what kind of wallets they are.
   1. current balances: Helius getTokenAccounts (every token account of the mint), grouped by owner
   2. pools and programs are set aside (their owner isn't an ordinary wallet)
   3. the token's history from launch (same reading as Top traders) tells how each holder got in:
      DEV (created it), Bundler (bought in the launch block), Sniper (bought in the first seconds),
      Insider (got tokens from the dev or a bundler/sniper by transfer), Phishing (received a transfer it never bought,
      from a wallet that sent to many), Transfer only, Multi-wallet (trades in the same blocks as another wallet), Suspicious
   4. optional deep check, ~10 credits per holder: each wallet's first transaction gives its age (Fresh wallet) and
      who funded it (Same funder groups; funded by the dev = Insider) */
const HD={mode:'tt',running:false,res:null,filter:'all'};
const HD_LABELS={dev:['DEV','devt'],bundler:['Bundler','hl-bad'],sniper:['Sniper','hl-warn'],insider:['Insider','hl-bad'],phish:['Phishing','hl-bad'],
  xfer:['Transfer only','hl-warn'],fresh:['Fresh wallet','hl-warn'],funder:['Same funder','hl-warn'],multi:['Multi-wallet','hl-multi'],sus:['Suspicious','hl-bad'],pool:['Pool / program','hl-dim']};
const HD_INFO={dev:'Created this token (signed its first transaction)',bundler:'Bought in the same block the token was created: usually the dev\'s own wallets',sniper:'Bought within the first seconds after launch',
  insider:'Got tokens from the dev or a bundler/sniper by transfer, or was funded by the dev',phish:'Received tokens it never bought, from a wallet that sent tokens to many others (fake holders / airdrop spam)',
  xfer:'Holds tokens it received by transfer and never bought',fresh:'Wallet\'s first transaction was less than a day before it bought this token',funder:'Funded by the same wallet as other holders: likely one person',
  multi:'Buys and sells in the same blocks as another wallet: likely one person with several wallets',sus:'Buys and sells in the same block, or trades this token an unusual number of times'};
try{HD.mode=localStorage.getItem('hd-mode')==='holders'?'holders':'tt'}catch(e){}
try{$('hdn').value=localStorage.getItem('hd-n')||'50';$('hddeep').checked=localStorage.getItem('hd-deep')!=='0'}catch(e){}
$('hdn').addEventListener('change',()=>{try{localStorage.setItem('hd-n',$('hdn').value)}catch(e){}});
$('hddeep').addEventListener('change',()=>{try{localStorage.setItem('hd-deep',$('hddeep').checked?'1':'0')}catch(e){}});
function hdMode(m){HD.mode=m;try{localStorage.setItem('hd-mode',m)}catch(e){}
  document.querySelectorAll('#ttmode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  $('ttopts-tt').hidden=m!=='tt';$('hdopts').hidden=m!=='holders';$('ttres').hidden=m!=='tt'||!TT.res;$('hdres').hidden=m!=='holders'||!HD.res;
  $('ttgo').textContent=m==='holders'?'Check':'Find'}
$('ttmode').addEventListener('click',e=>{const b=e.target.closest('button');if(b)hdMode(b.dataset.m)});

const hdCall=(method,params,key)=>getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});

/* the token's history from launch: per wallet how it got its tokens */
async function hdHistory(mint,key,maxPages,onp){
  const W=new Map(),seen=new Map();let token=null,pages=0,txs=0,done=false,c0=null;
  const get=o=>{let w=W.get(o);if(!w){w={addr:o,nb:0,ns:0,tin:0,tout:0,bSol:0,sSol:0,firstBuy:null,firstBuyTs:null,from:new Set(),to:new Set(),ev:[],sameBlock:0};W.set(o,w)}return w};
  while(pages<maxPages){
    const cfg={transactionDetails:'full',limit:100,sortOrder:'asc',encoding:'jsonParsed',maxSupportedTransactionVersion:1,filters:{status:'succeeded'}};if(token)cfg.paginationToken=token;
    const j=await hdCall('getTransactionsForAddress',[mint,cfg],key);if(j.error)throw new Error('Helius: '+j.error.message);
    const d=(j.result&&j.result.data)||[];pages++;txs+=d.length;
    for(const t of d){const m=t.meta,msg=t.transaction&&t.transaction.message;if(!m||!msg||m.err)continue;
      const keys=msg.accountKeys.map(k=>typeof k==='string'?k:k.pubkey);
      if(!c0)c0={slot:t.slot,ts:t.blockTime,creator:keys[0]};
      const tok={},ws={};
      for(const [arr,sg] of [[m.preTokenBalances,-1],[m.postTokenBalances,1]])for(const b of arr||[]){const a=sg*(+b.uiTokenAmount.amount)/Math.pow(10,b.uiTokenAmount.decimals);
        if(b.mint===mint)tok[b.owner]=(tok[b.owner]||0)+a;else if(b.mint===WSOL)ws[b.owner]=(ws[b.owner]||0)+a}
      const ins=[],outs=[],side={};
      for(const o in tok){const q=tok[o];if(Math.abs(q)<1e-9)continue;const i=keys.indexOf(o),sol=(i>=0?(m.postBalances[i]-m.preBalances[i])/1e9:0)+(ws[o]||0),w=get(o);
        seen.set(o,(seen.get(o)||0)+1);
        if(q>0){if(sol<-0.0005){w.nb++;w.bSol+=-sol;if(w.firstBuy==null){w.firstBuy=t.slot;w.firstBuyTs=t.blockTime}side[o]='b'}else{w.tin++;ins.push(o)}}
        else{if(sol>0.0005){w.ns++;w.sSol+=sol;side[o]=side[o]==='b'?'bs':'s'}else{w.tout++;outs.push(o)}}
        w.ev.push(t.slot+(q>0?'b':'s'))}
      for(const r of ins)for(const s of outs){get(r).from.add(s);get(s).to.add(r)} // a transfer: tokens left one wallet and arrived in another without a trade
    }
    onp&&onp(`Reading the token's history · ${txs.toLocaleString()} transactions`);
    token=j.result&&j.result.paginationToken;if(!token){done=true;break} // a short page isn't the end
  }
  // same block buy and sell by one wallet (sandwich / wash pattern)
  for(const w of W.values()){const b=new Set(w.ev.filter(e=>e.endsWith('b')).map(e=>e.slice(0,-1)));w.sameBlock=new Set(w.ev.filter(e=>e.endsWith('s')&&b.has(e.slice(0,-1)))).size}
  return {W,seen,c0,pages,txs,done};
}

/* first transactions of a wallet: its age and who funded it */
async function hdFunding(w,key){
  const j=await hdCall('getTransactionsForAddress',[w,{transactionDetails:'full',limit:5,sortOrder:'asc',encoding:'jsonParsed',maxSupportedTransactionVersion:1,filters:{status:'succeeded'}}],key);
  if(j.error)throw new Error('Helius: '+j.error.message);const d=(j.result&&j.result.data)||[];if(!d.length)return null;
  let funder=null;for(const t of d){const m=t.meta,keys=t.transaction.message.accountKeys.map(k=>typeof k==='string'?k:k.pubkey),i=keys.indexOf(w);
    if(i>=0&&m.postBalances[i]>m.preBalances[i]){let best=null;keys.forEach((k,x)=>{if(k===w)return;const dl=m.postBalances[x]-m.preBalances[x];if(dl<0&&(!best||dl<best.dl))best={k,dl}});if(best){funder=best.k;break}}}
  return {first:d[0].blockTime,funder};
}

async function hdRun(mint){
  const key=getKey();if(!key){ttStatus('Add your Helius key in Settings first.',true);return}
  HD.running=true;$('ttgo').disabled=true;let credits=0;const N=+$('hdn').value||50,deep=$('hddeep').checked;
  try{
    ttStatus('Looking up the token…');
    const a=await hdCall('getAsset',{id:mint},key);credits+=10;const ti=(a.result&&a.result.token_info)||{},md=(a.result&&a.result.content&&a.result.content.metadata)||{};
    const dec=ti.decimals??6,supply=ti.supply?ti.supply/Math.pow(10,dec):null,sym=md.symbol||short(mint);
    // 1. balances
    const bal=new Map();let page=1,accts=0;
    while(page<=10){ttStatus(`Reading holders · ${accts.toLocaleString()} token accounts`);
      const j=await hdCall('getTokenAccounts',{mint,page,limit:1000,options:{showZeroBalance:false}},key);credits+=10;if(j.error)throw new Error('Helius: '+j.error.message);
      const ta=(j.result&&j.result.token_accounts)||[];accts+=ta.length;for(const x of ta){const q=(+x.amount||0)/Math.pow(10,dec);if(q>0)bal.set(x.owner,(bal.get(x.owner)||0)+q)}
      if(ta.length<1000)break;page++}
    const total=supply||[...bal.values()].reduce((s,v)=>s+v,0),all=[...bal].sort((x,y)=>y[1]-x[1]);
    // 2. pools / programs among the biggest holders
    const top=all.slice(0,Math.max(N+20,60)),own={};
    for(let i=0;i<top.length;i+=100){const ids=top.slice(i,i+100).map(x=>x[0]);const j=await hdCall('getMultipleAccounts',[ids,{encoding:'base64',dataSlice:{offset:0,length:0}}],key);credits+=1;
      ((j.result&&j.result.value)||[]).forEach((v,k)=>{own[ids[k]]=!v||v.owner==='11111111111111111111111111111111'?'wallet':'program'})}
    // 3. history from launch
    const H=await hdHistory(mint,key,+$('ttdepth').value||50,m=>ttStatus(m));credits+=H.pages*10;
    const rows=[];let pools=0;
    for(const [o,q] of top){const isPool=own[o]==='program'||(typeof PLAT_AUTH!=='undefined'&&PLAT_AUTH[o]);if(isPool){pools+=q;continue}if(rows.length>=N)continue;
      rows.push({addr:o,q,pct:total?q/total:0,h:H.W.get(o)||null,labels:new Set()})}
    // 4. deep check: wallet age and funder
    if(deep){let i=0,done=0;const worker=async()=>{while(i<rows.length){const r=rows[i++];try{r.fund=await hdFunding(r.addr,key);credits+=10}catch(e){if(/key/i.test(e.message))throw e}done++;ttStatus(`Checking who funded each holder · ${done} of ${rows.length}`)}};
      await Promise.all([worker(),worker()])}
    // labels
    const c0=H.c0||{},early=new Set();
    for(const r of rows){const h=r.h;if(r.addr===c0.creator)r.labels.add('dev');if(!h)continue;
      if(h.firstBuy!=null&&h.firstBuy===c0.slot&&r.addr!==c0.creator){r.labels.add('bundler');early.add(r.addr)}
      else if(r.addr!==c0.creator&&h.firstBuyTs!=null&&c0.ts&&h.firstBuyTs-c0.ts<=15){r.labels.add('sniper');early.add(r.addr)}
      if(h.sameBlock>=2||h.nb+h.ns>=40)r.labels.add('sus')}
    for(const w of H.W.values())if(w.addr!==c0.creator&&w.firstBuy===c0.slot)early.add(w.addr);
    for(const r of rows){const h=r.h;if(!h)continue;
      const fromBad=[...h.from].some(s=>s===c0.creator||early.has(s));
      if(fromBad||(r.fund&&r.fund.funder===c0.creator))r.labels.add('insider');
      if(h.tin>0&&h.nb===0&&!r.labels.has('insider')&&!r.labels.has('dev')){const spam=[...h.from].some(s=>{const sw=H.W.get(s);return sw&&sw.to.size>=5});r.labels.add(spam?'phish':'xfer')}
      if(r.fund&&r.fund.first&&h.firstBuyTs&&h.firstBuyTs-r.fund.first<86400)r.labels.add('fresh')}
    // same funder groups
    const byF={};for(const r of rows)if(r.fund&&r.fund.funder&&r.fund.funder!==c0.creator)(byF[r.fund.funder]=byF[r.fund.funder]||[]).push(r);
    let g=0;for(const f in byF)if(byF[f].length>=2){g++;for(const r of byF[f]){r.labels.add('funder');r.group={n:g,size:byF[f].length,f}}}
    // multi-wallet: 60%+ of both wallets' buys and sells in the same blocks, same side (as in Top traders)
    const idx=new Map();for(const w of H.W.values()){if((H.seen.get(w.addr)||0)>=Math.max(40,H.txs*0.08))continue;for(const e of new Set(w.ev)){let x=idx.get(e);if(!x){x=[];idx.set(e,x)}x.push(w)}}
    for(const r of rows){if(!r.h)continue;const mine=new Set(r.h.ev),cnt=new Map();for(const e of mine)for(const o of idx.get(e)||[])if(o.addr!==r.addr)cnt.set(o,(cnt.get(o)||0)+1);
      const tw=[...cnt].filter(([o,c])=>c>=2&&c/Math.max(mine.size,new Set(o.ev).size)>=0.6).map(([o])=>o.addr);if(tw.length){r.labels.add('multi');r.multi={n:tw.length+1,with:tw.slice(0,8)}}}
    const auth=v=>ti.supply==null?null:!!v; // Helius leaves the field empty once the authority is revoked
    HD.res={mint,sym,at:Date.now(),total,holders:bal.size,pools,poolPct:total?pools/total:0,rows,c0,done:H.done,txs:H.txs,deep,
      mintAuth:auth(ti.mint_authority),freezeAuth:auth(ti.freeze_authority),credits};
    HD.filter='all';hdRender();hdHistAdd(HD.res);
    try{if(typeof ttCredAdd==='function')ttCredAdd(credits)}catch(e){}
    ttStatus(`Checked ${rows.length} holders of ${bal.size.toLocaleString()} · about ${credits.toLocaleString()} Helius credits.`+(H.done?'':' Only the token\'s first '+H.txs.toLocaleString()+' transactions were read, so later buyers have fewer labels.'));
  }catch(e){ttStatus(e.message,true)}
  finally{HD.running=false;$('ttgo').disabled=false}
}

/* red flags for the summary line (also saved with the check for History) */
function hdWarnings(R){const sum=k=>R.rows.filter(r=>r.labels.has(k)),top10=R.rows.slice(0,10).reduce((a,r)=>a+r.pct,0),groups=new Set(R.rows.filter(r=>r.group).map(r=>r.group.n)).size,w=[];
  if(R.mintAuth)w.push('the dev can still mint more tokens');if(R.freezeAuth)w.push('the dev can freeze wallets');
  if(top10>=0.5)w.push(`top 10 wallets hold ${pctS(top10)}`);if(sum('bundler').length)w.push(`${sum('bundler').length} bundler wallet${sum('bundler').length>1?'s':''} still hold`);
  if(sum('insider').length)w.push(`${sum('insider').length} insider wallet${sum('insider').length>1?'s':''}`);if(groups)w.push(`${groups} group${groups>1?'s':''} of holders share a funder`);
  if(sum('phish').length)w.push(`${sum('phish').length} holder${sum('phish').length>1?'s':''} look like fake airdrop wallets`);return w}
/* ---------- render ---------- */
const pctS=v=>v>=0.1?(v*100).toFixed(1)+'%':(v*100).toFixed(2)+'%';
function hdRender(){
  const R=HD.res;if(!R){$('hdres').hidden=true;return}$('hdres').hidden=HD.mode!=='holders';
  const sum=k=>R.rows.filter(r=>r.labels.has(k)),pctOf=a=>a.reduce((s,r)=>s+r.pct,0),top10=pctOf(R.rows.slice(0,10)),dev=pctOf(sum('dev'));
  const groups=new Set(R.rows.filter(r=>r.group).map(r=>r.group.n)).size;
  const tiles=[['Top 10 hold',pctS(top10),top10>=0.5?'neg':top10>=0.3?'amb':''],['Dev holds',pctS(dev),dev>=0.05?'neg':''],
    ['Bundlers',`${pctS(pctOf(sum('bundler')))} · ${sum('bundler').length}`,sum('bundler').length?'neg':''],['Snipers',`${pctS(pctOf(sum('sniper')))} · ${sum('sniper').length}`,pctOf(sum('sniper'))>=0.1?'amb':''],
    ['Insiders',`${pctS(pctOf(sum('insider')))} · ${sum('insider').length}`,sum('insider').length?'neg':''],
    ['Fresh wallets',R.deep?`${pctS(pctOf(sum('fresh')))} · ${sum('fresh').length}`:'off',pctOf(sum('fresh'))>=0.1?'amb':''],
    ['Same funder',R.deep?`${groups} group${groups===1?'':'s'}`:'off',groups?'amb':''],['Pools hold',pctS(R.poolPct),''],
    ['Mint authority',R.mintAuth==null?'unknown':R.mintAuth?'ACTIVE':'revoked',R.mintAuth?'neg':''],['Freeze authority',R.freezeAuth==null?'unknown':R.freezeAuth?'ACTIVE':'revoked',R.freezeAuth?'neg':'']];
  const warn=hdWarnings(R);
  const counts={};for(const r of R.rows)for(const l of r.labels)counts[l]=(counts[l]||0)+1;
  const chips=['all',...Object.keys(HD_LABELS).filter(k=>counts[k])].map(k=>`<button type="button" class="hdchip${HD.filter===k?' on':''}" data-f="${k}">${k==='all'?`All ${R.rows.length}`:`${HD_LABELS[k][0]} ${counts[k]}`}</button>`).join('');
  const list=HD.filter==='all'?R.rows:R.rows.filter(r=>r.labels.has(HD.filter));
  $('hdhead').textContent=`Holders · ${R.sym}`;
  $('hdsub').textContent=`${R.holders.toLocaleString()} holders · showing the top ${R.rows.length} wallets (pools left out)`;
  $('hdsum').innerHTML=tiles.map(([k,v,c])=>`<div class="hdt"><span class="k">${k}</span><b class="${c}">${v}</b></div>`).join('')+
    `<p class="tipline hdwarn ${warn.length?'bad':'ok'}">${warn.length?'<b>Watch out:</b> '+esc(warn.join(' · '))+'.':'No major red flags among the top holders.'}</p>`;
  $('hdchips').innerHTML=chips;
  $('hdlist').innerHTML=list.length?list.map(r=>{const i=R.rows.indexOf(r)+1,s=ttScoreGet(r.addr);
    const tags=[...r.labels].map(l=>`<span class="tag ${HD_LABELS[l][1]}" title="${esc(HD_INFO[l]||'')}">${HD_LABELS[l][0]}${l==='multi'&&r.multi?' ×'+r.multi.n:''}${l==='funder'&&r.group?' #'+r.group.n:''}</span>`).join('');
    const h=r.h,how=!h?'not in the history read':h.nb?`bought ${h.nb}× · ${h.bSol.toFixed(2)} SOL${h.ns?` · sold ${h.ns}×`:''}`:h.tin?'received by transfer':'—';
    return `<div class="hdr"><span class="rk">${i}</span>
      <div style="min-width:0"><a class="wa gm" href="https://gmgn.ai/sol/address/${encodeURIComponent(r.addr)}" target="_blank" rel="noopener">${esc(short(r.addr))} ↗</a>${tags}
        <div class="sub">${esc(how)}${r.fund&&r.fund.first?` · wallet from ${new Date(r.fund.first*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`:''}</div></div>
      <div class="hdp"><b>${pctS(r.pct)}</b><i style="--w:${Math.min(100,r.pct*100*4).toFixed(1)}%"></i></div>
      ${s&&s.score!=null?`<span class="sc" data-open="${esc(r.addr)}" role="button" tabindex="0" title="Open the full analysis" style="color:${scCol(s.score)};background:color-mix(in srgb,${scCol(s.score)} 14%,transparent)">${s.score}</span>`:'<span></span>'}</div>`}).join('')
    :'<p class="empty">No holders with this label.</p>';
}
$('hdchips').addEventListener('click',e=>{const b=e.target.closest('.hdchip');if(!b)return;HD.filter=b.dataset.f;hdRender()});
$('hdlist').addEventListener('click',e=>{const o=e.target.closest('[data-open]');if(!o)return;const w=o.dataset.open;showView('wallet');$('addr').value=w;score(w,!!histIndex()[w])});
hdMode(HD.mode);

/* ---------- saved Holders checks (History → Holders) ---------- */
function hdHistGet(){try{return JSON.parse(localStorage.getItem('hd-hist')||'[]')}catch(e){return []}}
// at most 20 saved checks and about 1 MB, so Holders history can't fill the browser storage that scores need
function hdHistSet(l){l=l.slice(0,20);let j=JSON.stringify(l);while(l.length>3&&j.length>1e6){l=l.slice(0,l.length-1);j=JSON.stringify(l)}
  try{localStorage.setItem('hd-hist',j)}catch(e){if(l.length>3)hdHistSet(l.slice(0,Math.ceil(l.length/2)))}}
function hdHistAdd(R){
  const sum=k=>R.rows.filter(r=>r.labels.has(k)),flags={};for(const k of Object.keys(HD_LABELS)){const n=sum(k).length;if(n)flags[k]=n}
  const top10=R.rows.slice(0,10).reduce((a,r)=>a+r.pct,0),warn=hdWarnings(R);
  const rec={mint:R.mint,sym:R.sym,at:R.at,holders:R.holders,top10,flags,warn,warnN:warn.length,
    res:{...R,rows:R.rows.map(r=>({addr:r.addr,q:r.q,pct:r.pct,labels:[...r.labels],h:r.h?{nb:r.h.nb,ns:r.h.ns,bSol:r.h.bSol,tin:r.h.tin}:null,fund:r.fund?{first:r.fund.first}:null,group:r.group||null,multi:r.multi?{n:r.multi.n}:null}))}};
  hdHistSet([rec,...hdHistGet().filter(c=>c.mint!==R.mint)].slice(0,25));
  try{hiRender()}catch(e){}
}
function hdOpenSaved(c){const R={...c.res,rows:c.res.rows.map(r=>({...r,labels:new Set(r.labels)}))};
  HD.res=R;HD.filter='all';showView('tt');hdMode('holders');$('ttmint').value=R.mint;hdRender();
  ttStatus(`Saved Holders check from ${ago(Math.floor(R.at/1000))} ago. Press Check to run it again with fresh data.`)}
