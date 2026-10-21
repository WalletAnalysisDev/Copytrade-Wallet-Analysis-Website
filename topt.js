/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* Top traders of a token, worked out from the token's own transactions on Helius (like GMGN's Top Traders tab).
   Every swap on Pump.fun, PumpSwap, Meteora, Raydium CPMM/LaunchLab touches the token's mint account, so paging the
   mint's history from launch gives every trade. Raydium's oldest AMM (v4) doesn't, so its trades can be missing. */
async function topTraders(mint,key,maxPages,onp){
  const W=new Map(),seen=new Map();let token=null,pages=0,txs=0,first=0,last=0,done=false,fees=0;
  const SYS='11111111111111111111111111111111';
  while(pages<maxPages){
    const cfg={transactionDetails:'full',limit:100,sortOrder:'asc',encoding:'jsonParsed',maxSupportedTransactionVersion:1,filters:{status:'succeeded'}};
    if(token)cfg.paginationToken=token;
    const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getTransactionsForAddress',params:[mint,cfg]})});
    if(j.error)throw new Error('Helius: '+j.error.message);
    const d=(j.result&&j.result.data)||[];pages++;txs+=d.length;
    for(const t of d){
      const m=t.meta,msg=t.transaction&&t.transaction.message;if(!m||!msg||m.err)continue;
      if(!first)first=t.blockTime;last=t.blockTime;fees+=(m.fee||0)/1e9; // network + priority fees paid on this token's trades
      const keys=msg.accountKeys.map(k=>typeof k==='string'?k:k.pubkey);
      const tok={},ws={};
      for(const [arr,sg] of [[m.preTokenBalances,-1],[m.postTokenBalances,1]])for(const b of arr||[]){
        const a=sg*(+b.uiTokenAmount.amount)/Math.pow(10,b.uiTokenAmount.decimals);
        if(b.mint===mint)tok[b.owner]=(tok[b.owner]||0)+a;else if(b.mint===WSOL)ws[b.owner]=(ws[b.owner]||0)+a}
      for(const o in tok){const q=tok[o];if(Math.abs(q)<1e-9)continue;
        const i=keys.indexOf(o),sol=(i>=0?(m.postBalances[i]-m.preBalances[i])/1e9:0)+(ws[o]||0);
        seen.set(o,(seen.get(o)||0)+1);
        let w=W.get(o);if(!w){w={addr:o,bSol:0,sSol:0,qIn:0,qOut:0,nb:0,ns:0,tin:0,tout:0,first:t.blockTime,last:0,ev:[]};W.set(o,w)}
        w.ev.push((t.slot||t.blockTime)+(q>0?'b':'s')); // same block + same side: used to spot one person trading from several wallets
        w.last=t.blockTime;
        if(q>0){if(sol<-0.0005){w.bSol+=-sol;w.nb++}else w.tin++;w.qIn+=q}
        else{if(sol>0.0005){w.sSol+=sol;w.ns++}else w.tout++;w.qOut+=-q}}
    }
    onp&&onp(`Reading the token's trades · ${txs.toLocaleString()} transactions${last?' · up to '+new Date(last*1000).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''}`);
    token=j.result&&j.result.paginationToken;
    if(!token||d.length<100){done=true;break}
  }
  // rank by realized profit: what it sold for, minus what the sold part cost
  let list=[...W.values()].map(w=>{const frac=w.qIn>0?Math.min(1,w.qOut/w.qIn):(w.qOut>0?1:0),cost=w.bSol*frac;
    return {...w,soldFrac:frac,realized:w.sSol-cost,roi:cost>0?w.sSol/cost-1:null}}).filter(w=>w.bSol>=0.01||w.sSol>=0.01);
  // drop pools and programs: they appear in a large share of all trades, and their accounts aren't ordinary wallets
  const busy=Math.max(40,txs*0.08);list=list.filter(w=>(seen.get(w.addr)||0)<busy);
  list.sort((a,b)=>b.realized-a.realized);
  const cand=list.slice(0,230),ids=cand.map(w=>w.addr),keep=new Set();
  for(let i=0;i<ids.length;i+=100){const part=ids.slice(i,i+100);
    const j=await getJSON(RPC+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getMultipleAccounts',params:[part,{encoding:'base64',dataSlice:{offset:0,length:0}}]})});
    ((j.result&&j.result.value)||[]).forEach((v,k)=>{if(!v||v.owner===SYS)keep.add(part[k])})}
  list=cand.filter(w=>keep.has(w.addr)&&!(typeof PLAT_AUTH!=='undefined'&&PLAT_AUTH[w.addr]));
  // multi-wallet users: two wallets count as the same person when 60%+ of BOTH wallets' buys and sells land in the same block, same side
  const idx=new Map();for(const w of W.values()){if((seen.get(w.addr)||0)>=busy)continue;for(const e of new Set(w.ev)){let a=idx.get(e);if(!a){a=[];idx.set(e,a)}a.push(w)}}
  for(const w of list){const mine=new Set(w.ev),cnt=new Map();
    for(const e of mine)for(const o of idx.get(e)||[])if(o.addr!==w.addr)cnt.set(o,(cnt.get(o)||0)+1);
    const twins=[...cnt].filter(([o,c])=>c>=2&&c/Math.max(mine.size,o.evn||(o.evn=new Set(o.ev).size))>=0.6).map(([o])=>o.addr);
    if(twins.length)w.multi={n:twins.length+1,with:twins.slice(0,12)}}
  for(const w of W.values())delete w.ev;for(const w of list)delete w.ev;
  return {traders:list,pages,txs,done,first,last,fees,credits:pages*10+Math.ceil(ids.length/100)};
}
