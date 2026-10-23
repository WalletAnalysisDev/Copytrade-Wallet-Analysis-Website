/* Copytrade Wallet Score. Copyright (c) 2026 Copytrade Wallet Score. All rights reserved. See LICENSE. */
/* ---------- Guided tour for new users ----------
   Spotlights the real controls when they're on screen; for parts that only appear after an analysis (score, filters,
   token list…) it shows a small preview instead. Opens by itself the first time (no wallets analyzed yet), can be
   skipped at any point, resumed right after skipping, and replayed any time from the ? button in the header. */
(()=>{
  const LS='ws-tour';
  const get=()=>{try{return localStorage.getItem(LS)}catch(e){return null}},put=v=>{try{localStorage.setItem(LS,v)}catch(e){}};
  const vis=el=>{if(!el)return false;if(el.closest('[hidden]'))return false;const r=el.getBoundingClientRect();return r.width>4&&r.height>4};
  const tab=v=>{const b=document.querySelector(`.tabs [data-v="${v}"]`);if(b&&!b.classList.contains('on'))b.click()};
  const chip=(t,c)=>`<span class="tm-tag" style="--c:${c}">${t}</span>`;

  const STEPS=[
    {title:'Welcome to Copytrade Wallet Score',body:'Score any Solana wallet from 0 to 100 for copy trading, find the filters that make it profitable, and spot the best traders on any token. This quick tour shows the main features. It takes about a minute.',
      mock:`<div class="tm-hero"><div class="tm-ring"><b>87</b><small>/100</small></div><div><b>Excellent to copy</b><div class="tm-sub">Wins 13 of 16 trades inside its filters</div></div></div>`,first:true},
    {sel:'#gear',title:'1 · Add your Helius key',body:'Open the menu and paste a free Helius API key (helius.dev). The extension reads each wallet\'s trades straight from the blockchain with it. Your key stays in your browser.'},
    {view:'wallet',sel:'#form',title:'2 · Score a wallet',body:'Paste a wallet address and press Score. On a GMGN wallet page you can also use the wallet from that tab with one click. Analyze tokens sets how many of its latest tokens are checked.'},
    {view:'wallet',sel:'.scorecard',title:'3 · The score',body:'0 to 100: how well copying this wallet would have gone. It starts from the win rate inside its best filters, then adds or takes away points (busy wallets, red days, quick flips, spam bots…). Tap the score breakdown to see every point.',
      mock:`<div class="tm-hero"><div class="tm-ring"><b>87</b><small>/100</small></div><div><b>Excellent to copy</b><div class="tm-sub">Win rate 81 <span class="pos">+15</span> win rate over 50% · <span class="pos">+5</span> filters: profit · <span class="neg">−10</span> avg hold 12s</div></div></div>`},
    {view:'wallet',sel:'#filters',title:'4 · Recommended filters',body:'The market cap, buy size and token age range where this wallet actually makes money. Tap a value to copy it into your copy bot. Press Edit to try your own numbers and see how the wallet would have done, then go back to the recommended ones.',
      mock:`<div class="tm-grid"><div><span>Min market cap</span><b>$20K</b></div><div><span>Max market cap</span><b>$100K</b></div><div><span>Min SOL buy</span><b>0.25 SOL</b></div><div><span>Max SOL buy</span><b>3 SOL</b></div></div>`},
    {view:'wallet',sel:'#cmpcard',title:'5 · With filters vs all trades',body:'Side by side: what copying only the trades inside the filters made, against copying everything. Win rate, profit, return, average win and loss, and the last 7 days.',
      mock:`<table class="tm-tbl"><tr><th></th><th>With filters</th><th>All trades</th></tr><tr><td>Win rate</td><td class="pos">69%</td><td>30%</td></tr><tr><td>Profit</td><td class="pos">+5.68 SOL</td><td class="neg">−7.98 SOL</td></tr><tr><td>Return</td><td class="pos">+43%</td><td class="neg">−22%</td></tr></table>`},
    {view:'wallet',sel:'#toks',title:'6 · Every token, labeled',body:'Each token the wallet bought, with its result. Switch between In filters and All. Labels flag what a copier should know: tokens it created (DEV), QuickSells a bot can\'t follow, price spikes on entry and round-trips.',
      mock:`<div class="tm-rows"><div><b>ORBIT</b>${chip('In filter','#2ebd85')}<span class="pos">+228%</span></div><div><b>GLOW</b>${chip('DEV','#c08cff')}<span class="pos">+486%</span></div><div><b>TIHS</b>${chip('QuickSell','#f6465d')}<span class="neg">−23%</span></div></div>`},
    {view:'wallet',sel:'#rtcard',title:'7 · Round-trips & entry spikes',body:'Checks the In Filter tokens: how often a winner turned into a loss (a take-profit would have saved it), and how much the price jumped right after its buys (a copier pays more). About 20 credits a token.',
      mock:`<div class="tm-rows"><div>Heavy spikes (50%+) · 2 of 12<span class="neg">−0.40 SOL</span></div><div>+100% round-trips · 3<span class="pos">+1.20 SOL</span></div></div>`},
    {view:'tt',sel:'#ttform',title:'8 · Top traders of any token',body:'Paste a token, press the button to use the token from your GMGN tab, or scan several Trenches tokens at once. It lists who made the most on it. A progress bar shows the time left, and Stop keeps what was read so far.'},
    {view:'tt',sel:'#ttlist',title:'9 · Scores for every trader',body:'Press Score all (or turn on Auto-score) to score each wallet. Tap a score to open the full analysis, or the wallet address to open it on GMGN. Colored groups mark wallets that trade together (Multi-Wallet), and spam bots get a red border.',
      mock:`<div class="tm-rows"><div><span class="tm-rk">1</span><b>7kQm…R2pa ↗</b><span class="tm-sc" style="--c:#2ebd85">88</span></div><div class="tm-mw" style="--c:#4a9eff"><span class="tm-rk">2</span><b>C9xd…Lw4t ↗</b>${chip('Multi-Wallet ×2','#4a9eff')}<span class="tm-sc" style="--c:#f0b90b">61</span></div><div class="tm-mw" style="--c:#4a9eff"><span class="tm-rk">3</span><b>4TnB…v8Kz ↗</b>${chip('Multi-Wallet ×2','#4a9eff')}<span class="tm-sc" style="--c:#f6465d">34</span></div></div>`},
    {title:'10 · Right on GMGN',body:'On a gmgn.ai wallet page, a score badge sits next to the address, a card shows its filters, and every token gets labels (In filter, DEV, QuickSell, Spike, RT). Turn it on or off in the menu.',
      mock:`<div class="tm-gm"><div class="tm-gmh"><b>7kQm…R2pa</b><span class="tm-sc" style="--c:#2ebd85">88 · A</span></div><div class="tm-rows"><div><b>ORBIT</b>${chip('In filter','#2ebd85')}${chip('RT +140%','#6aa6ff')}</div><div><b>TIHS</b>${chip('Out of filter','#a0a0aa')}</div></div></div>`},
    {sel:'.tabs [data-v="ms"]',title:'11 · Automatic',body:'Finds tokens that match your market cap, volume and holder settings, pulls their top traders and scores them for you in the background.'},
    {sel:'.tabs [data-v="hist"]',title:'12 · History',body:'Every wallet and check you\'ve run, searchable and sortable by score. Reopening a saved wallet is free.'},
    {sel:'#tourbtn',title:'You\'re all set',body:'Replay this tour any time with the ? button up here. Start by adding your Helius key, then paste a wallet.',last:true},
  ];

  let i=0,root=null,hl=null,card=null,onKey=null,onResize=null;
  function build(){
    root=document.createElement('div');root.className='tour';root.innerHTML='<div class="tour-dim"></div><div class="tour-hl"></div><div class="tour-card" role="dialog" aria-live="polite"></div>';
    document.body.appendChild(root);hl=root.querySelector('.tour-hl');card=root.querySelector('.tour-card');
    root.addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(!b)return;const a=b.dataset.t;
      if(a==='next')go(i+1);else if(a==='back')go(i-1);else if(a==='skip')skip();else if(a==='done')finish()});
    onKey=e=>{if(e.key==='Escape')skip();else if(e.key==='ArrowRight')go(i+1);else if(e.key==='ArrowLeft')go(i-1)};
    onResize=()=>place();addEventListener('keydown',onKey);addEventListener('resize',onResize);
  }
  function close(){if(root){root.remove();root=null}removeEventListener('keydown',onKey);removeEventListener('resize',onResize)}
  function target(s){if(!s.sel)return null;const el=document.querySelector(s.sel);return vis(el)?el:null}
  function go(n){if(n<0)n=0;if(n>=STEPS.length){finish();return}i=n;const s=STEPS[i];
    if(s.view)tab(s.view);
    const st=document.getElementById('settings');if(st&&!st.hidden&&s.sel!=='#gear'){const c=document.getElementById('setclose');if(c)c.click()}
    setTimeout(render,s.view?120:0)}
  function render(){if(!root)return;const s=STEPS[i],el=target(s);
    const dots=STEPS.map((_,k)=>`<i class="${k===i?'on':''}"></i>`).join('');
    card.innerHTML=`<div class="tour-top"><span class="tour-n">${i+1} / ${STEPS.length}</span>${s.last?'':'<button type="button" class="tour-skip" data-t="skip">Skip tour</button>'}</div>
      <h3>${s.title}</h3><p>${s.body}</p>${!el&&s.mock?`<div class="tour-mock"><div class="tour-mlbl">Preview</div>${s.mock}</div>`:''}
      <div class="tour-foot"><div class="tour-dots">${dots}</div><div class="tour-btns">${i>0?'<button type="button" class="ghost" data-t="back">Back</button>':''}${s.last?'<button type="button" class="run tour-go" data-t="done">Done</button>':`<button type="button" class="run tour-go" data-t="next">${s.first?'Start the tour':'Next'}</button>`}</div></div>`;
    if(el)el.scrollIntoView({block:'center',behavior:'instant'});
    requestAnimationFrame(place)}
  function place(){if(!root)return;const s=STEPS[i],el=target(s),pad=6;
    if(!el){hl.style.display='none';root.classList.add('center');card.style.top=card.style.left='';return}
    root.classList.remove('center');hl.style.display='block';const r=el.getBoundingClientRect();
    Object.assign(hl.style,{top:(r.top-pad)+'px',left:(r.left-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px'});
    const cw=Math.min(340,innerWidth-24),ch=card.offsetHeight;card.style.width=cw+'px';
    let top=r.bottom+pad+10;if(top+ch>innerHeight-8)top=r.top-pad-10-ch;if(top<8)top=Math.max(8,innerHeight-ch-8);
    card.style.top=top+'px';card.style.left=Math.max(12,Math.min(r.left,innerWidth-cw-12))+'px'}
  function start(at){close();build();go(at||0)}
  function finish(){put('done');close()}
  function skip(){const at=i;put('skipped');close();
    const t=document.createElement('div');t.className='tour-toast';t.innerHTML=`Tour skipped. Replay it any time with the <b>?</b> button at the top. <button type="button" class="linkbtn">Resume tour</button>`;
    document.body.appendChild(t);t.querySelector('button').addEventListener('click',()=>{t.remove();start(at)});setTimeout(()=>t.remove(),9000)}
  window.wsTour=start;
  const b=document.getElementById('tourbtn');if(b)b.addEventListener('click',()=>start(0));
  // first visit: open by itself when nothing has been analyzed yet (existing users aren't interrupted)
  let fresh=true;try{fresh=!Object.keys(typeof histIndex==='function'?histIndex():{}).length}catch(e){}
  if(!get()&&fresh)setTimeout(()=>start(0),600);
})();
