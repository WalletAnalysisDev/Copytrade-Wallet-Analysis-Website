/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* Analysis engine shared with the Copytrade Filter Finder page (same math, same Helius calls). */
const SOLS=new Set(['SOL','So11111111111111111111111111111111111111112']);
const STABLE=new Set(['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','Es9vMFrzaCERmJfrF4H2FYD4KCoNkY4FNULp9N7bEwh']);
/* a copy bot with "max buys per token" = K: it copies the wallet's first K buys on a token and sells the same share of its
   position whenever the wallet sells. ev = the wallet's buys (+1) and sells (−1) on the token, oldest first: [time, dir, SOL, tokens] */
function copyK(ev,K){let H=0,C=0,cost=0,proc=0,qIn=0,qOut=0,nb=0;
  for(const [ts,dir,sl,q] of ev){if(dir>0){nb++;H+=q;if(nb<=K){C+=q;cost+=sl;qIn+=q}}
    else if(H>0&&q>0){const f=Math.min(1,q/H),cq=C*f,px=sl/q;proc+=cq*px;qOut+=cq;C-=cq;H-=Math.min(q,H)}}
  return {cost,proc,qIn,qOut}}
const nBuys=ev=>ev?ev.filter(e=>e[1]>0).length:0;
function hydrate(raw,px,o){
  return raw.map(a=>{const mcap=a[4]*(a[16]||o.supply);
    // how much of the position has been closed: tokens sold or sent away, over tokens bought or received
    let qIn=(a[9]||0)+(a[24]||0),qOut=(a[10]||0)+(a[25]||0),cost=a[12],proc=a[13];
    const R=a[26]||null,EV=a[29]||null,K=o.maxRounds||0,cut=!!(K&&(EV?nBuys(EV)>K:R&&R.length>K));
    if(cut){if(EV){const c=copyK(EV,K);cost=c.cost;proc=c.proc;qIn=c.qIn;qOut=c.qOut} // a bot that copies only the wallet's first K buys on this token
      else{const r=R.slice(0,K);cost=r.reduce((x,y)=>x+y[1],0);proc=r.reduce((x,y)=>x+y[2],0);qIn=r.reduce((x,y)=>x+y[3],0);qOut=r.reduce((x,y)=>x+y[4],0)}} // older saves: first K round trips
    // never sold (any tokens that left were only sent to another wallet): nothing was realized, so it's treated as unsold
    const noSell=!(a[7]>0);if(noSell&&qOut>0){qOut=0;proc=0}
    const sold=qIn>0?Math.min(1,qOut/qIn):1;
    let part=sold>=0.95?1:sold; // profit counts only the part that was sold, against what that part cost
    // tokens still (partly) held: value what's left at today's price, so dead bags count as the losses they are
    let mtm=null;if(sold<0.95&&cost>0){const cp=cpxGet(),p=cp[a[0]],s=cp[WSOL];if(p&&p[0]!=null&&s&&s[0]>0){mtm=Math.max(0,qIn-qOut)*p[0]/s[0];part=1}}
    // a gain on tokens still held isn't a win yet (the wallet may never sell): today's price can only lower the result.
    // Never sold and up at today's price: counted as unsold (your "count never-sold tokens as losses" setting decides).
    // Partly sold: what's left counts at its cost, never more.
    if(mtm!=null){const rem=cost*(1-sold);if(mtm>rem){if(sold<0.02){mtm=null;part=sold}else mtm=rem}}
    const buySol=cost*part,buyUsd=a[2]*part*(a[12]?cost/a[12]:1),ret=buySol>0?(proc+(mtm||0))/buySol-1:0;
    return {tok:a[0],t:a[1],buyUsd,sellUsd:a[3]*(a[13]?proc/a[13]:1),buySol,sellSol:proc,firstSol:a[5],mcap,est:a[14]>0,sold,
      sellMc:a[10]>0?a[15]/a[10]*(a[16]||o.supply):null,
      pool:a[21]||null,solUsd:a[22]||null,pxIn:a[21]?a[4]:null,pxOut:a[21]&&a[10]>0&&a[15]?a[15]/a[10]:null,lastSell:a[8]||0,
      R,ev:EV,buys:EV?nBuys(EV):(a[6]||1),rounds:R?R.length:1,cut,pool0:a[27]||a[21]||null,platD:platGet()[a[27]||a[21]]||null,plat:platFam(platGet()[a[27]||a[21]])||null,nb:a[6],ns:a[7],tin:a[17]||0,tout:a[18]||0,hold:a[8]?(a[8]-a[1])/60:null,dump:a[28]?(a[28]-a[1])/60:null,last:a[11],ret,open:sold<0.02&&mtm==null,held:mtm!=null?{val:mtm,frac:1-sold}:null,
      route:STABLE.has(a[0])||mcap>5e6||(Math.abs(ret)<0.01&&a[6]>=2&&a[7]>=1)}});
}
/* most recent N tokens bought (by first buy time), after dropping swap-route tokens */
/* back from a break: when the wallet went gapD+ days without buying anything, only the tokens bought after that break count */
function gapCut(a,gapD){if(!gapD||a.length<2)return {keep:a,n:0,days:0};const s=a.slice().sort((x,y)=>y.t-x.t);
  for(let i=1;i<s.length;i++){const g=(s[i-1].t-s[i].t)/86400;if(g>=gapD)return {keep:s.slice(0,i),n:s.length-i,days:Math.round(g),at:s[i-1].t}}return {keep:a,n:0,days:0}}
function recent(trades,o){let a=trades.filter(t=>!(o.hide&&t.route)&&!(o.noDev&&t.dev)&&!(o.offPlat&&t.plat&&o.offPlat.includes(t.plat)));if(o.gapD)a=gapCut(a,o.gapD).keep;if(o.lastN&&a.length>o.lastN)a=a.slice().sort((x,y)=>y.t-x.t).slice(0,o.lastN);else if(o.days){const c=Date.now()/1000-o.days*86400;a=a.filter(t=>t.t>=c)}return a}
/* re-entries: how the wallet's 1st, 2nd, 3rd+ trade on the same token did, and what copying only the first K would make */
function roundStudy(list,o){ // what a copy bot makes with "max buys per token" = 1, 2, 3, 5 or no limit, on these trades
  const adj=x=>x.open?(o.openLoss?-1:null):(1+x.ret)/(1+o.slip)-1;
  const one=c=>{const sold=c.qIn>0?Math.min(1,c.qOut/c.qIn):1,part=sold>=0.95?1:sold,cc=c.cost*part;return {c:cc,ret:cc>0?c.proc/cc-1:0,open:sold<0.02}};
  const L=list.filter(t=>t.ev&&t.ev.length);let re=0;for(const t of L)if(t.buys>1)re++;
  const ks=[1,2,3,5,0].map(K=>{let pnl=0,n=0,w=0;
    for(const t of L){const x=one(copyK(t.ev,K||1e9)),rr=adj(x);if(rr==null)continue;n++;if(isWin(rr))w++;pnl+=rr*x.c}
    return {K,n,win:n?w/n:0,pnl}});
  // what each extra buy adds: the 1st buy alone, then the 2nd, then the 3rd and later ones
  const at=K=>ks.find(k=>k.K===K),by=[{n:L.length,pnl:at(1).pnl,win:at(1).win},{n:L.filter(t=>t.buys>=2).length,pnl:at(2).pnl-at(1).pnl},{n:L.filter(t=>t.buys>=3).length,pnl:at(0).pnl-at(2).pnl}];
  let best=ks[0];for(const k of ks)if(k.pnl>best.pnl+1e-6)best=k;
  const maxB=Math.max(1,...L.map(t=>t.buys||1));if(best.K&&best.K>=maxB)best=ks[ks.length-1]; // same as copying every buy
  return {by,re,ks,best,n:L.length};
}
/* QuickSells Low MC: sold within 5 seconds of buying, entry under $5K market cap. The wallet may book a profit,
   but a copy bot buys a block or two later at a higher price and can't sell that fast, so for the copier it's a loss. */
/* ---------- scoring rules: Automatic uses SC_DEF; Custom uses the numbers saved in Settings ('ws-scoring') ---------- */
const SC_DEF={perfectN:9,cap:99, few1:-25,few2:-15, winLow:35,winLowPts:-50,winMid:40,winMidPts:-20,
  actHi:500,actHiPts:-50,actMid:250,actMidPts:-25,buysLow:250,buysLowPts:3, holdShort:30,holdShortPts:-5,holdLong:60,holdMax:4,
  fastSec:10,fT1:10,fP1:-5,fT2:20,fP2:-10,fT3:35,fP3:-15,fT4:50,fP4:-20, flipSec:20,flipShare:50,flipPts:-40,
  g1:100,gP1:5,g2:300,gP2:10,g3:1000,gP3:15,gP4:20,redPts:-20,redLossPts:-30,allRedPts:-50,
  spikeRise:50,sMinChecked:4,sT1:50,sP1:-10,sT2:65,sP2:-15,sT3:80,sP3:-20,sMorePts:-5, rtPct:100,rtN1:2,rP1:3,rtN2:3,rP2:5,rtN3:5,rP3:8,
  qsSec:15,qsMc:5000,qsLoss:-20,qsAnySec:5, weakWin:35,
  allLow:25,allLowPts:-50,allMid:35,allMidPts:-30,allHi:40,allHiPts:-15,perfAll:40, recMinN:5,recLow:30,recLowPts:-30,recMid:45,recMidPts:-10,recNone:-15, shortSec:40,shortShare:50,shortCap:60, winMin:10,
  edgeN:10,edgeMin:2,edgeX1:3,edgePts1:10,edgeX2:5,edgeWinUp:10,edgePts2:20, winHi:50,winHiPts:15,winHiN:5, rescueN:5,rescueRed:-5,rescueAll:50, betN:5,betWin:10,betPnl:10,betRoi:10,betAvg:10,betPts:5,betMaxBuys:500,betAvgMin:100,betRoiMin:50, hiMc:75000,hiMcPts:-15, lowPnl:5,lowPnlPts:-10, provWin:40,provAvgW:100,provAvgL:41,provN:5};
const SC_RULES=['perfect','few','win','act','hold','fast','flip','p7','spike','rt','qs','weak','overall','form','short','winmin','edge','winhi','rescue','better','himc','lowpnl','prove'];
let SC_C=null;
function scSaved(){try{return JSON.parse(localStorage.getItem('ws-scoring')||'null')||{}}catch(e){return {}}}
function SC(){if(SC_C)return SC_C;const s=scSaved(),custom=s.mode==='custom',v={...SC_DEF,...(custom?s.v||{}:{})},on={};
  for(const r of SC_RULES)on[r]=custom?!(s.off||[]).includes(r):true;return SC_C={...v,on,custom}}
const scReset=()=>{SC_C=null};
/* a trade only counts as a win at +winMin% or more (default 10%); smaller gains are 'mid' trades and count as losses for the win rate (profit is unchanged) */
const isWin=r=>{if(r==null||r<=0)return false;const c=SC();return !c.on.winmin||r>=c.winMin/100};
try{addEventListener('storage',e=>{if(e.key==='ws-scoring')scReset()})}catch(e){}
function scVer(){const c=SC();return c.custom?'c'+JSON.stringify(c).split('').reduce((h,ch)=>(h*31+ch.charCodeAt(0))|0,7):'a'} // changes whenever the rules change, so saved scores get redone
/* QuickSells Low MC: sold within a few seconds of buying, entry at a low market cap. The wallet may book a profit,
   but a copy bot buys a block or two later at a higher price and can't sell that fast, so for the copier it's a loss. */
// timed to when half the first buy-in was sold, so a token dumped in 2s with a few small sells trickling out later still counts
// QuickSell: sold within qsSec after buying under qsMc market cap, or within qsAnySec (5s) at any market cap. A copier can't sell that fast
const isQSLow=t=>{const c=SC(),h=t.dump!=null?t.dump:t.hold;return c.on.qs&&!t.open&&h!=null&&h*60<c.qsSec&&t.mcap>0&&t.mcap<c.qsMc};
const isQS=t=>{if(isQSLow(t))return true;const c=SC(),h=t.dump!=null?t.dump:t.hold;return c.on.qs&&!t.open&&h!=null&&c.qsAnySec>0&&h*60<c.qsAnySec};
const qsLabel=t=>isQSLow(t)?'QuickSell Low MC':'QuickSell';
function adjRet(t,o){if(t.open)return o.openLoss?-1:null;const r=(1+t.ret)/(1+o.slip)-1;return o.qsLow!==false&&isQS(t)?Math.min(r,SC().qsLoss/100):r}
function summarize(list,o){let n=0,w=0,pnl=0,inv=0;for(const t of list){const r=adjRet(t,o);n++;if(isWin(r))w++;pnl+=r*t.buySol;inv+=t.buySol}
  return{n,win:n?w/n:0,pnl,inv,roi:inv?pnl/inv:0}}
const MC=[0,2e3,3e3,4e3,5e3,6e3,7e3,8e3,1e4,12e3,15e3,2e4,25e3,3e4,4e4,5e4,75e3,1e5,15e4,25e4,5e5,1e6,Infinity];
const SG=[0,0.1,0.25,0.4,0.5,0.6,0.75,0.9,1,1.1,1.25,1.5,2,3,5,Infinity];
function optimize(list,o){
  const T=list.map(t=>{const r=adjRet(t,o);return{m:t.mcap,s:t.firstSol,p:r*t.buySol,w:isWin(r)}});
  let best=null,robust=null;const wider=(x,y)=>(x.n>y.n)||(x.n===y.n&&(x.hi-x.lo)>(y.hi-y.lo));
  for(let a=0;a<MC.length;a++)for(let b=a+1;b<MC.length;b++){
    const sub=T.filter(t=>t.m>=MC[a]&&t.m<MC[b]);if(sub.length<o.minN)continue;
    for(let c=0;c<SG.length;c++)for(let d=c+1;d<SG.length;d++){
      let n=0,p=0,w=0,top=0;for(const t of sub){if(t.s>=SG[c]&&t.s<SG[d]){n++;p+=t.p;if(t.w)w++;if(t.p>top)top=t.p}}
      if(n<o.minN)continue;
      const cand={lo:MC[a],hi:MC[b],slo:SG[c],shi:SG[d],n,pnl:p,win:w/n,rob:p-top};
      cand.val=o.winWeight&&p>0?p*Math.pow(cand.win,o.winWeight):p; // winWeight: favour filters that win more often, not just the most total SOL
      if(!best||cand.val>best.val+1e-9||(Math.abs(cand.val-best.val)<1e-9&&wider(cand,best)))best=cand;
      if(!robust||cand.rob>robust.rob+1e-9||(Math.abs(cand.rob-robust.rob)<1e-9&&wider(cand,robust)))robust=cand;
    }}
  return{best,robust};
}
const inF=(t,f)=>f&&t.mcap>=f.lo&&t.mcap<f.hi&&t.firstSol>=f.slo&&t.firstSol<f.shi&&(f.alo==null||t.age==null||(t.age>=f.alo&&t.age<f.ahi)); // token age: unknown ages pass
const AG=[0,0.25,1,3,6,12,24,72,168,216,336,720,1080,1440,2160,4320,8760,Infinity]; // token age steps in hours: 15m … 1d, 3d, 7d, 9d, 14d, 30d, 45d, 60d, 90d, 180d, 1y
const fmAge=h=>h===Infinity?'No max':h<1?Math.round(h*60)+'m':h<48?(+h.toFixed(h<10?1:0))+'h':Math.round(h/24)+'d';

const WSOL='So11111111111111111111111111111111111111112';
const isAddr=v=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* ---------- several Helius keys ----------
   Every Helius call goes through getJSON. Credits are counted per key (estimated from the method called), and when a key
   hits its monthly limit (Helius answers 429 "max usage reached") or is rejected, the call moves to the next key. Each key's
   count starts over on its reset day (the day of the month its Helius plan renews). */
const HK_LIMIT=1e6,HK_COST={getTransactionsForAddress:10,getAssetBatch:10,getAsset:10,getMultipleAccounts:1};
const hkLoad=()=>{let l=null;try{l=JSON.parse(localStorage.getItem('ff-helius-keys')||'null')}catch(e){}
  if(!Array.isArray(l)||!l.length){l=[];let one='';try{one=(localStorage.getItem('ff-helius-key')||'').trim()}catch(e){}if(one)l.push({k:one,used:0,limit:HK_LIMIT,reset:new Date().getDate(),cyc:0})}
  for(const e of l){const c=hkCycle(e.reset||1);if(e.cyc!==c){e.cyc=c;e.used=0;e.out=null}}return l};
const hkSave=l=>{try{localStorage.setItem('ff-helius-keys',JSON.stringify(l));localStorage.setItem('ff-helius-key',(l.find(e=>!e.out)||l[0]||{}).k||'')}catch(e){}};
function hkCycle(day){const n=new Date(),d=Math.min(28,Math.max(1,day|0));let s=new Date(n.getFullYear(),n.getMonth(),d);if(s>n)s=new Date(n.getFullYear(),n.getMonth()-1,d);return s.getTime()}
function hkActive(){const l=hkLoad();const e=l.find(x=>!x.out);return e?e.k:''}
function hkMark(k,patch){const l=hkLoad(),e=l.find(x=>x.k===k);if(!e)return;Object.assign(e,patch);hkSave(l);try{if(typeof hkRender==='function')hkRender()}catch(x){}}
function hkCount(k,n){if(!n)return;const l=hkLoad(),e=l.find(x=>x.k===k);if(!e)return;e.used=(e.used||0)+n;if(e.used>=(e.limit||HK_LIMIT))e.out='limit';hkSave(l);hkTick()}
let hkT=0;function hkTick(){if(hkT)return;hkT=setTimeout(()=>{hkT=0;try{if(typeof hkRender==='function')hkRender()}catch(x){}},800)}
const hkCost=opt=>{try{const b=JSON.parse(opt.body);return (Array.isArray(b)?b:[b]).reduce((a,x)=>a+(HK_COST[x.method]||1),0)}catch(e){return 1}};
/* One shared lane for Helius: at most HMAX requests in flight across every tab of the panel (Top traders, Holders,
   Wallet, Automatic). Without it, a Holders check started during Top traders scoring floods the key, Helius answers
   "too many requests", and wallets come back unscored. */
const HMAX=3,HSEM={n:0,q:[]};
const hAcq=()=>HSEM.n<HMAX?(HSEM.n++,Promise.resolve()):new Promise(r=>HSEM.q.push(r));
const hRel=()=>{const r=HSEM.q.shift();if(r)r();else HSEM.n=Math.max(0,HSEM.n-1)};
/* Browser storage (localStorage) holds about 5 MB for the whole extension. When it's full, writes fail silently and
   scores never stick, so writes go through lsPut: on "quota exceeded" it frees rebuildable data and tries again. */
let LS_FULL=false;
const LS_CAP=5242880; // Chrome's limit: about 5.2 million characters (10 MB) per extension
const lsIsQuota=e=>/quota/i.test((e&&e.name||'')+' '+(e&&e.message||''));
function lsChars(){let n=0;try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);n+=k.length+(localStorage.getItem(k)||'').length}}catch(e){}return n}
// frees space step by step, cheapest-to-lose first, until usage is under `target` (share of the limit)
function lsFree(target=0.6){
  const rm=k=>{try{localStorage.removeItem(k)}catch(e){}},ok=()=>lsChars()<LS_CAP*target;
  rm('ff-curpx');rm('ms-log');try{cpxGet.c=null}catch(e){} // today's prices and the Automatic log: rebuilt on their own
  if(ok())return;
  try{const h=JSON.parse(localStorage.getItem('hd-hist')||'[]');if(h.length>5)localStorage.setItem('hd-hist',JSON.stringify(h.slice(0,5)))}catch(e){rm('hd-hist')} // newest Holders checks only
  if(ok())return;
  rm('tt-last');if(ok())return;
  // oldest spike & round-trip checks, a quarter at a time (they can be run again)
  for(let pass=0;pass<8&&!ok();pass++){const ks=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('ff-opp1:'))ks.push([k,+k.split(':')[2]||0])}
    if(!ks.length)break;ks.sort((a,b)=>a[1]-b[1]).slice(0,Math.max(1,Math.ceil(ks.length/4))).forEach(([k])=>rm(k))}
  if(ok())return;
  rm('ff-meta');rm('hd-hist');
}
function lsPut(k,v){try{localStorage.setItem(k,v);LS_FULL=false;return true}catch(e){if(!lsIsQuota(e))return false}
  if(!LS_AUTO){LS_FULL=true;return false}lsFree();try{localStorage.setItem(k,v);LS_FULL=false;return true}catch(e){LS_FULL=true;return false}}
async function getJSON(url,opt){
  let key=url.startsWith(RPC)?url.slice(RPC.length):null;const tried=new Set();
  const next=why=>{if(!key)return false;hkMark(key,why==='limit'?{out:why,used:HK_LIMIT}:{out:why});tried.add(key);const k=hkActive();if(!k||tried.has(k))return false;key=k;url=RPC+k;return true};
  for(let a=0;a<5;a++){let r;
    const lane=url.startsWith(RPC);if(lane)await hAcq();
    // a request that never answers would hold its lane forever and freeze everything behind it: give up after 30s and retry
    const ac=new AbortController(),to=setTimeout(()=>ac.abort(),30000);
    try{r=await fetch(url,{...opt,signal:ac.signal});clearTimeout(to)}catch(e){clearTimeout(to);if(lane)hRel();if(a===4)throw new Error('Could not reach '+new URL(url).host+'. Check your internet connection.');await sleep(1200*(a+1));continue}
    if(lane)hRel();
    if(r.status===401||r.status===403){if(next('rejected')){a--;continue}throw new Error(key?'Helius rejected your key'+(tried.size>1?'s':'')+'. Check them on your Helius dashboard.':'Helius rejected the key. Check it on your Helius dashboard and paste it again.')}
    if(r.status===429){let t='';try{t=await r.text()}catch(e){}
      if(key&&/max usage|credits? (limit|exhausted)|out of credits/i.test(t)){if(next('limit')){a--;continue}throw new Error('All your Helius keys have used up their monthly credits. Add another key in Settings.')}
      await sleep(1500*(a+1));continue}
    if(r.status>=500){await sleep(1500*(a+1));continue}
    if(key)hkCount(key,hkCost(opt));
    return r.json()}
  throw new Error('Helius is busy right now. Wait a minute and try again.');
}
/* Pull a wallet with Helius getTransactionsForAddress (10 credits per 100 transactions)
   and keep what was pulled in this browser, so the next pull only asks for new transactions. */
const RPC='https://mainnet.helius-rpc.com/?api-key=';
function parseTx(t,W){
  const msg=t.transaction&&t.transaction.message,m=t.meta;if(!msg||!m||m.err)return null;
  const keys=msg.accountKeys.map(k=>typeof k==='string'?k:k.pubkey);
  const i=keys.indexOf(W);
  let sol=i>=0?(m.postBalances[i]-m.preBalances[i])/1e9:0;
  const tok={},owner={};let usd=0; // usd: USDC/USDT the wallet paid or received (some wallets trade in stablecoins)
  const add=(arr,sg)=>{for(const b of arr||[]){owner[keys[b.accountIndex]]=[b.owner,b.mint];if(b.owner!==W)continue;
    const a=sg*(+b.uiTokenAmount.amount)/Math.pow(10,b.uiTokenAmount.decimals);
    if(b.mint===WSOL)sol+=a;else if(STABLE.has(b.mint))usd+=a;else tok[b.mint]=(tok[b.mint]||0)+a}};
  add(m.preTokenBalances,-1);add(m.postTokenBalances,1);
  for(const k in tok)if(Math.abs(tok[k])<1e-12)delete tok[k];
  // aggregator routes (SOL → USDC → TRUMP → the token) can pass through the wallet's own token accounts and leave a little
  // of the in-between token behind. That leftover isn't a purchase: drop tokens that came in and went out in this same
  // transaction with only a small remainder, so the SOL isn't split between the real token and the leftover.
  {const dec={};for(const b of [...(m.preTokenBalances||[]),...(m.postTokenBalances||[])])dec[b.mint]=b.uiTokenAmount.decimals;
    const own={};for(const b of [...(m.preTokenBalances||[]),...(m.postTokenBalances||[])])own[keys[b.accountIndex]]=[b.owner,b.mint];
    const gin={},gout={},ix0=(msg.instructions||[]).concat(...(m.innerInstructions||[]).map(x=>x.instructions||[]));
    for(const x of ix0){const p=x.parsed;if(!p||typeof p!=='object'||!p.info)continue;if(!(x.program==='spl-token'||x.program==='spl-token-2022'))continue;if(p.type!=='transfer'&&p.type!=='transferChecked')continue;
      const inf=p.info,s=own[inf.source]||[],d=own[inf.destination]||[],mint=inf.mint||s[1]||d[1];if(!mint||!tok[mint])continue;
      const v=inf.tokenAmount?+inf.tokenAmount.uiAmount:(+inf.amount)/Math.pow(10,dec[mint]??6);
      if(d[0]===W&&s[0]!==W)gin[mint]=(gin[mint]||0)+v;if((s[0]===W||inf.authority===W)&&d[0]!==W)gout[mint]=(gout[mint]||0)+v}
    if(Object.keys(tok).length>1)for(const k in tok){const a=gin[k]||0,b=gout[k]||0;if(a>0&&b>0&&Math.abs(tok[k])<0.1*Math.max(a,b))delete tok[k]}}
  if(!Object.keys(tok).length)return null;
  // the pool for each token: the other owner whose balance of that token moved the opposite way
  const pools={},dl={};
  const addD=(arr,sg)=>{for(const b of arr||[]){if(b.owner===W||!tok[b.mint])continue;const k=b.owner+'|'+b.mint;dl[k]=(dl[k]||0)+sg*(+b.uiTokenAmount.amount)/Math.pow(10,b.uiTokenAmount.decimals)}};
  addD(m.preTokenBalances,-1);addD(m.postTokenBalances,1);
  for(const k in dl){const [o,mint]=k.split('|');const q=tok[mint];if(dl[k]*q<0&&(!pools[mint]||Math.abs(dl[k])>pools[mint][1]))pools[mint]=[o,Math.abs(dl[k])]}
  for(const k in pools)pools[k]=pools[k][0];
  let mo=0,mi=0;const ownerOf=a=>owner[a]||[null,null];
  const ix=(msg.instructions||[]).concat(...(m.innerInstructions||[]).map(x=>x.instructions||[]));
  for(const x of ix){const p=x.parsed;if(!p||typeof p!=='object'||!p.info)continue;const inf=p.info; // token accounts opened and closed inside this transaction
    if(/^initializeAccount/.test(p.type)&&inf.account&&!owner[inf.account])owner[inf.account]=[inf.owner,inf.mint];
    else if((p.type==='create'||p.type==='createIdempotent')&&inf.account&&!owner[inf.account])owner[inf.account]=[inf.wallet,inf.mint]}
  for(const x of ix){const p=x.parsed;if(!p||typeof p!=='object')continue;const inf=p.info||{};
    if(x.program==='system'&&(p.type==='transfer'||p.type==='transferWithSeed')){
      const v=inf.lamports/1e9;if(inf.source===W&&inf.destination!==W)mo=Math.max(mo,v);if(inf.destination===W&&inf.source!==W)mi=Math.max(mi,v)}
    else if((x.program==='spl-token'||x.program==='spl-token-2022')&&(p.type==='transfer'||p.type==='transferChecked')){
      const s=ownerOf(inf.source),d=ownerOf(inf.destination);if((inf.mint||s[1]||d[1])!==WSOL)continue;
      const v=inf.tokenAmount?+inf.tokenAmount.uiAmount:+inf.amount/1e9;
      if((s[0]===W||inf.authority===W)&&d[0]!==W)mo=Math.max(mo,v);if(d[0]===W&&s[0]!==W)mi=Math.max(mi,v)}}
  return [(t.transaction.signatures||[''])[0].slice(0,20),t.blockTime,+sol.toFixed(9),tok,+mo.toFixed(9),+mi.toFixed(9),pools,null,+usd.toFixed(6)];
}
async function gtfa(W,key,blockTime,onp,stop,maxEmpty=60){
  const rows=[];let token=null,pages=0,txs=0,own=0,empty=0;
  while(pages<300){
    const cfg={transactionDetails:'full',limit:100,encoding:'jsonParsed',maxSupportedTransactionVersion:1,
      filters:{status:'succeeded',tokenAccounts:'balanceChanged',blockTime}};
    if(token)cfg.paginationToken=token;
    const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransactionsForAddress',params:[W,cfg]})});
    if(j.error)throw new Error('Helius: '+j.error.message);
    const d=(j.result&&j.result.data)||[];pages++;txs+=d.length;
    for(const t of d){const r=parseTx(t,W);if(r)rows.push(r);const k0=t.transaction&&t.transaction.message&&t.transaction.message.accountKeys&&t.transaction.message.accountKeys[0];if(k0&&(k0.pubkey||k0)===W)own++}
    if(d.length&&onp)onp(`${rows.length} trades, back to ${new Date(d[d.length-1].blockTime*1000).toLocaleDateString(undefined,{month:'short',day:'numeric'})}`);
    else if(!d.length&&onp&&pages>2)onp(`${rows.length} trades · skipping failed transactions (page ${pages})`);
    token=j.result&&j.result.paginationToken;
    // only a missing token means the end: a short or even empty page can come back while more exists (Helius drops failed
    // transactions after reading them, so a bot wallet with lots of failed sends returns pages with few or no trades)
    empty=d.length?0:empty+1;
    if(!token)return {rows,pages,txs,own,done:true};
    if(empty>=maxEmpty)return {rows,pages,txs,own,done:false}; // a long run of empty pages: stop rather than spend more credits
    if(stop&&stop(rows,pages,txs))return {rows,pages,txs,own,done:false};
  }
  return {rows,pages,txs,own,done:false};
}
const TRANSFER_SOL=0.003; // a token move with less SOL than this changing hands is a transfer, not a trade
function poolTxPrice(t,P,mint,solUsd){ // USD per token in one pool trade, from the pool's own balance changes
  const msg=t.transaction&&t.transaction.message,m=t.meta;if(!msg||!m||m.err)return null;
  const keys=msg.accountKeys.map(k=>typeof k==='string'?k:k.pubkey);const i=keys.indexOf(P);
  let sol=i>=0?(m.postBalances[i]-m.preBalances[i])/1e9:0,usd=0,q=0;
  const add=(arr,sg)=>{for(const b of arr||[]){if(b.owner!==P)continue;const a=sg*(+b.uiTokenAmount.amount)/Math.pow(10,b.uiTokenAmount.decimals);if(b.mint===WSOL)sol+=a;else if(STABLE.has(b.mint))usd+=a;else if(b.mint===mint)q+=a}};
  add(m.preTokenBalances,-1);add(m.postTokenBalances,1);
  const cash=sol*solUsd+usd;
  return q!==0&&cash!==0&&q*cash<0?Math.abs(cash/q):null;
}
const poolCall=(P,cfg,key)=>getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransactionsForAddress',params:[P,cfg]})});
async function poolPrice(P,mint,ts,key,solUsd){ // USD per token in the pool's last trade at or before ts
  const j=await poolCall(P,{transactionDetails:'full',limit:10,sortOrder:'desc',encoding:'jsonParsed',maxSupportedTransactionVersion:1,filters:{status:'succeeded',tokenAccounts:'balanceChanged',blockTime:{lte:ts}}},key);
  for(const t of (j.result&&j.result.data)||[]){const p=poolTxPrice(t,P,mint,solUsd);if(p)return p}
  return null;
}

/* ---------- who created each token ----------
   The signers of a token's very first transaction are its creator (dev). One Helius call per token, saved for good. */
let DEVC=null;
function devGet(){if(!DEVC){try{DEVC=JSON.parse(localStorage.getItem('ff-dev')||'{}')}catch(e){DEVC={}}}return DEVC}
function devSave(d){let cur={};try{cur=JSON.parse(localStorage.getItem('ff-dev')||'{}')}catch(e){}for(const k in d)if(!(k in cur)||String(d[k]).startsWith('2|'))cur[k]=d[k];DEVC=cur;lsPut('ff-dev',JSON.stringify(cur))} // merged: two pulls can run at once
// when each token was created (its first transaction's time), from the same lookup: token age at the wallet's buy
let AGEC=null;
function ageGet(){if(!AGEC){try{AGEC=JSON.parse(localStorage.getItem('ff-age')||'{}')}catch(e){AGEC={}}}return AGEC}
function ageSave(a){let cur={};try{cur=JSON.parse(localStorage.getItem('ff-age')||'{}')}catch(e){}Object.assign(cur,a);AGEC=cur;lsPut('ff-age',JSON.stringify(cur))}
const isDev=(tok,wallet)=>{if(!wallet)return false;const s=devGet()[tok];return !!s&&s.replace(/^2\|/,'').split(',').includes(wallet)};
async function devLookup(mints,key,onp){
  const d={...devGet()},ages={},ag=ageGet(),need=mints.filter(m=>!(m in d)||!String(d[m]).startsWith('2|')||!(m in ag));let i=0,pages=0; // '2|': looked up with the wider check below
  if(!need.length)return 0;onp&&onp(`Checking who created ${need.length} token${need.length>1?'s':''}`);
  const worker=async()=>{while(i<need.length){const m=need[i++];
    try{const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransactionsForAddress',params:[m,{transactionDetails:'full',limit:1,sortOrder:'asc',encoding:'jsonParsed',maxSupportedTransactionVersion:1}]})});
      pages++;const t=j.result&&j.result.data&&j.result.data[0];
      // the creator: whoever signed the token's first transaction, plus whoever received tokens in it (the dev buy), which
      // also catches launches sent through a relayer or launch app where the dev isn't the one paying for the transaction
      if(t&&t.blockTime)ages[m]=t.blockTime;
      if(t){const signers=t.transaction.message.accountKeys.map(k=>typeof k==='string'?{pubkey:k,signer:false}:k).filter(k=>k.signer&&k.pubkey!==m).map(k=>k.pubkey).slice(0,4);
        const pre={};for(const b of (t.meta&&t.meta.preTokenBalances)||[])if(b.mint===m)pre[b.owner]=+b.uiTokenAmount.amount;
        const buyers=((t.meta&&t.meta.postTokenBalances)||[]).filter(b=>b.mint===m&&b.owner&&+b.uiTokenAmount.amount>(pre[b.owner]||0)).map(b=>b.owner);
        d[m]='2|'+[...new Set([...signers,...buyers])].slice(0,8).join(',')}}
    catch(e){if(/key/i.test(e.message))throw e}}};
  await Promise.all([worker(),worker()]);devSave(d);if(Object.keys(ages).length)ageSave(ages);return pages;
}

/* ---------- which platform each token was bought on ----------
   The pool's account owner says which program it belongs to (one cheap call per 100 pools, saved for good). */
const PLAT_PROG={'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P':'Pump.fun','pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA':'PumpSwap',
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo':'Meteora DLMM','Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB':'Meteora DAMM','cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG':'Meteora DAMM v2','dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN':'Meteora DBC',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8':'Raydium AMM','CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C':'Raydium CPMM','CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK':'Raydium CLMM','LanMV9sAd7wArD4vJFVAK8pZ9u5vKLz4D9gjL7vjvvz':'Raydium LaunchLab',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc':'Orca','MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG':'Moonshot'};
const PLAT_AUTH={'5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1':'Raydium AMM','GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL':'Raydium CPMM','WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh':'Raydium LaunchLab',
  'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC':'Meteora DAMM v2','FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM':'Meteora DBC'}; // shared vault authorities (no account data of their own)
const platFam=l=>!l?null:l==='PumpSwap'||l==='Pump.fun'?l:l.split(' ')[0];
let PLATC=null;
function platGet(){if(!PLATC){try{PLATC=JSON.parse(localStorage.getItem('ff-plat')||'{}')}catch(e){PLATC={}}}return PLATC}
async function platLookup(pools,key){
  const d={...platGet()},need=[...new Set(pools.filter(p=>p&&!(p in d)))];let calls=0;
  for(let i=0;i<need.length;i+=100){const ids=need.slice(i,i+100);
    const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[ids,{encoding:'base64',dataSlice:{offset:0,length:0}}]})});calls++;
    ((j.result&&j.result.value)||[]).forEach((v,k)=>{const id=ids[k];d[id]=PLAT_AUTH[id]||(v&&PLAT_PROG[v.owner])||'Other'})}
  let cur={};try{cur=JSON.parse(localStorage.getItem('ff-plat')||'{}')}catch(e){}Object.assign(cur,d);PLATC=cur;lsPut('ff-plat',JSON.stringify(cur));return calls;
}

/* ---------- opportunity check ---------- */
const oppKey=t=>'ff-opp1:'+t.tok+':'+t.t+':'+(t.lastSell||0);
function oppGet(t){try{return JSON.parse(localStorage.getItem(oppKey(t))||'null')}catch(e){return null}}
function oppPut(t,v){lsPut(oppKey(t),JSON.stringify(v))}
async function poolTicks(P,mint,t0,t1,key,maxPages,solUsd){ // every pool trade between buy and last sell, oldest first
  let token=null,pages=0,hi=0,hiT=0,last=t0,more=false;
  while(pages<maxPages){
    const cfg={transactionDetails:'full',limit:100,sortOrder:'asc',encoding:'jsonParsed',maxSupportedTransactionVersion:1,filters:{status:'succeeded',tokenAccounts:'balanceChanged',blockTime:{gte:t0,lte:t1}}};
    if(token)cfg.paginationToken=token;
    const j=await poolCall(P,cfg,key);if(j.error)throw new Error('Helius: '+j.error.message);
    const d=(j.result&&j.result.data)||[];pages++;
    for(const t of d){const p=poolTxPrice(t,P,mint,solUsd);if(p&&p>hi){hi=p;hiT=t.blockTime}last=t.blockTime}
    token=j.result&&j.result.paginationToken;
    if(!token){more=false;break} // only a missing token is the end
    more=true;
  }
  return {hi,hiT,last,more,pages};
}
let gtNext=0,dsNext=0,gtChain=Promise.resolve();
/* today's price of tokens a wallet still holds (DexScreener, then GeckoTerminal; free, 30 tokens a call), kept 15 minutes */
const CPX_TTL=15*60e3;
function cpxGet(){if(cpxGet.c&&Date.now()-cpxGet.t<5000)return cpxGet.c;try{cpxGet.c=JSON.parse(localStorage.getItem('ff-curpx')||'{}')}catch(e){cpxGet.c={}}cpxGet.t=Date.now();return cpxGet.c}
async function curPrices(mints){
  const c=cpxGet(),now=Date.now(),need=[...new Set(mints)].filter(m=>!c[m]||now-c[m][1]>CPX_TTL);if(!need.length)return 0;
  if(!c[WSOL]||now-c[WSOL][1]>CPX_TTL)need.push(WSOL);let calls=0;const upd={};
  // DexScreener first (300 calls a minute, so batch scoring doesn't queue up), GeckoTerminal for any it doesn't list
  const miss=[];
  for(let i=0;i<need.length;i+=30){const ids=need.slice(i,i+30);let ok=false;
    for(let a=0;a<2&&!ok;a++){const wait=dsNext-Date.now();if(wait>0)await sleep(wait);dsNext=Date.now()+250;
      let r;try{r=await fetch('https://api.dexscreener.com/tokens/v1/solana/'+ids.join(','))}catch(e){await sleep(1000);continue}
      if(r.status===429){dsNext=Date.now()+5000;continue}if(!r.ok)break;ok=true;calls++;
      let arr=[];try{arr=await r.json()}catch(e){}if(!Array.isArray(arr))arr=(arr&&arr.pairs)||[];
      const best={};for(const p of arr){const m=p&&p.baseToken&&p.baseToken.address,u=p&&p.priceUsd!=null?+p.priceUsd:null,l=(p&&p.liquidity&&p.liquidity.usd)||0;
        if(!m||u==null||!isFinite(u)||!ids.includes(m))continue;if(!best[m]||l>best[m][1])best[m]=[u,l]}
      for(const m of ids){if(best[m])c[m]=upd[m]=[best[m][0],now];else miss.push(m)}}
    if(!ok)miss.push(...ids)}
  for(let i=0;i<miss.length;i+=30){const ids=miss.slice(i,i+30);
    for(let a=0;a<3;a++){const wait=gtNext-Date.now();if(wait>0)await sleep(wait);gtNext=Date.now()+2200;
      let r;try{r=await fetch('https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/'+ids.join(','))}catch(e){await sleep(2000);continue}
      if(r.status===429){gtNext=Date.now()+15000;continue}if(!r.ok)break;calls++;
      const j=await r.json(),got=new Set();for(const d of (j.data||[])){const at=d.attributes||{};if(!at.address)continue;got.add(at.address);c[at.address]=upd[at.address]=[at.price_usd!=null?+at.price_usd:null,now]}
      for(const m of ids)if(!got.has(m))c[m]=upd[m]=[null,now]; // not listed: left to the "never-sold" setting
      break}}
  let cur={};try{cur=JSON.parse(localStorage.getItem('ff-curpx')||'{}')}catch(e){}Object.assign(cur,upd); // another pull may have saved prices meanwhile: keep them
  for(const m in cur)if(now-cur[m][1]>3*864e5)delete cur[m];
  lsPut('ff-curpx',JSON.stringify(cur));cpxGet.c=null;return calls;
}
function gtCandles(pool,before){const p=gtChain.then(()=>gtCandlesOne(pool,before));gtChain=p.catch(()=>{});return p}
async function gtCandlesOne(pool,before){ // 1-minute candles, price in USD per token (GeckoTerminal free API, about 30 calls a minute)
  for(let a=0;a<4;a++){
    const wait=gtNext-Date.now();if(wait>0)await sleep(wait);gtNext=Date.now()+2200;
    let r;try{r=await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=1&limit=1000&currency=usd&token=base&before_timestamp=${before}`)}catch(e){await sleep(3000);continue}
    if(r.status===429){gtNext=Date.now()+20000;continue}
    if(!r.ok)return null;
    const j=await r.json();return (j.data&&j.data.attributes&&j.data.attributes.ohlcv_list)||null}
  return null;
}
function poolSide(x,P,mint,solUsd){ // one pool trade: price (USD per token), side, size, who paid the fee
  const msg=x.transaction&&x.transaction.message,m=x.meta;if(!msg||!m||m.err)return null;
  const keys=msg.accountKeys.map(k=>typeof k==='string'?k:k.pubkey);const i=keys.indexOf(P);
  let sol=i>=0?(m.postBalances[i]-m.preBalances[i])/1e9:0,usd=0,q=0;
  for(const [arr,sg] of [[m.preTokenBalances,-1],[m.postTokenBalances,1]])for(const b of arr||[]){if(b.owner!==P)continue;const a=sg*(+b.uiTokenAmount.amount)/Math.pow(10,b.uiTokenAmount.decimals);if(b.mint===WSOL)sol+=a;else if(STABLE.has(b.mint))usd+=a;else if(b.mint===mint)q+=a}
  const cash=sol+usd/solUsd;if(!q||!cash||q*cash>0)return null;
  return {slot:x.slot,idx:x.transactionIndex||0,ts:x.blockTime,payer:keys[0],keys,px:Math.abs(cash/q)*solUsd,buy:q<0,sol:Math.abs(cash)};
}
async function entrySpike(t,wallet,key){ // price just before the wallet's buy, in its block, one block later, and the best in 5s
  const j=await poolCall(t.pool,{transactionDetails:'full',limit:100,sortOrder:'asc',encoding:'jsonParsed',maxSupportedTransactionVersion:1,filters:{status:'succeeded',tokenAccounts:'balanceChanged',blockTime:{gte:t.t-30,lte:t.t+20}}},key);
  if(j.error)throw new Error('Helius: '+j.error.message);
  const sU=t.solUsd||150;
  const ev=((j.result&&j.result.data)||[]).map(x=>poolSide(x,t.pool,t.tok,sU)).filter(Boolean).sort((a,b)=>a.slot-b.slot||a.idx-b.idx);
  const me=ev.find(e=>e.buy&&e.keys.includes(wallet))||ev.filter(e=>e.buy&&Math.abs(e.ts-t.t)<=1).sort((a,b)=>Math.abs(a.px-t.pxIn)-Math.abs(b.px-t.pxIn))[0];
  if(!me)return {found:false};
  const before=ev.filter(e=>e.slot<me.slot||(e.slot===me.slot&&e.idx<me.idx)),pre=before.length?before[before.length-1].px:null;
  const same=ev.filter(e=>e.slot===me.slot&&e!==me&&e.buy&&e.payer!==me.payer);
  const after=ev.filter(e=>e.slot>me.slot),next=after.length?after[0].px:null;
  const win=after.filter(e=>e.ts<=me.ts+5),peak5=win.length?Math.max(...win.map(e=>e.px)):null;
  return {found:true,pre,me:me.px,next,peak5,same:new Set(same.map(e=>e.payer)).size,sameSol:+same.reduce((s,e)=>s+e.sol,0).toFixed(4),sameW:[...new Set(same.map(e=>e.payer))].slice(0,3)};
}
async function checkToken(t,key,wallet,lite){ // lite (batch scoring): at most 300 pool trades, 2h window for unsold tokens, no candle lookups
  const now=Math.floor(Date.now()/1000),sold=t.ns>0&&t.lastSell>=t.t;
  const t1=sold?t.lastSell:Math.min(now,t.t+(lite?7200:86400));
  const r=await poolTicks(t.pool,t.tok,t.t,t1,key,lite?3:10,t.solUsd||150);
  let peak=r.hi,peakT=r.hiT,src=r.more?'trades + candles':'every trade',after=null;
  const c=!lite&&(r.more||!r.hi)?await gtCandles(t.pool,sold?t1+3660:t1+60):null; // most holds are fully covered by Helius; batch scoring skips the slow candle lookups
  if(c){
    if(r.more||!r.hi){const from=Math.floor((r.hi?r.last:t.t)/60)*60;for(const k of c)if(k[0]>=from&&k[0]<=t1&&k[2]>peak){peak=k[2];peakT=k[0]}if(!r.hi)src='candles'}
    if(sold&&t.pxOut){let a=0;for(const k of c)if(k[0]>=Math.ceil(t1/60)*60&&k[0]<t1+3600)a=Math.max(a,k[2]);after=a?a/t.pxOut-1:null}
  }
  let spike=null,sc=0;if(wallet){try{spike=await entrySpike(t,wallet,key);sc=10}catch(e){if(/key/i.test(e.message))throw e}}
  return {peak:peak?peak/t.pxIn-1:null,peakT:peakT||null,after,src,spike,credits:r.pages*10+sc};
}
function tpSim(list,o,L){ // sell everything the first time the price reaches +L over your entry
  let pnl=0,hit=0;
  for(const t of list){const v=oppGet(t),r=adjRet(t,o);if(r==null)continue;let rr=r;
    if(v&&v.peak!=null&&v.peak>=(1+L)*(1+o.slip)-1){hit++;const x=t.pxOut?t.pxOut/t.pxIn-1:null;const fee=x!=null&&x>-1?Math.min(1,(1+t.ret)/(1+x)):0.97;rr=(1+L)*fee-1}
    pnl+=rr*t.buySol}
  return {pnl,hit};
}
const isBuyRow=(r,m)=>r[3][m]>0&&(r[2]<-0.0005||(r[8]||0)<-0.05||isSwapRow(r)); // spent SOL, stablecoins or another token on it
const isSellRow=(r,m)=>r[3][m]<0&&(r[2]>0.0005||(r[8]||0)>0.05||isSwapRow(r)); // got SOL, stablecoins or another token for it
const isTransferRow=r=>Object.keys(r[3]).length===1&&Math.abs(r[2])<TRANSFER_SOL&&Math.abs(r[8]||0)<0.5;
// token-for-token swap: one token out, another in, (almost) no SOL or stablecoin moving, e.g. paying for INU with KCK.
// Each side is valued in SOL from market prices (r[9]), otherwise the bought token looks almost free.
const isSwapRow=r=>{const e=Object.entries(r[3]);return e.length===2&&e[0][1]*e[1][1]<0&&Math.abs(r[2])<0.01&&Math.abs(r[8]||0)<0.5}; // < 0.01 SOL: fees, tips and account rent
const boughtSet=rows=>{const s=new Set();for(const r of rows)for(const m in r[3])if(isBuyRow(r,m))s.add(m);return s};
/* Saved wallet history lives in IndexedDB (hundreds of MB), with a small index for the History list. */
const idb=(()=>{let dbp=null;
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{try{const r=indexedDB.open('ff-history',1);r.onupgradeneeded=()=>r.result.createObjectStore('wallets');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}}));
  const run=async(mode,fn)=>{const db=await open();return new Promise((res,rej)=>{const t=db.transaction('wallets',mode),q=fn(t.objectStore('wallets'));t.oncomplete=()=>res(q&&'result' in q?q.result:undefined);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error)})};
  return {get:k=>run('readonly',s=>s.get(k)),put:(k,v)=>run('readwrite',s=>s.put(v,k)),del:k=>run('readwrite',s=>s.delete(k)),clear:()=>run('readwrite',s=>s.clear())}})();
function histIndex(){try{return JSON.parse(localStorage.getItem('ff-hist')||'{}')}catch(e){return {}}}
function histSave(ix){try{localStorage.setItem('ff-hist',JSON.stringify(ix))}catch(e){}}
async function cacheGet(W){
  try{const v=await idb.get(W);if(v)return v}catch(e){}
  try{const old=localStorage.getItem('ff-wallet3:'+W);if(old){const c=JSON.parse(old);await cachePut(W,c);return c}}catch(e){} // move older saves over
  return null;
}
async function cachePut(W,c){
  const ix=histIndex();ix[W]={pulled:c.pulled||ix[W]?.pulled||Math.floor(Date.now()/1000),tokens:boughtSet(c.tx).size,newest:c.newest||0};histSave(ix);
  try{await idb.put(W,c);try{localStorage.removeItem('ff-wallet3:'+W)}catch(e){}return}catch(e){}
  try{localStorage.setItem('ff-wallet3:'+W,JSON.stringify(c))}catch(e){} // fallback if IndexedDB is unavailable
}
async function migrateOld(){ // wallets pulled before history existed
  let keys=[];try{keys=Object.keys(localStorage).filter(k=>k.startsWith('ff-wallet3:'))}catch(e){}
  for(const k of keys){const W=k.slice(11);try{const c=JSON.parse(localStorage.getItem(k));if(c&&c.tx)await cachePut(W,c)}catch(e){}}
  try{Object.keys(localStorage).filter(k=>k.startsWith('ff-wallet:')||k.startsWith('ff-wallet2:')).forEach(k=>localStorage.removeItem(k))}catch(e){}
}
// wallets whose transactions are mostly sent by other wallets (tokens bought elsewhere and delivered here)
function receiverNote(res){if(res.ownShare==null||res.ownShare>=0.25)return '';
  return `This wallet rarely trades itself: only ${Math.round(res.ownShare*100)}% of its recent transactions were sent by it. Most are tokens other wallets bought and sent here, so a copy bot following it sees few or no buys.`+(res.raw.length&&res.wanted&&res.raw.length<res.wanted?` Found ${res.raw.length} of the ${res.wanted} tokens you asked for.`:'')}
/* ---------- spam bots: most of the wallet's transactions fail (snipers firing many sends per trade) ----------
   Helius leaves failed transactions out, so their trades can't be read fully, and a copy bot can't follow them anyway:
   they score 0. Checked with one request (its last 1,000 transactions), at most every 6 hours. */
const SPAM_FAIL=0.8;
function spamAll(){try{return JSON.parse(localStorage.getItem('ff-spam')||'{}')}catch(e){return {}}}
function spamOf(w){const v=spamAll()[w];return v&&v.share>=SPAM_FAIL?v:null}
const spamLab=v=>`spam bot: ${Math.round(v.share*100)}% of its last ${v.n.toLocaleString()} transactions failed, so its trades can't be read fully or copied`;
async function spamCheck(W,key){const m=spamAll(),old=m[W];if(old&&Date.now()/1000-old.at<6*3600)return old;
  const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'s',method:'getSignaturesForAddress',params:[W,{limit:1000}]})});
  const L=(j&&j.result)||[];if(L.length<200)return old||null; // too few transactions to judge
  const v={share:L.filter(s=>s.err).length/L.length,n:L.length,at:Math.floor(Date.now()/1000)};m[W]=v;
  const ks=Object.keys(m);if(ks.length>3000)ks.sort((a,b)=>m[a].at-m[b].at).slice(0,ks.length-3000).forEach(k=>delete m[k]);
  try{localStorage.setItem('ff-spam',JSON.stringify(m))}catch(e){}return v}
const MAX_AGE_D=31;
async function pullWallet(W,key,days,onp,lastN=0,offline=false,lite=false){ // lite: batch scoring, skips the DEV check and limits transfer lookups
  // only trades from the last MAX_AGE_D days are ever pulled or scored: a wallet back from a long break is judged on what
  // it does now, and nothing older costs credits or storage
  const now=Math.floor(Date.now()/1000),ageCut=now-MAX_AGE_D*86400,cutoff=Math.max(now-days*86400,ageCut);
  let c=await cacheGet(W);let pages=0,fresh=0,own=0,ownOf=0;
  if(offline&&!c)throw new Error('This wallet isn\'t in your history yet. Pull it first.');
  if(!c)c={tx:[],newest:0,oldest:now+1,complete:false};
  const merge=rows=>{const seen=new Set(c.tx.map(r=>r[0]));for(const r of rows)if(!seen.has(r[0])){c.tx.push(r);seen.add(r[0])}};
  // the spam-bot check runs alongside the trade pull (one quick request); if it finds a spam bot, paging stops early:
  // its score is 0 anyway, and its mostly-empty pages would only cost time and credits
  const SP={is:false},spamP=offline?null:spamCheck(W,key).then(v=>{SP.is=!!(v&&v.share>=SPAM_FAIL)}).catch(()=>{}),spamStop=()=>SP.is;
  const ME=lite?25:60; // batch scoring gives up sooner on long runs of empty pages
  if(!offline&&c.newest){ // only what happened since the last pull
    onp&&onp('Checking for new trades');
    const from=Math.max(c.newest-180,ageCut);
    const r=await gtfa(W,key,{gt:from},onp,spamStop,ME);pages+=r.pages;fresh+=r.txs;merge(r.rows);own+=r.own;ownOf+=r.txs; // small overlap: late-finalized trades
    // stopped before reaching the last pull (a bot wallet's long run of failed sends): remember the hole and fill it next time
    if(!r.done){const lo=r.rows.length?Math.min(...r.rows.map(x=>x[1])):now;c.hole={gt:Math.min(from,(c.hole&&c.hole.gt)||from),lt:Math.max(lo,(c.hole&&c.hole.lt)||0)}}
  }
  if(!offline&&c.hole){ // a hole left by an earlier pull that stopped early
    if(c.hole.lt<=ageCut)delete c.hole;
    else{onp&&onp('Filling in trades missed last time');
      const r=await gtfa(W,key,{gt:Math.max(c.hole.gt,ageCut),lt:c.hole.lt},onp,spamStop,ME);pages+=r.pages;fresh+=r.txs;merge(r.rows);own+=r.own;ownOf+=r.txs;
      if(r.done)delete c.hole;else if(r.rows.length)c.hole.lt=Math.min(...r.rows.map(x=>x[1]))}
  }
  if(!offline&&!c.complete){ // older history, only if the cache doesn't reach back far enough
    if(lastN){
      if(c.oldest>ageCut&&boughtSet(c.tx).size<lastN&&!(c.thinN&&c.thinV===2&&lastN<=c.thinN)){ // thinN: already searched back and found too few buys
        let extra=0;const have=boughtSet(c.tx);
        const r=await gtfa(W,key,{lt:c.oldest,gte:ageCut},onp,(rows,pg,got)=>{if(SP.is)return true;const s=new Set(have);for(const m of boughtSet(rows))s.add(m);
          if(s.size>=lastN)return extra++>=1;
          // stop paging: at most 3,000 transactions, or early when this wallet hardly buys anything itself. Counted in transactions
          // returned, not pages: a bot wallet's pages are mostly empty (its failed sends are left out), and those aren't the wallet trading
          const n=Math.max(1,got/100);return pg>=(lite?60:200)||n>=30||(n>=8&&s.size<Math.max(3,n*lastN/60));
        },ME);own+=r.own;ownOf+=r.txs;
        pages+=r.pages;fresh+=r.txs;merge(r.rows);
        c.oldest=r.rows.length?Math.min(c.oldest,...r.rows.map(x=>x[1])):c.oldest;if(r.done)c.oldest=Math.min(c.oldest,ageCut); // reached the 31-day limit
        else if(boughtSet(c.tx).size<lastN&&!SP.is){c.thinN=lastN;c.thinV=2}
      }
    }else if(cutoff<c.oldest){
      const r=await gtfa(W,key,{lt:c.oldest,gte:cutoff},onp);pages+=r.pages;fresh+=r.txs;merge(r.rows);
      c.oldest=cutoff;
    }
  }
  c.newest=c.tx.length?Math.max(...c.tx.map(r=>r[1])):c.newest;
  if(!offline)c.pulled=now;
  c.tx.sort((a,b)=>b[1]-a[1]);
  // drop saved trades older than the limit (plus a few days' margin): they're never used again
  {const keep=c.tx.filter(r=>r[1]>=ageCut-4*86400);if(keep.length<c.tx.length){c.tx=keep;c.oldest=Math.max(c.oldest,ageCut-4*86400);c.complete=false}}
  await cachePut(W,c);
  let use=c.tx.filter(r=>r[1]>=(lastN?ageCut:cutoff));
  // token names and supply, cached across wallets
  let meta={};try{meta=JSON.parse(localStorage.getItem('ff-meta')||'{}')}catch(e){}
  const need=[...new Set(use.flatMap(r=>Object.keys(r[3])))].filter(m=>!meta[m]||meta[m].length<3);
  // token names run at the same time as the SOL prices below (both are needed only at the end)
  const metaP=!(need.length&&!offline)?null:(async()=>{onp&&onp('Looking up token names');
    for(let i=0;i<need.length;i+=500){
      const jj=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'m',method:'getAssetBatch',params:{ids:need.slice(i,i+500)}})});
      pages+=1;for(const a of (jj.result||[])){if(!a)continue;const ti=a.token_info||{};meta[a.id]=[(a.content?.metadata?.symbol||ti.symbol||'').slice(0,24),ti.supply&&ti.decimals!=null?ti.supply/Math.pow(10,ti.decimals):null,(a.content?.metadata?.name||'').slice(0,40)]}}
    try{localStorage.setItem('ff-meta',JSON.stringify(meta))}catch(e){}})().catch(e=>{if(/key/i.test(e.message))throw e});
  onp&&onp('Getting SOL prices');
  let px=[];const first=use.length?Math.min(...use.map(r=>r[1])):0;
  // SOL's hourly prices are the same for every wallet: one shared copy, so batch scoring doesn't fetch them again per wallet
  {let g=null;try{g=JSON.parse(localStorage.getItem('ff-solpx')||'null')}catch(e){}
    if(Array.isArray(g)&&g.length&&g[0][0]<=first-3600&&(!c.px||!c.px.length||g[g.length-1][0]>c.px[c.px.length-1][0]))c.px=g}
  if(c.px&&c.px.length&&c.px[0][0]<=first-3600&&c.px[c.px.length-1][0]>=(offline?(c.newest||now)-7200:now-7200))px=c.px; // saved prices cover it
  else if(use.length){ // hourly SOL prices from the oldest trade up to now (1,000 hours per request). It used to stop after
    // 3 requests (~4 months), so wallets with older trades got stale SOL prices on recent ones and market caps came out too high
    let start=Math.max(first-7200,now-12000*3600)*1000;
    const keep=c.px&&c.px.length&&c.px[0][0]<=first-3600?c.px:null;if(keep){px=keep.slice();start=(keep[keep.length-1][0]+3600)*1000} // saved prices reach back far enough: only add the newer hours
    for(let k=0;k<13;k++){let kl=null;try{kl=await getJSON('https://api.binance.us/api/v3/klines?symbol=SOLUSDT&interval=1h&limit=1000&startTime='+start)}catch(e){}
      if(!Array.isArray(kl)||!kl.length)break;px=px.concat(kl.map(x=>[Math.floor(x[0]/1000),+x[4]]));if(kl.length<1000)break;start=kl[kl.length-1][0]+3600e3}
    if(px.length){c.px=px;await cachePut(W,c);
      try{let g=[];try{g=JSON.parse(localStorage.getItem('ff-solpx')||'[]')||[]}catch(e){}const join=g.length&&g[g.length-1][0]>=px[0][0]-3600&&g[0][0]<=px[0][0],mp=new Map(join?g:[]);for(const p of px)mp.set(p[0],p[1]); // only joined when the two have no gap between them
        const keep=[...mp].filter(p=>p[0]>=now-(MAX_AGE_D+5)*86400).sort((x,y)=>x[0]-y[0]);lsPut('ff-solpx',JSON.stringify(keep))}catch(e){}}
    else if(c.px)px=c.px}
  const pt=px.map(p=>p[0]);
  const solUsd=ts=>{if(!px.length)return 150;let lo=0,hi=pt.length-1;if(ts<pt[0])return px[0][1];while(lo<hi){const m=(lo+hi+1)>>1;if(pt[m]<=ts)lo=m;else hi=m-1}return px[lo][1]};
  const eff=r=>{const u=r[8]||0,p=solUsd(r[1]);return {sol:r[2]+u/p,mo:u<0?-u/p:r[4],mi:u>0?u/p:r[5]}}; // stablecoins as SOL at that hour's price
  // the tokens being analyzed: every token bought in the window, or the last N bought
  const firstBuy={};for(const r of use)for(const m in r[3])if(isBuyRow(r,m))firstBuy[m]=Math.min(firstBuy[m]||Infinity,r[1]);
  let analyzed=Object.keys(firstBuy).sort((x,y)=>firstBuy[y]-firstBuy[x]);if(lastN)analyzed=analyzed.slice(0,lastN);
  analyzed=new Set(analyzed);
  // saved (offline) opens run it in the background instead (panel.js), so they still open instantly
  if(!offline&&!lite&&key){try{pages+=await devLookup([...analyzed],key,onp)}catch(e){if(/key/i.test(e.message))throw e}}
  // tokens moved to or from another wallet are valued at the market price at that moment (as GMGN does)
  // each token's pool, from real trades only (on a transfer the other side is just the receiving wallet)
  const poolOf={};for(const r of c.tx){if(isTransferRow(r))continue;for(const m in (r[6]||{}))if(!poolOf[m])poolOf[m]=r[6][m]}
  const nearest=(r,m)=>{ // the wallet's own trade of this token closest in time: SOL per token
    let best=null;for(const x of c.tx){if(x===r||isTransferRow(x)||isSwapRow(x)||x[3][m]==null||Object.keys(x[3]).length!==1)continue;const e=eff(x),q=Math.abs(x[3][m]),v=x[3][m]>0?(e.mo&&e.mo>=-e.sol*0.8?e.mo:-e.sol):(e.mi&&e.mi>=e.sol*0.8?e.mi:e.sol);
      if(q>0&&v>0&&(!best||Math.abs(x[1]-r[1])<best[0]))best=[Math.abs(x[1]-r[1]),v/q]}
    return best?best[1]:0};
  const todo=use.filter(r=>isTransferRow(r)&&r[7]==null&&analyzed.has(Object.keys(r[3])[0]));
  // dust swaps: a few tokens bought or sold straight from the token's own pool for almost no SOL (some bots do hundreds).
  // They aren't transfers to another wallet, so they're priced from the wallet's own trades with no Helius call.
  for(const r of todo){const m=Object.keys(r[3])[0];if(r[6]&&poolOf[m]&&r[6][m]===poolOf[m])r[7]=nearest(r,m)}
  const look=todo.filter(r=>r[7]==null),LOOK_MAX=lite?20:150; // past 150 lookups, use the nearest own trade (saves credits on very busy wallets)
  if(look.length){let i=0,done=0;onp&&onp(`Pricing ${look.length} wallet-to-wallet transfer${look.length>1?'s':''}`);
    const worker=async()=>{while(i<look.length){const n=i++,r=look[n],m=Object.keys(r[3])[0];let p=null;
      if(poolOf[m]&&!offline&&n<LOOK_MAX){try{const u=await poolPrice(poolOf[m],m,r[1],key,solUsd(r[1]));pages+=1;if(u)p=u/solUsd(r[1])}catch(e){}}
      r[7]=p==null?nearest(r,m):p;done++;if(onp&&done%10===0)onp(`Pricing wallet-to-wallet transfers · ${done} of ${look.length}`)}};
    await Promise.all([worker(),worker()])} // 2 at a time: the free Helius plan's limit
  // token-for-token swaps: value what was paid at that token's price then (the wallet's own nearest trade, or the pool's price)
  const swaps=use.filter(r=>isSwapRow(r)&&r[9]==null&&Object.keys(r[3]).some(m=>analyzed.has(m)));
  for(const r of swaps){const [[a,qa],[b,qb]]=Object.entries(r[3]),[outM,outQ,inM,inQ]=qa<0?[a,-qa,b,qb]:[b,-qb,a,qa];
    let px=nearest(r,outM),v=px*outQ;
    if(!v&&poolOf[outM]&&!offline&&!lite){try{const u=await poolPrice(poolOf[outM],outM,r[1],key,solUsd(r[1]));pages+=1;if(u)v=u/solUsd(r[1])*outQ}catch(e){}}
    if(!v){px=nearest(r,inM);v=px*inQ}
    if(v>0)r[9]={[outM]:+v.toFixed(9),[inM]:-(+v.toFixed(9))}} // no price yet: tried again on the next pull
  // rows where several tokens were bought (or sold) together, e.g. an aggregator leftover saved before the fix above:
  // split the SOL by what each token was worth (the wallet's own nearest trades), instead of evenly
  const multi=use.filter(r=>{const e=Object.values(r[3]);return e.length>1&&r[9]==null&&!isSwapRow(r)&&Math.abs(r[2])>=TRANSFER_SOL&&e.every(q=>q*e[0]>0)&&Object.keys(r[3]).some(m=>analyzed.has(m))});
  for(const r of multi){const e=eff(r),tot=Math.abs(e.sol),sg=r[3][Object.keys(r[3])[0]]>0?-1:1,ms=Object.keys(r[3]);
    const est=ms.map(m=>{const p=nearest(r,m);return p>0?Math.abs(r[3][m])*p:null});
    const dust=ms.filter((m,i)=>est[i]!=null&&est[i]<tot*0.05),rest=ms.filter(m=>!dust.includes(m));
    if(dust.length&&rest.length){const left=Math.max(0,tot-dust.reduce((a,m)=>a+est[ms.indexOf(m)],0)),o={};
      for(const m of dust)o[m]=sg*est[ms.indexOf(m)];
      const kn=rest.map(m=>est[ms.indexOf(m)]),allK=kn.every(v=>v!=null),sum=allK?kn.reduce((a,v)=>a+v,0):0;
      rest.forEach((m,i)=>o[m]=sg*(allK&&sum>0?left*kn[i]/sum:left/rest.length));r[9]=o}
    else if(est.every(v=>v!=null)){const sum=est.reduce((a,v)=>a+v,0);if(sum>0){const o={};ms.forEach((m,i)=>o[m]=sg*tot*est[i]/sum);r[9]=o}}}
  if(todo.length||swaps.length||multi.some(r=>r[9]))await cachePut(W,c);
  if(metaP)await metaP;
  const out=convertPull(use.filter(r=>Object.keys(r[3]).some(m=>analyzed.has(m))&&!(isSwapRow(r)&&!r[9])).map(r=>{const e=eff(r);return [r[1],e.sol,r[3],e.mo,e.mi,r[6],r[7],r[9]]}),meta,px);
  // today's prices for tokens still held, and which platform each pool is on: both at once
  await Promise.all([curPrices(out.raw.filter(a=>{const qi=(a[9]||0)+(a[24]||0),qo=(a[10]||0)+(a[25]||0);return qi>0&&qo/qi<0.95}).map(a=>a[0])).catch(()=>{}),
    offline?null:platLookup(out.raw.map(r=>r[27]),key).catch(()=>{})]); // platforms: about 1 credit per 100 tokens
  // buys in the 7 days before the last pull (scaled up when the saved history covers less than 7 days)
  {const ref=c.pulled||now,wk=ref-7*86400;let b7=0,s7=0;for(const r of c.tx){if(r[1]<wk)continue;const ms=Object.keys(r[3]);if(ms.some(m=>isBuyRow(r,m)))b7++;else if(ms.some(m=>isSellRow(r,m)))s7++}
   const from=c.complete?wk:Math.max(wk,c.oldest||wk),span=ref-from;out.buys7est=span<7*86400-600;const k=out.buys7est?7*86400/Math.max(span,3600):1;out.buys7=Math.round(b7*k);out.trades7=Math.round((b7+s7)*k)} // trades7: buys + sells, like GMGN's 7D TXs
  out.ref=c.pulled||now; // the time the 7-day figures are measured back from
  if(spamP){await spamP;pages+=0.1} // about 1 credit
  out.credits=Math.round(pages*10);out.ownShare=ownOf>=50?own/ownOf:null;out.wanted=lastN;out.newTx=fresh;out.cachedTx=c.tx.length;out.oldest=c.oldest;out.complete=!!c.complete;out.pulled=c.pulled||now;
  return out;
}

function convertPull(tx,meta,px){
  const pt=px.map(p=>p[0]);const fallback=px.length?px[px.length-1][1]:150;
  const usd=ts=>{if(!px.length)return fallback;let lo=0,hi=pt.length-1;if(ts<pt[0])return px[0][1];while(lo<hi){const m=(lo+hi+1)>>1;if(pt[m]<=ts)lo=m;else hi=m-1}return px[lo][1]};
  const T={};
  for(const [ts,sol,tok,mo,mi,pools,tp,sw] of tx){ // sw: SOL value of each side of a token-for-token swap (+ received, − paid)
    const toks=Object.entries(tok),sh=1/toks.length,p=usd(ts);
    if(toks.length===1&&Math.abs(sol)<TRANSFER_SOL){ // moved to/from another wallet: value at market price
      const [m,q]=toks[0],t=T[m]||(T[m]={b:[],s:[],ti:[],to:[],last:0});const v=Math.abs(q)*(tp||0);
      (q>0?t.ti:t.to).push({t:ts,sol:v,usd:v*p,qty:Math.abs(q)});continue}
    for(const [m,q] of toks){
      const t=T[m]||(T[m]={b:[],s:[],ti:[],to:[],last:0});t.last=Math.max(t.last,ts);
      if(pools&&pools[m]&&!t.pool)t.pool=pools[m];
      const ov=sw&&sw[m]!=null?sw[m]:null;
      if(q>0){const cost=ov!=null?-ov:-sol*sh;if(cost<0.0005)continue; // tokens that arrived without spending SOL: airdrops, rewards
        if(pools&&pools[m]&&(!t.ep||ts<t.epT)){t.ep=pools[m];t.epT=ts} // the pool it bought from first: which platform it entered on
        // the swap amount: the biggest SOL transfer out (leaves out fees and tips), unless the swap was split over several
        // transfers or pools (then that biggest one is only part of it, and the entry would look far cheaper than it was)
        const size=ov!=null?cost:mo>0&&mo*sh>=cost*0.8?mo*sh:cost;t.b.push({t:ts,sol:cost,usd:cost*p,qty:q,size,pusd:size/q*p,p})}
      else{const got=ov!=null?ov:sol*sh,val=ov!=null?got:mi>0&&mi*sh>=got*0.8?mi*sh:got;t.s.push({t:ts,sol:got,usd:got*p,qty:-q,val:val*p,valSol:val})}
    }
  }
  const S=(a,k)=>a.reduce((s,x)=>s+x[k],0),rows=[],names={};
  for(const [m,t] of Object.entries(T)){
    if(!t.b.length)continue;t.b.sort((a,b)=>a.t-b.t);const fb=t.b[0],mt=meta[m]||['',null];
    if(mt[0])names[m]=mt[0];
    const ti=t.ti||[],to=t.to||[];
    // rounds: each time the wallet buys in, then sells (almost) everything, counts as one trade on this token
    const ev=[...t.b.map(x=>[x.t,1,x.sol,x.qty]),...ti.map(x=>[x.t,1,x.sol,x.qty]),...t.s.map(x=>[x.t,-1,x.sol,x.qty]),...to.map(x=>[x.t,-1,x.sol,x.qty])].sort((a,b)=>a[0]-b[0]||b[1]-a[1]);
    const R=[];let cur=null,held=0,peak=0,dumpT=0;const g=v=>+(+v).toPrecision(6);
    for(const [ts,dir,sl,q] of ev){
      if(dir>0){if(!cur){cur=[ts,0,0,0,0];R.push(cur)}cur[1]+=sl;cur[3]+=q;held+=q;peak=Math.max(peak,held)}
      else if(cur){cur[2]+=sl;cur[4]+=q;held-=q;if(!dumpT&&cur===R[0]&&cur[4]>=cur[3]*0.5)dumpT=ts;if(held<=peak*0.05){cur=null;held=0;peak=0}}}
    rows.push([m,fb.t,S(t.b,'usd')+S(ti,'usd'),S(t.s,'usd')+S(to,'usd'),fb.pusd,fb.size,t.b.length,t.s.length,t.s.length?Math.max(...t.s.map(x=>x.t)):0,
      S(t.b,'qty'),S(t.s,'qty'),t.last,S(t.b,'sol')+S(ti,'sol'),S(t.s,'sol')+S(to,'sol'),0,S(t.s,'val'),mt[1],ti.length,to.length,S(ti,'usd'),S(to,'usd'),
      t.pool||null,fb.p,S(t.s,'valSol'),S(ti,'qty'),S(to,'qty'),R.map(r=>r.map(g)),t.ep||t.pool||null,dumpT||0,ev.map(e=>[e[0],e[1],g(e[2]),g(e[3])])]);
  }
  const sorted=px.map(p=>p[1]).sort((a,b)=>a-b);
  return {raw:rows,names,px:sorted.length?sorted[sorted.length>>1]:fallback};
}
