import React, { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// ── API CONFIG ────────────────────────────────────────────────────────────────
const BINANCE_BASE = "https://api.binance.com/api/v3";
const GECKO_BASE   = "https://api.coingecko.com/api/v3";

// ── AVAILABLE COINS CATALOG ───────────────────────────────────────────────────
const CATALOG = [
  { id:"bitcoin",       binance:"BTCUSDT",  short:"BTC",  name:"Bitcoin",       color:"#F7931A", gecko:"bitcoin" },
  { id:"ethereum",      binance:"ETHUSDT",  short:"ETH",  name:"Ethereum",      color:"#627EEA", gecko:"ethereum" },
  { id:"solana",        binance:"SOLUSDT",  short:"SOL",  name:"Solana",        color:"#9945FF", gecko:"solana" },
  { id:"cardano",       binance:"ADAUSDT",  short:"ADA",  name:"Cardano",       color:"#0033AD", gecko:"cardano" },
  { id:"avalanche-2",   binance:"AVAXUSDT", short:"AVAX", name:"Avalanche",     color:"#E84142", gecko:"avalanche-2" },
  { id:"polkadot",      binance:"DOTUSDT",  short:"DOT",  name:"Polkadot",      color:"#E6007A", gecko:"polkadot" },
  { id:"chainlink",     binance:"LINKUSDT", short:"LINK", name:"Chainlink",     color:"#2A5ADA", gecko:"chainlink" },
  { id:"ripple",        binance:"XRPUSDT",  short:"XRP",  name:"XRP",           color:"#00AAE4", gecko:"ripple" },
  { id:"dogecoin",      binance:"DOGEUSDT", short:"DOGE", name:"Dogecoin",      color:"#C2A633", gecko:"dogecoin" },
  { id:"shiba-inu",     binance:"SHIBUSDT", short:"SHIB", name:"Shiba Inu",     color:"#FFA409", gecko:"shiba-inu" },
  { id:"matic-network", binance:"MATICUSDT",short:"MATIC",name:"Polygon",       color:"#8247E5", gecko:"matic-network" },
  { id:"litecoin",      binance:"LTCUSDT",  short:"LTC",  name:"Litecoin",      color:"#345D9D", gecko:"litecoin" },
  { id:"cosmos",        binance:"ATOMUSDT", short:"ATOM", name:"Cosmos",        color:"#2E3148", gecko:"cosmos" },
  { id:"near",          binance:"NEARUSDT", short:"NEAR", name:"NEAR Protocol", color:"#00C08B", gecko:"near" },
  { id:"uniswap",       binance:"UNIUSDT",  short:"UNI",  name:"Uniswap",       color:"#FF007A", gecko:"uniswap" },
  { id:"aptos",         binance:"APTUSDT",  short:"APT",  name:"Aptos",         color:"#00C2FF", gecko:"aptos" },
  { id:"arbitrum",      binance:"ARBUSDT",  short:"ARB",  name:"Arbitrum",      color:"#28A0F0", gecko:"arbitrum" },
  { id:"sui",           binance:"SUIUSDT",  short:"SUI",  name:"Sui",           color:"#4CA3FF", gecko:"sui" },
  { id:"injective-protocol",binance:"INJUSDT",short:"INJ",name:"Injective",    color:"#00B2FF", gecko:"injective-protocol" },
  { id:"fetch-ai",      binance:"FETUSDT",  short:"FET",  name:"Fetch.ai",      color:"#1A2B6B", gecko:"fetch-ai" },
  { id:"render-token",  binance:"RENDERUSDT",short:"RENDER",name:"Render",      color:"#FF4D00", gecko:"render-token" },
  { id:"the-graph",     binance:"GRTUSDT",  short:"GRT",  name:"The Graph",     color:"#6747ED", gecko:"the-graph" },
  { id:"sandbox",       binance:"SANDUSDT", short:"SAND", name:"The Sandbox",   color:"#04ADEF", gecko:"sandbox" },
  { id:"decentraland",  binance:"MANAUSDT", short:"MANA", name:"Decentraland",  color:"#FF2D55", gecko:"decentraland" },
  { id:"filecoin",      binance:"FILUSDT",  short:"FIL",  name:"Filecoin",      color:"#0090FF", gecko:"filecoin" },
  { id:"internet-computer",binance:"ICPUSDT",short:"ICP",name:"ICP",            color:"#3B00B9", gecko:"internet-computer" },
  { id:"pepe",          binance:"PEPEUSDT", short:"PEPE", name:"Pepe",          color:"#4CAF50", gecko:"pepe" },
  { id:"worldcoin-wld", binance:"WLDUSDT",  short:"WLD",  name:"Worldcoin",     color:"#000000", gecko:"worldcoin-wld" },
];

const DEFAULT_IDS = ["bitcoin","ethereum","solana","cardano","avalanche-2","polkadot"];

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
function sendNotification(title, body, icon = "📈") {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/32/icon/btc.png", tag: title });
  } catch(_) {}
}

async function requestNotifPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return await Notification.requestPermission();
}

const STORAGE_KEY      = "crypto_trades_v4";
const HIST_CACHE_KEY   = "crypto_hist_v3";
const COINS_KEY        = "crypto_coins_v1";
const HIST_TTL         = 6 * 60 * 1000;
const POSITION_LOCK_DROP = 4;

// ── ANALYSIS ──────────────────────────────────────────────────────────────────
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i]-closes[i-1]; d>0?g+=d:l-=d; }
  let ag = g/period, al = l/period;
  for (let i = period+1; i < closes.length; i++) {
    const d = closes[i]-closes[i-1];
    ag = (ag*(period-1)+Math.max(d,0))/period;
    al = (al*(period-1)+Math.max(-d,0))/period;
  }
  return al===0?100:100-100/(1+ag/al);
}

function analyzePattern(dailyPrices) {
  if (!dailyPrices||dailyPrices.length<15) return null;
  const events = [];
  for (let i=1; i<dailyPrices.length-6; i++) {
    const drop=(dailyPrices[i-1].price-dailyPrices[i].price)/dailyPrices[i-1].price*100;
    if (drop>=4&&drop<=22) {
      let best=0,day=null;
      for (let j=1;j<=6&&i+j<dailyPrices.length;j++) {
        const g=(dailyPrices[i+j].price-dailyPrices[i].price)/dailyPrices[i].price*100;
        if(g>best){best=g;day=j;}
      }
      events.push({drop,best,day});
    }
  }
  if(!events.length) return{events:[],recoveryRate:0,avgGain:0,avgDays:0,sampleSize:0};
  const rec=events.filter(e=>e.best>=5);
  return{events,sampleSize:events.length,recoveryRate:rec.length/events.length*100,avgGain:rec.length?rec.reduce((a,e)=>a+e.best,0)/rec.length:0,avgDays:rec.length?rec.reduce((a,e)=>a+e.day,0)/rec.length:0};
}

function detectExitSignal(dailyPrices, rsi, change24h) {
  if(!dailyPrices||dailyPrices.length<6)return null;
  const rec=dailyPrices.slice(-6);
  const g3=(rec[rec.length-1].price-rec[rec.length-4].price)/rec[rec.length-4].price*100;
  const g6=(rec[rec.length-1].price-rec[0].price)/rec[0].price*100;
  let score=0;const reasons=[];
  if(rsi!==null&&rsi>68){score+=35;reasons.push(`RSI sobrecomprado (${rsi.toFixed(1)})`);}
  else if(rsi!==null&&rsi>60){score+=15;reasons.push(`RSI elevado (${rsi.toFixed(1)})`);}
  if(g3>10){score+=30;reasons.push(`+${g3.toFixed(1)}% en 3 días`);}
  else if(g3>5){score+=15;reasons.push(`+${g3.toFixed(1)}% en 3 días`);}
  if(g6>18){score+=25;reasons.push(`+${g6.toFixed(1)}% en 6 días`);}
  if(change24h>6){score+=15;reasons.push(`Vela fuerte hoy +${change24h.toFixed(1)}%`);}
  return{score:Math.min(100,score),reasons};
}

function getSignal(rsi, change24h, price, pattern, posLock) {
  if(posLock&&!posLock.unlocked) return{label:"Posición abierta",tier:"locked",desc:`Ya tienes ${posLock.trade.coinShort} comprado en ${fmtPrice(posLock.trade.entryPrice)}. Necesitas una caída adicional del ${(POSITION_LOCK_DROP-posLock.dropFromEntry).toFixed(1)}% para nueva señal.`,showEntry:false,locked:true,dropFromEntry:posLock.dropFromEntry};
  const vol=Math.abs(change24h)/100;
  const tgt=Math.max(0.03,Math.min(0.09,vol*1.5+0.025));
  const exit=price*(1+tgt),stop=price*0.975,drop=-change24h;
  const hasP=pattern&&pattern.recoveryRate>=50&&pattern.sampleSize>=3;
  const ps=hasP?` Histórico: ${pattern.recoveryRate.toFixed(0)}% rebotó en ~${pattern.avgDays.toFixed(1)} días.`:"";
  if(rsi!==null&&rsi<30&&drop>=5&&drop<=22)return{label:"Entrada fuerte",tier:"strong-buy",desc:`RSI crítico + caída ${drop.toFixed(1)}%.${ps}`,showEntry:true,entry:price,exit,stop,days:"1–3 días",pattern};
  if(rsi!==null&&rsi<38&&drop>=3)return{label:"Posible entrada",tier:"buy",desc:`Zona sobrevendida + caída ${drop.toFixed(1)}%.${ps}`,showEntry:true,entry:price,exit,stop,days:"2–5 días",pattern};
  if(drop>=5&&drop<=22&&hasP&&pattern.recoveryRate>=65)return{label:"Caída histórica",tier:"buy",desc:`Caída ${drop.toFixed(1)}% en rango histórico. ${pattern.recoveryRate.toFixed(0)}% de rebote en ~${pattern.avgDays.toFixed(1)} días.`,showEntry:true,entry:price,exit,stop,days:"2–6 días",pattern};
  if(rsi!==null&&rsi>72)return{label:"Evitar",tier:"sell",desc:"Sobrecomprado. Riesgo alto de corrección.",showEntry:false};
  if(rsi!==null&&rsi>62&&change24h>3)return{label:"Precaución",tier:"caution",desc:"Subida fuerte reciente. Posible techo.",showEntry:false};
  return{label:"Esperar",tier:"neutral",desc:"Sin señal clara. Continuar monitoreando.",showEntry:false};
}

// ── API LAYER — Binance primary, CoinGecko fallback ───────────────────────────
async function fetchLiveCoin(coin) {
  try {
    const [ticker, klines] = await Promise.all([
      fetch(`${BINANCE_BASE}/ticker/24hr?symbol=${coin.binance}`).then(r=>{if(!r.ok)throw new Error("B404");return r.json();}),
      fetch(`${BINANCE_BASE}/klines?symbol=${coin.binance}&interval=4h&limit=50`).then(r=>{if(!r.ok)throw new Error("B404");return r.json();}),
    ]);
    if(ticker.code) throw new Error("Binance error: "+ticker.msg);
    const price=parseFloat(ticker.lastPrice);
    const change24h=parseFloat(ticker.priceChangePercent);
    const closes=klines.map(k=>parseFloat(k[4]));
    const rsi=calcRSI(closes);
    return{price,change24h,rsi,source:"Binance"};
  } catch(_) {}
  try {
    const [mkt, ohlc] = await Promise.all([
      fetch(`${GECKO_BASE}/simple/price?ids=${coin.gecko}&vs_currencies=usd&include_24hr_change=true`).then(r=>r.json()),
      fetch(`${GECKO_BASE}/coins/${coin.gecko}/ohlc?vs_currency=usd&days=7`).then(r=>r.json()),
    ]);
    const price=mkt[coin.gecko]?.usd||0;
    const change24h=mkt[coin.gecko]?.usd_24h_change||0;
    let rsi=null;
    if(Array.isArray(ohlc)&&ohlc.length>15)rsi=calcRSI(ohlc.map(k=>k[4]));
    return{price,change24h,rsi,source:"CoinGecko"};
  } catch(_) {}
  return null;
}

async function fetchHistoricalCoin(coin) {
  try {
    const klines=await fetch(`${BINANCE_BASE}/klines?symbol=${coin.binance}&interval=1d&limit=90`).then(r=>{if(!r.ok)throw new Error("B404");return r.json();});
    if(!Array.isArray(klines)||klines.length<10)throw new Error("empty");
    return klines.map(k=>({date:new Date(k[0]).toISOString().split("T")[0],price:parseFloat(k[4])}));
  } catch(_) {}
  try {
    const r=await fetch(`${GECKO_BASE}/coins/${coin.gecko}/market_chart?vs_currency=usd&days=90&interval=daily`).then(r=>r.json());
    if(r.prices)return r.prices.map(([ts,p])=>({date:new Date(ts).toISOString().split("T")[0],price:p}));
  } catch(_) {}
  return null;
}

// ── FORMATTERS ────────────────────────────────────────────────────────────────
function fmtPrice(p){if(!p&&p!==0)return"—";if(p>=1000)return"$"+Number(p).toLocaleString("en-US",{maximumFractionDigits:0});if(p>=1)return"$"+Number(p).toFixed(3);return"$"+Number(p).toFixed(5);}
function fmtPct(p,sign=true){return(sign&&p>=0?"+":"")+Number(p).toFixed(2)+"%";}
function fmtDate(iso){return new Date(iso).toLocaleDateString("es-CL",{day:"2-digit",month:"short",year:"numeric"});}
function fmtRelative(iso){const d=Math.floor((Date.now()-new Date(iso))/86400000);return d===0?"Hoy":d===1?"Ayer":`Hace ${d}d`;}
function fmtChartPrice(p){if(p>=1000)return"$"+Math.round(p).toLocaleString("en-US");if(p>=1)return"$"+p.toFixed(2);return"$"+p.toFixed(4);}

// ── TIER STYLES ───────────────────────────────────────────────────────────────
const TS={
  "strong-buy":{bg:"#EAF3DE",text:"#27500A",border:"#639922",dot:"#639922",btn:"#3B6D11"},
  "buy":{bg:"#EAF3DE",text:"#3B6D11",border:"#97C459",dot:"#97C459",btn:"#639922"},
  "sell":{bg:"#FCEBEB",text:"#791F1F",border:"#E24B4A",dot:"#E24B4A",btn:"#A32D2D"},
  "caution":{bg:"#FAEEDA",text:"#633806",border:"#EF9F27",dot:"#EF9F27",btn:"#854F0B"},
  "neutral":{bg:"#F1EFE8",text:"#444441",border:"#B4B2A9",dot:"#B4B2A9",btn:"#888780"},
  "locked":{bg:"#E6F1FB",text:"#0C447C",border:"#378ADD",dot:"#378ADD",btn:"#185FA5"},
};

// ── SMALL UI COMPONENTS ───────────────────────────────────────────────────────
function RSIBar({value}){
  if(value===null)return<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:8}}>RSI calculando…</div>;
  const pct=Math.min(100,Math.max(0,value));
  const color=value<30?"#639922":value>70?"#E24B4A":"#888780";
  return(
    <div style={{marginTop:10}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--color-text-tertiary)",marginBottom:4}}>
        <span>Sobrevendido</span><span style={{fontWeight:600,color}}>RSI {value.toFixed(1)}</span><span>Sobrecomprado</span>
      </div>
      <div style={{background:"var(--color-background-tertiary)",borderRadius:6,height:6,position:"relative"}}>
        <div style={{position:"absolute",left:"25%",right:"25%",top:0,height:"100%",background:"rgba(128,128,128,0.12)"}}/>
        <div style={{position:"absolute",left:0,width:pct+"%",height:"100%",background:color,borderRadius:6,transition:"width 0.8s"}}/>
        <div style={{position:"absolute",left:pct+"%",top:-4,width:14,height:14,marginLeft:-7,background:color,borderRadius:"50%",border:"2.5px solid var(--color-background-primary)"}}/>
      </div>
    </div>
  );
}

function PatternBadge({pattern}){
  if(!pattern||pattern.sampleSize<3)return null;
  const c=pattern.recoveryRate>=65?"#3B6D11":pattern.recoveryRate>=45?"#854F0B":"#888780";
  const bg=pattern.recoveryRate>=65?"#EAF3DE":pattern.recoveryRate>=45?"#FAEEDA":"#F1EFE8";
  return(
    <div style={{marginTop:8,background:bg,borderRadius:10,padding:"8px 12px"}}>
      <div style={{fontSize:10,color:c,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Análisis 90 días · {pattern.sampleSize} caídas similares</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
        {[{l:"Rebotó",v:pattern.recoveryRate.toFixed(0)+"%"},{l:"Ganancia prom.",v:"+"+pattern.avgGain.toFixed(1)+"%"},{l:"En promedio",v:pattern.avgDays.toFixed(1)+" días"}].map(x=>(
          <div key={x.l} style={{textAlign:"center"}}><div style={{fontSize:15,fontWeight:800,color:c}}>{x.v}</div><div style={{fontSize:10,color:c,opacity:0.7}}>{x.l}</div></div>
        ))}
      </div>
    </div>
  );
}

function ExitAlert({trade,currentPrice,exitSignal,onClose}){
  if(!exitSignal||exitSignal.score<45)return null;
  const pnlPct=(currentPrice-trade.entryPrice)/trade.entryPrice*100;
  if(pnlPct<6)return null;
  const urgent=exitSignal.score>=70;
  return(
    <div style={{background:urgent?"#FCEBEB":"#FAEEDA",border:`1.5px solid ${urgent?"#E24B4A":"#EF9F27"}`,borderRadius:14,padding:"12px 14px",marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
            <span style={{fontSize:14}}>{urgent?"🔔":"⚠️"}</span>
            <span style={{fontSize:13,fontWeight:700,color:urgent?"#791F1F":"#633806"}}>{urgent?"SEÑAL DE SALIDA":"Considera tomar ganancias"}</span>
          </div>
          <div style={{fontSize:12,color:urgent?"#791F1F":"#633806",lineHeight:1.5,marginBottom:6}}>{trade.coinShort} acumula <strong>{fmtPct(pnlPct)}</strong>. {exitSignal.reasons.join(" · ")}.</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{exitSignal.reasons.map((r,i)=><span key={i} style={{fontSize:10,background:"rgba(255,255,255,0.6)",color:urgent?"#791F1F":"#633806",padding:"2px 8px",borderRadius:8}}>{r}</span>)}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:20,fontWeight:900,color:urgent?"#791F1F":"#633806"}}>+{fmtPct(pnlPct,false)}</div>
          <div style={{fontSize:10,color:urgent?"#791F1F":"#633806",opacity:0.7}}>ganancia actual</div>
          <div style={{fontSize:11,color:urgent?"#791F1F":"#633806",fontWeight:600}}>Score {exitSignal.score}/100</div>
        </div>
      </div>
      <button onClick={()=>onClose(trade)} style={{marginTop:10,width:"100%",padding:"8px",borderRadius:10,fontSize:12,fontWeight:700,background:urgent?"#A32D2D":"#854F0B",color:"#fff",border:"none",cursor:"pointer"}}>Cerrar y registrar ganancia →</button>
    </div>
  );
}

// ── COIN MANAGER MODAL ────────────────────────────────────────────────────────
function CoinManagerModal({activeIds, onSave, onClose}){
  const [selected,setSelected]=useState(new Set(activeIds));
  const [search,setSearch]=useState("");

  // 🔑 FIX: bloquea scroll del body mientras el modal está abierto
  useEffect(()=>{
    const prev=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=prev;};
  },[]);

  const filtered=CATALOG.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||c.short.toLowerCase().includes(search.toLowerCase()));
  const toggle=id=>{
    setSelected(s=>{
      const n=new Set(s);
      if(n.has(id)){if(n.size<=1)return s;n.delete(id);}else{if(n.size>=12)return s;n.add(id);}
      return n;
    });
  };
  return(
    <div
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1000}}
      onClick={e=>e.target===e.currentTarget&&onClose()}
      onTouchStart={e=>{if(e.target!==e.currentTarget)e.stopPropagation();}}
    >
      <div
        style={{background:"var(--color-background-primary)",borderRadius:"20px 20px 0 0",padding:"1.5rem 1.5rem 2rem",width:"100%",maxWidth:480,maxHeight:"90vh",display:"flex",flexDirection:"column",overflowY:"auto",WebkitOverflowScrolling:"touch"}}
        onClick={e=>e.stopPropagation()}
      >
        <div style={{width:40,height:4,borderRadius:4,background:"var(--color-border-secondary)",margin:"0 auto 1rem"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <div>
            <h3 style={{margin:0,fontSize:16,fontWeight:700}}>Gestionar monedas</h3>
            <div style={{fontSize:12,color:"var(--color-text-tertiary)",marginTop:2}}>{selected.size} seleccionadas · máx. 12</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--color-text-secondary)"}}>×</button>
        </div>
        <input type="text" placeholder="Buscar moneda…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:"100%",padding:"8px 12px",borderRadius:10,fontSize:16,marginBottom:"1rem",boxSizing:"border-box"}} />
        <div style={{overflow:"auto",flex:1,marginBottom:"1rem"}}>
          {filtered.map(coin=>{
            const on=selected.has(coin.id);
            return(
              <div key={coin.id} onClick={()=>toggle(coin.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:12,marginBottom:6,cursor:"pointer",background:on?"var(--color-background-secondary)":"transparent",border:`1px solid ${on?"var(--color-border-secondary)":"var(--color-border-tertiary)"}`,transition:"all 0.15s"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:coin.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700,flexShrink:0}}>{coin.short.slice(0,2)}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14}}>{coin.short} <span style={{fontWeight:400,color:"var(--color-text-secondary)",fontSize:12}}>· {coin.name}</span></div>
                  <div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>Binance: {coin.binance}</div>
                </div>
                <div style={{width:22,height:22,borderRadius:"50%",background:on?"#3B6D11":"transparent",border:`2px solid ${on?"#3B6D11":"var(--color-border-secondary)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {on&&<span style={{fontSize:12,color:"#fff",lineHeight:1}}>✓</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",borderRadius:10,fontSize:13,cursor:"pointer",background:"var(--color-background-secondary)",border:"none",color:"var(--color-text-secondary)",fontWeight:500}}>Cancelar</button>
          <button onClick={()=>onSave([...selected])} style={{flex:2,padding:"12px",borderRadius:10,fontSize:13,cursor:"pointer",background:"#3B6D11",border:"none",color:"#fff",fontWeight:700}}>Guardar lista ({selected.size})</button>
        </div>
      </div>
    </div>
  );
}

// ── COIN CARD ─────────────────────────────────────────────────────────────────
function CoinCard({coin,onAddTrade}){
  const s=coin.signal;const ts=TS[s.tier]||TS.neutral;
  const meta=CATALOG.find(c=>c.id===coin.id);
  const isUp=coin.change24h>=0;const drop=-coin.change24h;
  return(
    <div style={{background:"var(--color-background-primary)",borderRadius:16,border:"1px solid var(--color-border-tertiary)",overflow:"hidden"}}>
      <div style={{height:3,background:meta?.color||ts.dot}}/>
      <div style={{padding:"14px 16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:30,height:30,borderRadius:"50%",background:meta?.color||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:"#fff",fontWeight:700}}>{coin.short.slice(0,2)}</div>
            <div><div style={{fontWeight:700,fontSize:15}}>{coin.short}</div><div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{coin.name}</div></div>
          </div>
          <span style={{fontSize:11,fontWeight:600,padding:"4px 10px",background:ts.bg,color:ts.text,borderRadius:20,border:`1px solid ${ts.border}44`,display:"flex",alignItems:"center",gap:5}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:ts.dot,flexShrink:0}}/>
            {s.label}
          </span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
          <div>
            <span style={{fontSize:22,fontWeight:800}}>{fmtPrice(coin.price)}</span>
            <span style={{fontSize:10,color:"var(--color-text-tertiary)",marginLeft:6}}>{coin.source}</span>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {drop>=4&&drop<=22&&!s.locked&&<span style={{fontSize:11,fontWeight:600,background:"#EAF3DE",color:"#3B6D11",padding:"2px 8px",borderRadius:8}}>Caída {drop.toFixed(1)}%</span>}
            <span style={{fontSize:13,fontWeight:700,color:isUp?"#3B6D11":"#A32D2D",background:isUp?"#EAF3DE":"#FCEBEB",padding:"3px 9px",borderRadius:9}}>{fmtPct(coin.change24h)}</span>
          </div>
        </div>
        {!s.locked&&<RSIBar value={coin.rsi}/>}
        {s.locked&&(
          <div style={{marginTop:10,background:"#E6F1FB",borderRadius:10,padding:"10px 12px"}}>
            <div style={{fontSize:12,color:"#185FA5",marginBottom:4,fontWeight:600}}>🔒 Señal bloqueada</div>
            <div style={{fontSize:11,color:"#185FA5",lineHeight:1.5}}>{s.desc}</div>
            <div style={{marginTop:6,background:"rgba(255,255,255,0.6)",borderRadius:8,padding:"6px 10px",fontSize:11,color:"#185FA5"}}>
              Caída desde entrada: <strong>{s.dropFromEntry.toFixed(1)}%</strong> de {POSITION_LOCK_DROP}% requerido
            </div>
          </div>
        )}
        {!s.locked&&s.pattern&&s.showEntry&&<PatternBadge pattern={s.pattern}/>}
        {!s.locked&&<div style={{marginTop:10,fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.55}}>{s.desc}</div>}
        {s.showEntry&&!s.locked&&(
          <div style={{marginTop:12,background:"var(--color-background-secondary)",borderRadius:12,padding:"10px 12px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
              {[{l:"Entrada",v:fmtPrice(s.entry),c:"var(--color-text-primary)"},{l:"Objetivo",v:fmtPrice(s.exit),c:"#3B6D11"},{l:"Stop loss",v:fmtPrice(s.stop),c:"#A32D2D"}].map(x=>(
                <div key={x.l} style={{textAlign:"center"}}>
                  <div style={{fontSize:9,color:"var(--color-text-tertiary)",marginBottom:2,textTransform:"uppercase",letterSpacing:"0.06em"}}>{x.l}</div>
                  <div style={{fontSize:12,fontWeight:700,color:x.c}}>{x.v}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:10,color:"var(--color-text-tertiary)",textAlign:"center",marginBottom:8}}>Horizonte · {s.days}</div>
            <button onClick={()=>onAddTrade(coin)} style={{width:"100%",padding:"8px",fontSize:12,fontWeight:700,background:ts.btn,color:"#fff",border:"none",borderRadius:9,cursor:"pointer"}}>+ Registrar operación</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MODALS (Trade + Close) ────────────────────────────────────────────────────
function TradeModal({coin,activeCatalog,onSave,onClose}){
  const [f,setF]=useState({
    coinId:coin?.id||activeCatalog[0]?.id,
    coinShort:coin?.short||activeCatalog[0]?.short,
    entryPrice:coin?.price?(coin.price>=1000?coin.price.toFixed(2):coin.price.toFixed(4)):"",
    exitTarget:coin?.signal?.exit?(coin.signal.exit>=1000?coin.signal.exit.toFixed(2):coin.signal.exit.toFixed(4)):"",
    stopLoss:coin?.signal?.stop?(coin.signal.stop>=1000?coin.signal.stop.toFixed(2):coin.signal.stop.toFixed(4)):"",
    amount:"",note:"",date:new Date().toISOString().split("T")[0]
  });

  // 🔑 FIX 1: bloquea scroll del body — evita que iOS rebote el viewport al abrir teclado
  useEffect(()=>{
    const prev=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=prev;};
  },[]);

  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const pickCoin=id=>{const c=activeCatalog.find(x=>x.id===id);set("coinId",id);set("coinShort",c?.short||id);};
  const save=()=>{
    if(!f.entryPrice||!f.amount)return;
    onSave({id:Date.now(),coinId:f.coinId,coinShort:f.coinShort,entryPrice:parseFloat(f.entryPrice),exitTarget:f.exitTarget?parseFloat(f.exitTarget):null,stopLoss:f.stopLoss?parseFloat(f.stopLoss):null,amount:parseFloat(f.amount),note:f.note,date:f.date,status:"open"});
  };

  // 🔑 FIX 2: fontSize 16 en inputs — iOS hace zoom y cierra teclado con fuentes menores a 16px
  const R=({label,k,ph,type="number"})=>(
    <div>
      <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>{label}</label>
      <input
        type={type}
        placeholder={ph}
        value={f[k]}
        onChange={e=>set(k,e.target.value)}
        style={{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16,boxSizing:"border-box"}}
      />
    </div>
  );

  return(
    // 🔑 FIX 3: modal sube desde abajo (bottom sheet) — mucho menos conflicto con teclado en móvil
    // 🔑 FIX 4: onTouchStart con stopPropagation en contenido — evita que tocar un input cierre el modal
    <div
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1000}}
      onClick={e=>e.target===e.currentTarget&&onClose()}
      onTouchStart={e=>{if(e.target!==e.currentTarget)e.stopPropagation();}}
    >
      <div
        style={{background:"var(--color-background-primary)",borderRadius:"20px 20px 0 0",padding:"1.5rem 1.5rem 2rem",width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",WebkitOverflowScrolling:"touch"}}
        onClick={e=>e.stopPropagation()}
      >
        <div style={{width:40,height:4,borderRadius:4,background:"var(--color-border-secondary)",margin:"0 auto 1rem"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.25rem"}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700}}>Nueva operación</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--color-text-secondary)"}}>×</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div>
            <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>Moneda</label>
            <select value={f.coinId} onChange={e=>pickCoin(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16}}>
              {activeCatalog.map(c=><option key={c.id} value={c.id}>{c.short} — {c.name}</option>)}
            </select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <R label="Entrada (USD)" k="entryPrice" ph="0.00"/>
            <R label="Monto (USD)" k="amount" ph="500"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <R label="Objetivo salida" k="exitTarget" ph="0.00"/>
            <R label="Stop loss" k="stopLoss" ph="0.00"/>
          </div>
          <R label="Fecha" k="date" ph="" type="date"/>
          <R label="Nota (opcional)" k="note" ph='ej: RSI bajo + caída 8%' type="text"/>
        </div>
        <div style={{display:"flex",gap:10,marginTop:"1.25rem"}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",borderRadius:10,fontSize:14,cursor:"pointer",background:"var(--color-background-secondary)",border:"none",color:"var(--color-text-secondary)",fontWeight:500}}>Cancelar</button>
          <button onClick={save} disabled={!f.entryPrice||!f.amount} style={{flex:2,padding:"12px",borderRadius:10,fontSize:14,cursor:"pointer",background:f.entryPrice&&f.amount?"#3B6D11":"#bbb",border:"none",color:"#fff",fontWeight:700}}>Guardar operación</button>
        </div>
      </div>
    </div>
  );
}

function CloseModal({trade,onSave,onClose}){
  const [cp,setCp]=useState("");
  const [cd,setCd]=useState(new Date().toISOString().split("T")[0]);

  // 🔑 FIX 1: bloquea scroll del body — evita que iOS rebote el viewport al abrir teclado
  useEffect(()=>{
    const prev=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return()=>{document.body.style.overflow=prev;};
  },[]);

  const pnl=cp&&trade.amount?((parseFloat(cp)-trade.entryPrice)/trade.entryPrice*trade.amount):null;
  const pct=cp?((parseFloat(cp)-trade.entryPrice)/trade.entryPrice*100):null;
  const win=pnl!==null&&pnl>=0;

  return(
    <div
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:1000}}
      onClick={e=>e.target===e.currentTarget&&onClose()}
      onTouchStart={e=>{if(e.target!==e.currentTarget)e.stopPropagation();}}
    >
      <div
        style={{background:"var(--color-background-primary)",borderRadius:"20px 20px 0 0",padding:"1.5rem 1.5rem 2rem",width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",WebkitOverflowScrolling:"touch"}}
        onClick={e=>e.stopPropagation()}
      >
        <div style={{width:40,height:4,borderRadius:4,background:"var(--color-border-secondary)",margin:"0 auto 1rem"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:700}}>Cerrar · {trade.coinShort}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"var(--color-text-secondary)"}}>×</button>
        </div>
        <div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:"1rem",background:"var(--color-background-secondary)",borderRadius:10,padding:"10px 12px"}}>
          Entrada: <strong>{fmtPrice(trade.entryPrice)}</strong> · Invertido: <strong>${(trade.amount||0).toLocaleString()}</strong>
          {trade.note&&<><br/><span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>"{trade.note}"</span></>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>Precio de cierre (USD)</label>
            {/* 🔑 FIX 2: fontSize 16 — evita zoom automático de iOS */}
            <input type="number" placeholder="0.00" value={cp} onChange={e=>setCp(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16,boxSizing:"border-box"}}/>
          </div>
          <div>
            <label style={{fontSize:12,color:"var(--color-text-secondary)",display:"block",marginBottom:4}}>Fecha de cierre</label>
            <input type="date" value={cd} onChange={e=>setCd(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16,boxSizing:"border-box"}}/>
          </div>
          {pnl!==null&&(
            <div style={{background:win?"#EAF3DE":"#FCEBEB",borderRadius:12,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,color:win?"#3B6D11":"#A32D2D",fontWeight:600}}>{win?"Operación ganadora 🎯":"Operación con pérdida"}</div>
                <div style={{fontSize:11,color:win?"#3B6D11":"#A32D2D",opacity:0.8,marginTop:2}}>{fmtPrice(parseFloat(cp))}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:22,fontWeight:800,color:win?"#3B6D11":"#A32D2D"}}>{win?"+":""}{pnl.toFixed(2)} USD</div>
                <div style={{fontSize:13,fontWeight:600,color:win?"#3B6D11":"#A32D2D"}}>{fmtPct(pct)}</div>
              </div>
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:10,marginTop:"1.25rem"}}>
          <button onClick={onClose} style={{flex:1,padding:"12px",borderRadius:10,fontSize:14,cursor:"pointer",background:"var(--color-background-secondary)",border:"none",color:"var(--color-text-secondary)",fontWeight:500}}>Cancelar</button>
          <button onClick={()=>cp&&onSave(trade.id,parseFloat(cp),cd)} disabled={!cp} style={{flex:2,padding:"12px",borderRadius:10,fontSize:14,cursor:"pointer",background:cp?"#3B6D11":"#bbb",border:"none",color:"#fff",fontWeight:700}}>Confirmar cierre</button>
        </div>
      </div>
    </div>
  );
}

// ── CHARTS TAB ────────────────────────────────────────────────────────────────
function ChartsTab({histData,liveCoins,trades,activeCatalog}){
  const [selId,setSelId]=useState(activeCatalog[0]?.id||CATALOG[0].id);
  const [range,setRange]=useState(30);
  const meta=CATALOG.find(c=>c.id===selId);
  const live=liveCoins.find(c=>c.id===selId);
  const hist=histData[selId];
  const openT=trades.find(t=>t.coinId===selId&&t.status==="open");
  const closedT=trades.filter(t=>t.coinId===selId&&t.status==="closed");
  const chartData=hist?hist.slice(-range).map((d,i,arr)=>({date:new Date(d.date).toLocaleDateString("es-CL",{day:"2-digit",month:"short"}),price:d.price,pct:(d.price-arr[0].price)/arr[0].price*100})):[];
  const priceMin=chartData.length?Math.min(...chartData.map(d=>d.price))*0.995:0;
  const priceMax=chartData.length?Math.max(...chartData.map(d=>d.price))*1.005:1;
  const change=chartData.length>=2?(chartData[chartData.length-1].price-chartData[0].price)/chartData[0].price*100:0;
  const isUp=change>=0;
  const Tip=({active,payload,label})=>{if(!active||!payload?.length)return null;return<div style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-secondary)",borderRadius:10,padding:"8px 12px",fontSize:12}}><div style={{color:"var(--color-text-secondary)",marginBottom:2}}>{label}</div><div style={{fontWeight:700,fontSize:14}}>{fmtChartPrice(payload[0]?.value)}</div><div style={{color:payload[1]?.value>=0?"#3B6D11":"#A32D2D",fontSize:11}}>{fmtPct(payload[1]?.value)}</div></div>;};
  return(
    <div>
      <div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>
        {activeCatalog.map(c=>{const lv=liveCoins.find(x=>x.id===c.id);const up=lv&&lv.change24h>=0;return(
          <button key={c.id} onClick={()=>setSelId(c.id)} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:12,cursor:"pointer",border:`1.5px solid ${selId===c.id?c.color:"var(--color-border-tertiary)"}`,background:selId===c.id?c.color+"18":"var(--color-background-primary)",fontWeight:selId===c.id?700:500,fontSize:12,color:selId===c.id?c.color:"var(--color-text-secondary)"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0}}/>
            {c.short}
            {lv&&<span style={{fontSize:10,fontWeight:600,color:up?"#3B6D11":"#A32D2D"}}>{fmtPct(lv.change24h)}</span>}
          </button>);})}
      </div>
      <div style={{background:"var(--color-background-primary)",borderRadius:16,border:"1px solid var(--color-border-tertiary)",padding:"16px 18px",marginBottom:"1rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div><div style={{fontWeight:800,fontSize:18}}>{meta?.name||selId}</div><div style={{fontSize:12,color:"var(--color-text-tertiary)"}}>{meta?.short}/USD · {live?.source||"—"}</div></div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:24,fontWeight:800}}>{live?fmtPrice(live.price):"—"}</div>
            <div style={{fontSize:13,fontWeight:700,color:isUp?"#3B6D11":"#A32D2D",background:isUp?"#EAF3DE":"#FCEBEB",padding:"2px 10px",borderRadius:9,display:"inline-block",marginTop:4}}>{fmtPct(change)} ({range}d)</div>
          </div>
        </div>
        <div style={{display:"flex",gap:5,marginBottom:16}}>
          {[7,14,30,60,90].map(r=><button key={r} onClick={()=>setRange(r)} style={{padding:"5px 11px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",background:range===r?"var(--color-background-secondary)":"none",border:`1px solid ${range===r?"var(--color-border-secondary)":"transparent"}`,color:range===r?"var(--color-text-primary)":"var(--color-text-secondary)"}}>{r}d</button>)}
        </div>
        {chartData.length>0?(
          <div style={{height:220}}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{top:5,right:5,left:0,bottom:0}}>
                <XAxis dataKey="date" tick={{fontSize:10,fill:"var(--color-text-tertiary)"}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                <YAxis domain={[priceMin,priceMax]} tick={{fontSize:10,fill:"var(--color-text-tertiary)"}} tickLine={false} axisLine={false} tickFormatter={v=>fmtChartPrice(v)} width={72}/>
                <Tooltip content={<Tip/>}/>
                {openT&&<ReferenceLine y={openT.entryPrice} stroke="#185FA5" strokeDasharray="4 3" label={{value:"Entrada",position:"right",fontSize:10,fill:"#185FA5"}}/>}
                {openT?.exitTarget&&<ReferenceLine y={openT.exitTarget} stroke="#3B6D11" strokeDasharray="4 3" label={{value:"Objetivo",position:"right",fontSize:10,fill:"#3B6D11"}}/>}
                {openT?.stopLoss&&<ReferenceLine y={openT.stopLoss} stroke="#A32D2D" strokeDasharray="4 3" label={{value:"Stop",position:"right",fontSize:10,fill:"#A32D2D"}}/>}
                <Line dataKey="price" stroke={meta?.color||"#378ADD"} strokeWidth={2} dot={false} activeDot={{r:4,fill:meta?.color}}/>
                <Line dataKey="pct" stroke="transparent" dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        ):<div style={{height:220,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--color-text-tertiary)",fontSize:13}}>Cargando datos históricos…</div>}
      </div>
      {live&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:"1rem"}}>
        {[{l:"RSI actual",v:live.rsi?live.rsi.toFixed(1):"—",c:live.rsi<30?"#3B6D11":live.rsi>70?"#A32D2D":"var(--color-text-primary)",bg:live.rsi<30?"#EAF3DE":live.rsi>70?"#FCEBEB":"var(--color-background-secondary)"},{l:"Cambio 24h",v:fmtPct(live.change24h),c:live.change24h>=0?"#3B6D11":"#A32D2D",bg:live.change24h>=0?"#EAF3DE":"#FCEBEB"},{l:"Señal",v:live.signal?.label||"—",c:TS[live.signal?.tier]?.text||"var(--color-text-primary)",bg:TS[live.signal?.tier]?.bg||"var(--color-background-secondary)"},{l:"Fuente API",v:live.source||"—",c:"#185FA5",bg:"#E6F1FB"}].map(m=>(
          <div key={m.l} style={{background:m.bg,borderRadius:12,padding:"10px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:800,color:m.c}}>{m.v}</div><div style={{fontSize:10,color:m.c,opacity:0.75,marginTop:2,textTransform:"uppercase",letterSpacing:"0.05em"}}>{m.l}</div></div>
        ))}</div>}
      {openT&&<div style={{background:"#E6F1FB",border:"1px solid #378ADD44",borderRadius:14,padding:"12px 16px",marginBottom:"1rem"}}><div style={{fontSize:12,fontWeight:700,color:"#185FA5",marginBottom:8}}>📌 Posición abierta en {meta?.short}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>{[{l:"Entrada",v:fmtPrice(openT.entryPrice)},{l:"Objetivo",v:openT.exitTarget?fmtPrice(openT.exitTarget):"—",c:"#3B6D11"},{l:"Stop loss",v:openT.stopLoss?fmtPrice(openT.stopLoss):"—",c:"#A32D2D"}].map(x=><div key={x.l} style={{background:"rgba(255,255,255,0.7)",borderRadius:9,padding:"8px",textAlign:"center"}}><div style={{fontSize:9,color:"#185FA5",marginBottom:2,textTransform:"uppercase",letterSpacing:"0.05em"}}>{x.l}</div><div style={{fontSize:13,fontWeight:700,color:x.c||"#185FA5"}}>{x.v}</div></div>)}</div></div>}
      {closedT.length>0&&<div style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:14,padding:"12px 16px"}}><div style={{fontSize:12,fontWeight:700,color:"var(--color-text-secondary)",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>Ops. cerradas en {meta?.short}</div>{[...closedT].reverse().map(t=>{const w=(t.pnl||0)>=0;return<div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}><div><div style={{fontSize:12,fontWeight:600}}>{fmtDate(t.date)} → {t.closeDate?fmtDate(t.closeDate):"—"}</div><div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{fmtPrice(t.entryPrice)} → {fmtPrice(t.closePrice)}</div></div><div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:700,color:w?"#3B6D11":"#A32D2D"}}>{w?"+":""}{(t.pnl||0).toFixed(2)} USD</div><div style={{fontSize:11,color:w?"#3B6D11":"#A32D2D"}}>{fmtPct(t.pnlPct)}</div></div></div>;})}</div>}
    </div>
  );
}

// ── HISTORY TAB ───────────────────────────────────────────────────────────────
function HistoryTab({trades,coinData,histData,onClose,onDelete,onAddTrade}){
  const open=trades.filter(t=>t.status==="open"),closed=trades.filter(t=>t.status==="closed");
  const totalPnl=closed.reduce((a,t)=>a+(t.pnl||0),0);
  const wins=closed.filter(t=>(t.pnl||0)>0).length;
  const winRate=closed.length>0?(wins/closed.length*100).toFixed(0):null;
  const exposed=open.reduce((a,t)=>a+(t.amount||0),0);
  const Row=({trade})=>{
    const isClosed=trade.status==="closed";const meta=CATALOG.find(c=>c.id===trade.coinId);
    const live=coinData[trade.coinId];const curr=live?.price;
    const lpp=curr&&trade.entryPrice?(curr-trade.entryPrice)/trade.entryPrice*100:null;
    const lpnl=lpp!==null?lpp/100*trade.amount:null;
    const win=isClosed?(trade.pnl||0)>0:(lpnl!==null?lpnl>0:false);
    const hist=histData[trade.coinId];
    const es=!isClosed&&hist&&live?detectExitSignal(hist,live.rsi,live.change24h):null;
    return(
      <div style={{marginBottom:12}}>
        {!isClosed&&<ExitAlert trade={trade} currentPrice={curr} exitSignal={es} onClose={onClose}/>}
        <div style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:14,padding:"13px 15px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:9,height:9,borderRadius:"50%",background:meta?.color||"#888",flexShrink:0}}/><div><span style={{fontWeight:700,fontSize:14}}>{trade.coinShort}</span><span style={{fontSize:11,color:"var(--color-text-tertiary)",marginLeft:6}}>{fmtDate(trade.date)} · {fmtRelative(trade.date)}</span></div></div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
              {isClosed?<span style={{fontSize:15,fontWeight:800,color:win?"#3B6D11":"#A32D2D"}}>{win?"+":""}{(trade.pnl||0).toFixed(2)} USD</span>:<span style={{fontSize:11,background:"#FAEEDA",color:"#854F0B",padding:"3px 9px",borderRadius:8,fontWeight:600}}>Abierta</span>}
              {!isClosed&&lpnl!==null&&<span style={{fontSize:12,fontWeight:700,color:lpnl>=0?"#3B6D11":"#A32D2D"}}>Live: {lpnl>=0?"+":""}{lpnl.toFixed(2)} USD ({fmtPct(lpp)})</span>}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:8}}>
            {[{l:"ENTRADA",v:fmtPrice(trade.entryPrice)},{l:isClosed?"SALIDA":"OBJETIVO",v:isClosed?fmtPrice(trade.closePrice):(trade.exitTarget?fmtPrice(trade.exitTarget):"—"),c:isClosed?(win?"#3B6D11":"#A32D2D"):"#3B6D11"},{l:"STOP",v:trade.stopLoss?fmtPrice(trade.stopLoss):"—",c:"#A32D2D"},{l:"MONTO",v:"$"+(trade.amount||0).toLocaleString()}].map(x=>(
              <div key={x.l} style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"7px 9px"}}><div style={{fontSize:9,color:"var(--color-text-tertiary)",marginBottom:3,letterSpacing:"0.05em"}}>{x.l}</div><div style={{fontSize:12,fontWeight:700,color:x.c||"var(--color-text-primary)"}}>{x.v}</div></div>
            ))}
          </div>
          {!isClosed&&curr&&<div style={{marginBottom:8,background:"var(--color-background-secondary)",borderRadius:8,padding:"7px 10px",display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:"var(--color-text-secondary)"}}>Precio actual {trade.coinShort}</span><span style={{fontSize:12,fontWeight:700}}>{fmtPrice(curr)}</span></div>}
          {trade.note&&<div style={{fontSize:11,color:"var(--color-text-secondary)",fontStyle:"italic",marginBottom:8}}>"{trade.note}"</div>}
          {isClosed&&trade.pnlPct!==undefined&&<div style={{fontSize:12,color:win?"#3B6D11":"#A32D2D",fontWeight:600,marginBottom:8}}>{fmtPct(trade.pnlPct)} retorno · Cerrada {fmtDate(trade.closeDate)}</div>}
          {!isClosed&&<div style={{display:"flex",gap:8}}><button onClick={()=>onClose(trade)} style={{flex:2,padding:"8px",borderRadius:9,fontSize:12,fontWeight:600,cursor:"pointer",background:"#EAF3DE",border:"none",color:"#3B6D11"}}>Cerrar operación</button><button onClick={()=>onDelete(trade.id)} style={{flex:1,padding:"8px",borderRadius:9,fontSize:12,cursor:"pointer",background:"var(--color-background-secondary)",border:"none",color:"var(--color-text-tertiary)"}}>Eliminar</button></div>}
        </div>
      </div>
    );
  };
  if(!trades.length)return<div style={{textAlign:"center",padding:"4rem 2rem",color:"var(--color-text-secondary)"}}><div style={{fontSize:48,marginBottom:14}}>📋</div><div style={{fontSize:16,fontWeight:600,marginBottom:6}}>Sin operaciones aún</div><div style={{fontSize:13}}>Ve a Señales y registra tu primera operación.</div><button onClick={onAddTrade} style={{marginTop:"1rem",padding:"10px 22px",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",background:"#3B6D11",border:"none",color:"#fff"}}>+ Nueva operación</button></div>;
  return(
    <div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8,marginBottom:"1.25rem"}}>
        {[{l:"P&L total",v:(totalPnl>=0?"+":"")+"$"+totalPnl.toFixed(2),c:totalPnl>0?"#3B6D11":totalPnl<0?"#A32D2D":"var(--color-text-secondary)",bg:totalPnl>0?"#EAF3DE":totalPnl<0?"#FCEBEB":"var(--color-background-secondary)"},{l:"Win rate",v:winRate!==null?winRate+"%":"—",c:"#185FA5",bg:"#E6F1FB"},{l:"Cerradas",v:closed.length,c:"var(--color-text-secondary)",bg:"var(--color-background-secondary)"},{l:"Capital expuesto",v:exposed>0?"$"+exposed.toLocaleString():"—",c:"#854F0B",bg:"#FAEEDA"}].map(m=>(
          <div key={m.l} style={{background:m.bg,borderRadius:12,padding:"12px",textAlign:"center"}}><div style={{fontSize:18,fontWeight:800,color:m.c}}>{m.v}</div><div style={{fontSize:10,color:m.c,opacity:0.75,marginTop:2,textTransform:"uppercase",letterSpacing:"0.05em"}}>{m.l}</div></div>
        ))}
      </div>
      {open.length>0&&<div style={{marginBottom:"1rem"}}><div style={{fontSize:12,fontWeight:700,color:"var(--color-text-secondary)",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Abiertas · {open.length}</div>{open.map(t=><Row key={t.id} trade={t}/>)}</div>}
      {closed.length>0&&<div><div style={{fontSize:12,fontWeight:700,color:"var(--color-text-secondary)",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.07em"}}>Historial · {closed.length}</div>{[...closed].reverse().map(t=><Row key={t.id} trade={t}/>)}</div>}
    </div>
  );
}

// ── GUIDE TAB ─────────────────────────────────────────────────────────────────
function GuiaTab({appStatus,apiStatus}){
  const S=({title,children})=><div style={{background:"var(--color-background-primary)",border:"1px solid var(--color-border-tertiary)",borderRadius:16,padding:"16px 18px",marginBottom:12}}><div style={{fontWeight:700,fontSize:15,marginBottom:12}}>{title}</div>{children}</div>;
  const T=({term,color,bg,children})=><div style={{display:"flex",gap:12,alignItems:"flex-start",padding:"9px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}><div style={{flexShrink:0,padding:"3px 10px",borderRadius:20,background:bg||"var(--color-background-secondary)",color:color||"var(--color-text-secondary)",fontSize:11,fontWeight:700,minWidth:80,textAlign:"center"}}>{term}</div><div style={{fontSize:13,color:"var(--color-text-secondary)",lineHeight:1.6,flex:1}}>{children}</div></div>;
  return(
    <div>
      <S title="Estado de la app y APIs">
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
          {[
            {l:"API principal",v:"Binance",ok:true},{l:"API de respaldo",v:"CoinGecko",ok:true},
            {l:"Actualización",v:"Cada 30 seg",ok:true},{l:"Operaciones guardadas",v:appStatus.count+" ops.",ok:true},
          ].map(s=><div key={s.l} style={{background:s.ok?"#EAF3DE":"#FCEBEB",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:13,fontWeight:700,color:s.ok?"#3B6D11":"#A32D2D"}}>{s.v}</div><div style={{fontSize:11,color:s.ok?"#3B6D11":"#A32D2D",opacity:0.75}}>{s.l}</div></div>)}
        </div>
        <div style={{background:"#E6F1FB",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#185FA5",lineHeight:1.6}}>
          <strong>Binance API</strong>: 1,200 peticiones/min — sin límite relevante para esta app. Datos en tiempo real, latencia baja. Ideal para trading.<br/>
          <strong>CoinGecko (fallback)</strong>: 30 pet./min — se activa automáticamente si Binance falla o no tiene la moneda solicitada. El badge en cada card muestra la fuente activa.
        </div>
      </S>
      <S title="Señales — qué significa cada una">
        <T term="Entrada fuerte" color="#27500A" bg="#EAF3DE">RSI bajo 30 Y caída del día 5–22%. El activo está muy sobrevendido. Alta probabilidad de rebote según análisis histórico de 90 días.</T>
        <T term="Posible entrada" color="#3B6D11" bg="#EAF3DE">RSI bajo 38 con caída mayor a 3%, o caída 5–22% con historial de rebote en +65% de casos. Señal moderada — confirmar antes de entrar.</T>
        <T term="Caída histórica" color="#3B6D11" bg="#EAF3DE">Caída en rango similar a eventos históricos con alta tasa de recuperación, aunque el RSI esté neutro. Señal basada en patrón estadístico de 90 días.</T>
        <T term="Esperar" color="#444441" bg="#F1EFE8">Zona neutra. Sin señal operacional. Mantener monitoreo.</T>
        <T term="Precaución" color="#633806" bg="#FAEEDA">RSI elevado (62+) con subida fuerte del día. Posible techo en formación. No entrar.</T>
        <T term="Evitar" color="#791F1F" bg="#FCEBEB">RSI sobre 72. Sobrecomprado. No entrar — alta probabilidad de corrección.</T>
        <T term="Pos. abierta" color="#0C447C" bg="#E6F1FB">Ya tienes esta moneda comprada. Señal bloqueada hasta que el precio caiga {POSITION_LOCK_DROP}% adicional desde tu entrada.</T>
      </S>
      <S title="Indicadores técnicos">
        <T term="RSI">Relative Strength Index. Escala 0–100. Calculado con 14 períodos en velas de 4 horas. Bajo 30 = sobrevendido (señal de compra). Sobre 70 = sobrecomprado (señal de venta). Entre 30–70 = zona neutra.</T>
        <T term="Caída %">Variación negativa en 24 horas. La app detecta caídas de 4–22% como eventos de potencial rebote. Menores al 4% son ruido normal. Mayores al 22% pueden indicar problema estructural.</T>
        <T term="Patrón 90d">Análisis estadístico: busca en los últimos 90 días cuántas veces ocurrió una caída similar y qué porcentaje rebotó en 2–6 días. Muestra: % de rebote, ganancia promedio, y días promedio hasta recuperación.</T>
        <T term="Score salida">Puntaje 0–100 de urgencia para cerrar posición. Combina RSI actual, subida reciente de 3 y 6 días, y patrones históricos. +45 = alerta naranja. +70 = alerta roja urgente.</T>
      </S>
      <S title="Términos de operaciones">
        <T term="Entrada">Precio de compra. Base para calcular P&L.</T>
        <T term="Stop loss">Precio límite de pérdida. Cierra la posición si el mercado va en contra. Sugerido: −2.5% de la entrada.</T>
        <T term="Objetivo">Precio de venta para tomar ganancia. Calculado en base a la volatilidad reciente del activo (3%–9% sobre la entrada).</T>
        <T term="P&L">Profit & Loss. Diferencia en USD entre precio de cierre y entrada, multiplicado por el monto invertido.</T>
        <T term="Win rate">Porcentaje de operaciones cerradas con ganancia sobre el total de cierres.</T>
        <T term="Señal bloqueada">Protección automática: si ya tienes una moneda, la señal se bloquea para evitar promediar hacia arriba. Se reactiva solo si el precio cae {POSITION_LOCK_DROP}% desde tu entrada, permitiendo promediar hacia abajo.</T>
      </S>
      <S title="Gestión de monedas">
        <div style={{fontSize:13,color:"var(--color-text-secondary)",lineHeight:1.7}}>
          Puedes agregar o eliminar monedas desde el botón <strong style={{color:"var(--color-text-primary)"}}>Monedas ⚙</strong> en la barra superior. Hay un catálogo de {CATALOG.length} criptomonedas disponibles. Puedes seleccionar entre 1 y 12 monedas simultáneamente. La selección se guarda automáticamente entre sesiones.
        </div>
      </S>
      <div style={{background:"#FAEEDA",border:"1px solid #EF9F2766",borderRadius:14,padding:"12px 16px",fontSize:12,color:"#633806",lineHeight:1.7}}>
        ⚠️ Esta app es una herramienta de análisis técnico basada en datos históricos. El análisis estadístico no garantiza resultados futuros. Los mercados cripto son altamente volátiles. Usa siempre stop loss y opera solo con capital que puedas perder.
      </div>
    </div>
  );
}

// ── CSS VARIABLES ─────────────────────────────────────────────────────────────
const CSS_VARS = `
  :root {
    --color-background-primary: #ffffff;
    --color-background-secondary: #f5f5f3;
    --color-background-tertiary: #ebebea;
    --color-background-success: #EAF3DE;
    --color-background-danger: #FCEBEB;
    --color-background-warning: #FAEEDA;
    --color-background-info: #E6F1FB;
    --color-text-primary: #1a1a18;
    --color-text-secondary: #5f5e5a;
    --color-text-tertiary: #888780;
    --color-text-success: #3B6D11;
    --color-text-danger: #A32D2D;
    --color-text-warning: #633806;
    --color-text-info: #185FA5;
    --color-border-tertiary: rgba(0,0,0,0.1);
    --color-border-secondary: rgba(0,0,0,0.2);
    --color-border-primary: rgba(0,0,0,0.3);
    --border-radius-md: 8px;
    --border-radius-lg: 12px;
    --border-radius-xl: 16px;
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { background: #f5f5f3; }
  input, select, textarea, button {
    font-family: inherit;
    outline: none;
  }
  input, select {
    background: #ffffff;
    border: 1px solid rgba(0,0,0,0.15);
    color: #1a1a18;
    border-radius: 10px;
  }
  input:focus, select:focus {
    border-color: rgba(0,0,0,0.3);
  }
  button { background: none; border: 1px solid rgba(0,0,0,0.15); color: #1a1a18; cursor: pointer; border-radius: 8px; }
`;

function InjectCSS() {
  useEffect(()=>{
    const s=document.createElement("style");
    s.textContent=CSS_VARS;
    document.head.appendChild(s);
    return()=>s.remove();
  },[]);
  return null;
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("signals");
  const [activeIds,setActiveIds]=useState(DEFAULT_IDS);
  const [coins,setCoins]=useState([]);
  const [histData,setHistData]=useState({});
  const [loading,setLoading]=useState(true);
  const [countdown,setCountdown]=useState(30);
  const [error,setError]=useState(null);
  const [lastUpdate,setLastUpdate]=useState(null);
  const [trades,setTrades]=useState([]);
  const [addModal,setAddModal]=useState(null);
  const [closeModal,setCloseModal]=useState(null);
  const [coinManager,setCoinManager]=useState(false);
  const [notifPerm,setNotifPerm]=useState(typeof Notification!=="undefined"?Notification.permission:"unsupported");
  const [toastMsg,setToastMsg]=useState(null);
  const prevSignals=useRef({});
  const prevExitAlerts=useRef(new Set());
  const lastHistFetch=useRef(0);

  useEffect(()=>{
    function load(){
      try{const v=localStorage.getItem(STORAGE_KEY);if(v)setTrades(JSON.parse(v));}catch(_){}
      try{const v=localStorage.getItem(COINS_KEY);if(v)setActiveIds(JSON.parse(v));}catch(_){}
    }
    load();
  },[]);

  const saveTrades=useCallback(t=>{setTrades(t);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(t));}catch(_){};},[] );
  const saveCoins=useCallback(ids=>{setActiveIds(ids);try{localStorage.setItem(COINS_KEY,JSON.stringify(ids));}catch(_){};setCoinManager(false);},[]);

  const activeCatalog=CATALOG.filter(c=>activeIds.includes(c.id));

  const fetchHistorical=useCallback(async(ids)=>{
    if(Date.now()-lastHistFetch.current<HIST_TTL)return;
    lastHistFetch.current=Date.now();
    let cached={};
    try{const v=localStorage.getItem(HIST_CACHE_KEY);if(v){const{ts,data}=JSON.parse(v);if(Date.now()-ts<HIST_TTL){setHistData(data);return;}cached=data||{};}}catch(_){}
    const result={...cached};
    const toFetch=ids.filter(id=>!result[id]);
    for(const id of toFetch){
      const coin=CATALOG.find(c=>c.id===id);if(!coin)continue;
      const d=await fetchHistoricalCoin(coin);
      if(d)result[id]=d;
      await new Promise(r=>setTimeout(r,300));
    }
    setHistData(result);
    try{localStorage.setItem(HIST_CACHE_KEY,JSON.stringify({ts:Date.now(),data:result}));}catch(_){}
  },[]);

  const fetchAll=useCallback(async()=>{
    setError(null);
    try{
      const results=await Promise.all(activeCatalog.map(async coin=>{
        const live=await fetchLiveCoin(coin);
        if(!live)return{...coin,price:0,change24h:0,rsi:null,source:"Error",signal:getSignal(null,0,0,null,null)};
        const drop=-live.change24h;
        const pattern=(drop>=4&&drop<=22&&histData[coin.id])?analyzePattern(histData[coin.id]):null;
        const openTrade=trades.find(t=>t.coinId===coin.id&&t.status==="open");
        let posLock=null;
        if(openTrade){const dfe=Math.max(0,(openTrade.entryPrice-live.price)/openTrade.entryPrice*100);posLock={trade:openTrade,dropFromEntry:dfe,unlocked:dfe>=POSITION_LOCK_DROP};}
        return{...coin,...live,signal:getSignal(live.rsi,live.change24h,live.price,pattern,posLock)};
      }));
      setCoins(results.sort((a,b)=>{const o={"strong-buy":0,"buy":1,"caution":2,"neutral":3,"sell":4,"locked":5};return(o[a.signal.tier]??5)-(o[b.signal.tier]??5);}));

      results.forEach(coin=>{
        const prev=prevSignals.current[coin.id];
        const cur=coin.signal.tier;
        const isEntry=cur==="strong-buy"||cur==="buy";
        const wasEntry=prev==="strong-buy"||prev==="buy";
        if(isEntry&&prev&&!wasEntry){
          const label=cur==="strong-buy"?"🟢 ENTRADA FUERTE":"🟡 Posible entrada";
          sendNotification(`${label} — ${coin.short}`,`${coin.name} a ${fmtPrice(coin.price)} · ${coin.signal.desc.slice(0,80)}`);
          setToastMsg({type:cur,text:`${label}: ${coin.short} a ${fmtPrice(coin.price)}`});
          setTimeout(()=>setToastMsg(null),6000);
        }
        prevSignals.current[coin.id]=cur;
      });

      setLastUpdate(new Date());setCountdown(30);
    }catch(e){setError("Error al cargar datos: "+e.message);}
    finally{setLoading(false);}
    fetchHistorical(activeIds);
  },[activeCatalog,histData,trades,activeIds,fetchHistorical]);

  useEffect(()=>{if(activeCatalog.length>0)fetchAll();},[activeIds]);// eslint-disable-line
  useEffect(()=>{const t=setInterval(()=>setCountdown(c=>{if(c<=1){fetchAll();return 30;}return c-1;}),1000);return()=>clearInterval(t);},[fetchAll]);

  const handleSaveTrade=t=>{saveTrades([...trades,t]);setAddModal(null);setTab("history");};
  const handleCloseTrade=(id,cp,cd)=>{saveTrades(trades.map(t=>{if(t.id!==id)return t;const pnl=(cp-t.entryPrice)/t.entryPrice*t.amount,pnlPct=(cp-t.entryPrice)/t.entryPrice*100;return{...t,status:"closed",closePrice:cp,closeDate:cd,pnl,pnlPct};}));setCloseModal(null);};
  const handleDeleteTrade=id=>saveTrades(trades.filter(t=>t.id!==id));

  const coinMap=Object.fromEntries(coins.map(c=>[c.id,c]));
  useEffect(()=>{requestNotifPermission().then(p=>setNotifPerm(p));},[]);

  useEffect(()=>{
    trades.forEach(t=>{
      if(t.status!=="open")return;
      const l=coinMap[t.coinId];if(!l?.price)return;
      const p=(l.price-t.entryPrice)/t.entryPrice*100;if(p<6)return;
      const h=histData[t.coinId];if(!h)return;
      const es=detectExitSignal(h,l.rsi,l.change24h);
      if(!es||es.score<70)return;
      const key=t.id+"_exit_"+Math.round(p);
      if(!prevExitAlerts.current.has(key)){
        prevExitAlerts.current.add(key);
        sendNotification(`🔔 SEÑAL DE SALIDA — ${t.coinShort}`,`Ganancia actual: +${p.toFixed(1)}%. Score: ${es.score}/100. ${es.reasons.join(", ")}`);
        setToastMsg({type:"exit",text:`🔔 Señal de salida: ${t.coinShort} +${p.toFixed(1)}% — ${es.reasons[0]||""}`});
        setTimeout(()=>setToastMsg(null),8000);
      }
    });
  },[coinMap,trades,histData]);// eslint-disable-line

  const openCount=trades.filter(t=>t.status==="open").length;
  const totalPnl=trades.filter(t=>t.status==="closed").reduce((a,t)=>a+(t.pnl||0),0);
  const entrySignals=coins.filter(c=>c.signal.tier==="strong-buy"||c.signal.tier==="buy").length;
  const exitAlerts=trades.filter(t=>{
    if(t.status!=="open")return false;const l=coinMap[t.coinId];if(!l?.price)return false;
    const p=(l.price-t.entryPrice)/t.entryPrice*100;if(p<6)return false;
    const h=histData[t.coinId];if(!h)return false;
    const es=detectExitSignal(h,l.rsi,l.change24h);return es&&es.score>=45;
  }).length;

  const TABS=[
    {key:"signals",label:"Señales",badge:entrySignals>0?entrySignals:null,bBg:"#EAF3DE",bC:"#3B6D11"},
    {key:"charts",label:"Gráficos",badge:null},
    {key:"history",label:"Historial",badge:exitAlerts>0?exitAlerts:openCount>0?openCount:null,bBg:exitAlerts>0?"#FCEBEB":"#FAEEDA",bC:exitAlerts>0?"#A32D2D":"#854F0B"},
    {key:"guide",label:"Guía",badge:null},
  ];

  return(
    <div style={{minHeight:"100vh",background:"#f5f5f3",fontFamily:"var(--font-sans)"}}>
      <InjectCSS />
      {/* HEADER */}
      <div style={{background:"#ffffff",borderBottom:"1px solid #e5e5e3",padding:"0 1rem",position:"sticky",top:0,zIndex:500,boxShadow:"0 1px 0 #e5e5e3"}}>
        <div style={{maxWidth:960,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,gap:8,background:"#ffffff"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <div style={{width:30,height:30,borderRadius:9,background:"#3B6D11",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>📈</div>
            <div>
              <div style={{fontWeight:800,fontSize:14}}>CryptoSignals</div>
              <div style={{fontSize:9,color:"var(--color-text-tertiary)"}}>Binance + CoinGecko</div>
            </div>
          </div>
          <div style={{display:"flex",gap:3,flexShrink:0}}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",background:tab===t.key?"#f0f0ee":"none",border:tab===t.key?"1px solid #d4d3cb":"1px solid transparent",color:tab===t.key?"#2c2c2a":"#888780"}}>
                {t.label}
                {t.badge!==null&&<span style={{fontSize:10,fontWeight:700,background:t.bBg,color:t.bC,borderRadius:10,padding:"1px 5px"}}>{t.badge}</span>}
              </button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button
              onClick={()=>requestNotifPermission().then(p=>{setNotifPerm(p);if(p==="granted"){setToastMsg({type:"ok",text:"Notificaciones activadas ✓"});setTimeout(()=>setToastMsg(null),3000);}})}
              title={notifPerm==="granted"?"Notificaciones activas":"Activar notificaciones"}
              style={{padding:"7px 10px",borderRadius:10,fontSize:14,cursor:"pointer",background:notifPerm==="granted"?"#EAF3DE":"var(--color-background-secondary)",border:`1px solid ${notifPerm==="granted"?"#97C45966":"#e5e5e3"}`,color:notifPerm==="granted"?"#3B6D11":"#888780"}}>
              {notifPerm==="granted"?"🔔":"🔕"}
            </button>
            <button onClick={()=>setCoinManager(true)} style={{padding:"7px 11px",borderRadius:10,fontSize:12,fontWeight:600,cursor:"pointer",background:"#f5f5f3",border:"1px solid #e5e5e3",color:"#444441"}}>
              Monedas ⚙
            </button>
            <button onClick={()=>setAddModal({})} style={{padding:"7px 12px",borderRadius:10,fontSize:12,fontWeight:700,cursor:"pointer",background:"#3B6D11",border:"none",color:"#fff"}}>
              + Operación
            </button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:960,margin:"0 auto",padding:"1rem"}}>

        {notifPerm==="default"&&(
          <div style={{background:"#E6F1FB",border:"1px solid #378ADD44",borderRadius:12,padding:"10px 16px",marginBottom:"1rem",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13}}>
            <span style={{color:"#185FA5"}}>🔔 Activa notificaciones para recibir alertas de entrada y salida en tu dispositivo.</span>
            <button onClick={()=>requestNotifPermission().then(p=>setNotifPerm(p))} style={{background:"#185FA5",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0,marginLeft:12}}>Activar</button>
          </div>
        )}

        {toastMsg&&(
          <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",zIndex:999,background:toastMsg.type==="strong-buy"?"#3B6D11":toastMsg.type==="buy"?"#639922":toastMsg.type==="exit"?"#A32D2D":"#185FA5",color:"#fff",padding:"12px 20px",borderRadius:14,fontSize:13,fontWeight:600,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",maxWidth:"90vw",textAlign:"center",lineHeight:1.4}}>
            {toastMsg.text}
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:"1rem"}}>
          {[
            {l:"Señales activas",v:entrySignals>0?entrySignals+" monedas":"Ninguna",c:entrySignals>0?"#3B6D11":"var(--color-text-secondary)",bg:entrySignals>0?"#EAF3DE":"var(--color-background-secondary)"},
            {l:"Alertas de salida",v:exitAlerts>0?exitAlerts+" ⚡":"Ninguna",c:exitAlerts>0?"#A32D2D":"var(--color-text-secondary)",bg:exitAlerts>0?"#FCEBEB":"var(--color-background-secondary)"},
            {l:"P&L acumulado",v:(totalPnl>=0?"+":"")+"$"+totalPnl.toFixed(2),c:totalPnl>0?"#3B6D11":totalPnl<0?"#A32D2D":"var(--color-text-secondary)",bg:totalPnl>0?"#EAF3DE":totalPnl<0?"#FCEBEB":"var(--color-background-secondary)"},
            {l:"Actualiza en",v:countdown+"s",c:"var(--color-text-secondary)",bg:"var(--color-background-secondary)"},
          ].map(m=><div key={m.l} style={{background:m.bg,borderRadius:12,padding:"10px 14px"}}><div style={{fontSize:10,color:m.c,opacity:0.75,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{m.l}</div><div style={{fontSize:15,fontWeight:800,color:m.c}}>{m.v}</div></div>)}
        </div>

        {error&&<div style={{background:"#FCEBEB",color:"#A32D2D",borderRadius:12,padding:"12px 16px",marginBottom:"1rem",fontSize:13,lineHeight:1.5,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{error}</span><button onClick={fetchAll} style={{background:"#A32D2D",color:"#fff",border:"none",borderRadius:8,padding:"5px 12px",fontSize:12,cursor:"pointer",flexShrink:0,marginLeft:10}}>Reintentar</button></div>}

        {tab==="signals"&&(loading&&coins.length===0?<div style={{textAlign:"center",padding:"4rem",color:"var(--color-text-secondary)"}}><div style={{fontSize:36,marginBottom:10}}>⏳</div><div style={{fontSize:14}}>Conectando con Binance y CoinGecko…</div><div style={{fontSize:12,color:"var(--color-text-tertiary)",marginTop:6}}>Descargando 90 días de histórico para análisis de patrones</div></div>:(<>
          {lastUpdate&&<div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:"0.75rem",textAlign:"right"}}>Actualizado {lastUpdate.toLocaleTimeString("es-CL")} · {activeIds.length} monedas</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(275px,1fr))",gap:12}}>
            {coins.map(coin=><CoinCard key={coin.id} coin={coin} onAddTrade={c=>setAddModal(c)}/>)}
          </div>
        </>))}

        {tab==="charts"&&<ChartsTab histData={histData} liveCoins={coins} trades={trades} activeCatalog={activeCatalog}/>}
        {tab==="history"&&<HistoryTab trades={trades} coinData={coinMap} histData={histData} onClose={t=>setCloseModal(t)} onDelete={handleDeleteTrade} onAddTrade={()=>setAddModal({})}/>}
        {tab==="guide"&&<GuiaTab appStatus={{count:trades.length}} apiStatus={{}}/>}

        <p style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:"1.5rem",lineHeight:1.6,textAlign:"center"}}>
          Binance API (principal) + CoinGecko (fallback) · RSI 14p velas 4h · Análisis estadístico 90 días · No es asesoramiento financiero
        </p>
      </div>

      {addModal!==null&&<TradeModal coin={addModal?.id?addModal:null} activeCatalog={activeCatalog} onSave={handleSaveTrade} onClose={()=>setAddModal(null)}/>}
      {closeModal&&<CloseModal trade={closeModal} onSave={handleCloseTrade} onClose={()=>setCloseModal(null)}/>}
      {coinManager&&<CoinManagerModal activeIds={activeIds} onSave={saveCoins} onClose={()=>setCoinManager(false)}/>}
    </div>
  );
}