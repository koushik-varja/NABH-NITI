import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Activity,Airplay,ArrowRight,ArrowUpRight,BarChart3,BookOpen,BrainCircuit,Check,Clock3,CloudLightning,Compass,Download,FileBarChart2,GitCompareArrows,HeartPulse,History,Maximize2,Minimize2,Clapperboard,Eye,Building2,Layers3,LayoutDashboard,MapPin,MessageSquare,Pause,Play,Plus,Radio,RefreshCcw,RotateCcw,Scale,Settings2,Shield,ShieldAlert,ShieldCheck,SlidersHorizontal,Sparkles,Sun,Moon,Target,Users,Wifi,WifiOff,Zap} from 'lucide-react';
import Scene,{type ViewPrefs} from './Scene';
import PolicyGuide from './PolicyGuide';
import {displayFleet} from './visuals';
import type {Comparison,Drone,Frame,HistoryPoint,Norm} from './types';
import {COLORS,INITIAL,MODE_LABELS,SCENARIO_LABELS} from './types';

// Vite development runs separately on :5173. In the production bundle,
// FastAPI serves both the frontend and API from the same origin on :8000.
// An explicit VITE_API_BASE_URL can override this for separate deployments.
const API=(import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:8000` : window.location.origin)
).replace(/\/$/, '');
const WS=`${API.replace(/^http/, 'ws')}/ws`;
const modes=['nabh','central','static'] as const;
const scenarios=[{id:'medical',label:'Medical priority',subtitle:'Activate priority corridor',icon:HeartPulse,color:'rose'},
 {id:'festival',label:'Festival surge',subtitle:'Inject +85 missions',icon:Users,color:'amber'},
 {id:'storm',label:'Weather disruption',subtitle:'Close 3D airspace cells',icon:CloudLightning,color:'blue'},
 {id:'congestion',label:'Peak congestion',subtitle:'Inject +110 missions',icon:Activity,color:'purple'},
 {id:'failure',label:'Failure + blackout',subtitle:'Degrade sector connectivity',icon:Radio,color:'mint'},
 {id:'selfish',label:'Selfish behavior',subtitle:'40% strategic bidders',icon:Zap,color:'amber'}] as const;
const firstCaps=(s:string)=>s.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const n=(a:number|undefined|null,digits=0)=>a==null?'-':a.toLocaleString(undefined,{maximumFractionDigits:digits,minimumFractionDigits:digits});
type Counterfactual={checkpoint_tick:number;seed:number;steps:number;results:{policy:string;metrics:Frame['metrics'];samples:{tick:number;drones:{id:number;kind:string;pos:[number,number,number]}[];norms:number}[]}[]};

function TinyGraph({data,keyName,color='#57e3ef',height=56}:{data:HistoryPoint[];keyName:keyof HistoryPoint;color?:string;height?:number}){
 const values=data.slice(-50).map(p=>Number(p[keyName]));
 if(values.length<2)return <div className="graph-placeholder">Waiting for telemetry data...</div>;
 const min=Math.min(...values),max=Math.max(...values),delta=Math.max(.001,max-min),width=300;
 const pts=values.map((v,i)=>`${(i/(values.length-1))*width},${height-7-((v-min)/delta)*(height-15)}`).join(' ');
 const last=pts.split(' ').at(-1)?.split(',')||['0','0'];
 return <svg className="tiny-graph" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={`${String(keyName)} trend`}>
  <line x1="0" y1={height-7} x2={width} y2={height-7} stroke="#334b5a" strokeDasharray="3 5"/>
  <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={pts}/>
  <circle cx={last[0]} cy={last[1]} r="3.2" fill={color}/>
 </svg>;
}
function Metric({icon:Icon,label,value,meta,color='cyan',data,plot}:{icon:typeof Activity;label:string;value:string|number;meta:string;color?:string;data?:HistoryPoint[];plot?:keyof HistoryPoint}){
 return <div className="metric-card"><div className="metric-head"><span>{label}</span><Icon size={16} className={`ic-${color}`}/></div>
  <div className="metric-val">{value}</div><div className="metric-foot"><span>{meta}</span></div>
  {data&&plot&&<TinyGraph data={data} keyName={plot} color={color==='rose'?'#ff6b87':color==='mint'?'#58dcb0':'#66dced'} height={35}/>}</div>;
}
function Badge({children,tone='muted'}:{children:ReactNode;tone?:string}){return <span className={`pill pill-${tone}`}>{children}</span>}
function DroneInspector({drone,frame}:{drone:Drone|undefined;frame:Frame}){
 if(!drone)return <div className="no-agent"><div className="empty-icon"><Target size={28}/></div><b>Awaiting selection</b><p>Click any real 3D drone in the airspace to inspect its live state, bids and reasoning.</p><div className="inspector-hint">TIP  |  Drag to orbit, scroll to zoom</div></div>;
 const activeNorm=frame.norms.find(n=>n.sector===drone.sector);
 return <div className="agent-inspector">
  <div className="agent-heading"><div className="drone-avatar" style={{color:COLORS[drone.kind]||'#fff',borderColor:COLORS[drone.kind]}}><Airplay size={27}/></div>
   <div><div className="agent-id">UAV-{String(drone.id).padStart(3,'0')}</div><span className="subtle">{firstCaps(drone.kind)} class  |  {drone.sector}</span></div>
   <Badge tone={drone.waiting>2?'amber':drone.kind==='medical'?'rose':'mint'}>{drone.status}</Badge></div>
  <div className="battery-row"><div><span className="eyebrow">BATTERY RESERVE</span><b>{n(drone.battery,1)}%</b></div><div className="battery-track"><span style={{width:`${drone.battery}%`,background:drone.battery<20?'#ff6685':'#5be3c0'}}/></div></div>
  <div className="inspector-details">
   <div><small>Mission priority</small><strong>{drone.priority}/10</strong></div><div><small>Priority credits</small><strong>{drone.credits}</strong></div>
   <div><small>Latest bid</small><strong>{n(drone.last_bid,1)}</strong></div><div><small>Total waiting</small><strong>{drone.total_wait} ticks</strong></div>
   <div><small>Deliveries</small><strong>{drone.deliveries}</strong></div><div><small>Deadline</small><strong>T+{drone.deadline}</strong></div>
  </div>
  <div className="info-box"><span className="eyebrow"><BrainCircuit size={13}/> AUTONOMOUS DECISION</span><p>{drone.last_reason}</p></div>
  <div className="route-data"><span className="eyebrow"><MapPin size={12}/> FLIGHT INTENT</span><div><span>{drone.pos.join(' / ')}</span><ArrowRight size={14}/><span>{drone.target.join(' / ')}</span></div><small>{drone.path?.length??0} upcoming planned nodes  |  altitude level {drone.pos[2]+1}</small></div>
  <div className="inspector-small"><span>ACTIVE SECTOR LAW</span><Badge tone={activeNorm?'mint':'muted'}>{activeNorm?firstCaps(activeNorm.kind):'Standard rules'}</Badge></div>
  <div className="inspector-small"><span>STRATEGIC BEHAVIOR</span><Badge tone={drone.selfish?'amber':'mint'}>{drone.selfish?'Selfish bidder':'Cooperative'}</Badge></div>
 </div>;
}
function NormCard({norm}:{norm:Norm}){
 return <div className="norm-item"><div className="norm-row"><div><Badge tone={norm.kind==='medical_priority'?'rose':'mint'}>N-{String(norm.id).padStart(3,'0')}</Badge><b>{firstCaps(norm.kind)}</b></div><span className="subtle">{norm.sector}</span></div>
  <div className="norm-desc">{norm.rationale}{norm.observed_ticks>0&&<div className="rule-effect">Observed waiting {n(100*norm.observed_wait_sum/norm.observed_ticks,0)}%  |  initial {n(100*norm.baseline_wait_fraction,0)}% <small>(descriptive, noncausal)</small></div>}</div><div className="norm-bottom"><span><Check size={12}/> {Math.round(norm.support*100)}% consensus</span><span>Expires T+{norm.expires_tick}</span></div>
 </div>;
}
function Governance({frame}:{frame:Frame}){
 return <div className="gov-content"><div className="constitution"><div className="constitution-icon"><ShieldCheck size={22}/></div><div><b>Immutable safety constitution</b><p>One UAV per node  |  no head-on edge swaps  |  no closed-zone entry  |  bounded flight grid</p></div><Badge tone="mint">ACTIVE</Badge></div>
  <div className="stack-title">TEMPORARY SECTOR NORMS <Badge>{frame.norms.length} active</Badge></div>
  {frame.norms.length?frame.norms.map(norm=><NormCard norm={norm} key={norm.id}/>):<div className="empty-list">No active negotiated norms. Increase traffic or inject an emergency to activate local governance.</div>}
  <div className="stack-title">LATEST NEGOTIATIONS</div>
  {frame.negotiations.slice(0,8).map((q,i)=><div className="negotiation-item" key={`${q.tick}-${i}`}>
   <div className="event-header"><Badge tone={q.approved?'mint':'amber'}>{q.approved?'APPROVED':'REJECTED'}</Badge><span>T+{q.tick}  |  {q.sector}</span></div>
   <b>{firstCaps(q.kind)}</b><p>{q.rationale}</p>
   {q.bids?.length>0&&<div className="bid-row">{q.bids.slice(0,4).map((b,k)=><span key={k}>UAV-{b.id} <strong>{n(b.bid,1)}</strong></span>)}</div>}
  </div>)}
 </div>;
}
function Feed({frame}:{frame:Frame}){
 return <div className="feed-list">{frame.events.map((e,i)=><div className="feed-item" key={`${e.tick}-${i}`}><span className={`feed-mark ${e.type==='emergency'?'alert':e.type.includes('norm')?'rule':e.type==='weather'?'warning':''}`}/><div><div className="event-header"><b>{firstCaps(e.type)}</b><span>T+{String(e.tick).padStart(3,'0')}</span></div><p>{e.message}</p></div></div>)}</div>
}
function ComparisonPanel({result,busy,onRun,fork,forkBusy,onFork}:{result:Comparison|null;busy:boolean;onRun:()=>void;fork:Counterfactual|null;forkBusy:boolean;onFork:()=>void}){
 const rows=result?.results||[];
 const main=rows.filter(r=>r.ablation==='none');
 const maximum=Math.max(1,...main.map(r=>r.completed));
 const shades:Record<string,string>={nabh:'#5be3c0',central:'#6fbef7',static:'#f6a769'};
 return <div className="research-panel">
  <div className="research-top"><div><span className="eyebrow">RESEARCH CONTROL ROOM</span><h2>Governance benchmark</h2><p>Same initial demands, same random seed. Three competing traffic laws plus two mechanism ablation probes.</p></div><div className="research-actions"><button className="secondary-btn" onClick={onFork} disabled={forkBusy}>{forkBusy?<Activity size={16} className="spin"/>:<History size={16}/>} {forkBusy?'Branching':'What if, now?'}</button><button className="primary-btn" onClick={onRun} disabled={busy}>{busy?<Activity className="spin" size={16}/>:<GitCompareArrows size={16}/>} {busy?'Computing trials...':'Run paired comparison'}</button></div></div>
  {fork&&<div className="fork-panel"><div className="stack-title"><span>COUNTERFACTUAL AIRSPACE LAB</span><Badge tone="mint">REAL CHECKPOINT  |  T+{fork.checkpoint_tick}</Badge></div>
    <p>Three alternate futures branched from the live world's exact positions and random-generator state. Each mini-map shows the final aircraft positions after {fork.steps} policy-dependent ticks.</p>
    <div className="fork-grid">{fork.results.map(r=><div className="fork-card" key={r.policy}><div className="fork-title"><b>{MODE_LABELS[r.policy]}</b><span>{n(r.metrics.completed)} total missions</span></div>
      <svg viewBox="0 0 240 200" preserveAspectRatio="xMidYMid meet" aria-label={`${r.policy} final trajectory locations`}><rect width="240" height="200" rx="7" fill="#0a1e2d"/>
        {Array.from({length:5},(_,i)=><line key={i} x1={i*60} x2={i*60} y1={0} y2={200} stroke="#214356" strokeWidth=".8"/>)}
        {Array.from({length:5},(_,i)=><line key={i} y1={i*50} y2={i*50} x1={0} x2={240} stroke="#214356" strokeWidth=".8"/>)}
        {r.samples.at(-1)?.drones.map(d=><circle key={d.id} cx={(d.pos[0]+.5)*10} cy={(d.pos[1]+.5)*10} r="2.3" fill={COLORS[d.kind]||'#fff'} fillOpacity={.9}/>)}
      </svg><div className="fork-summary"><span>Fairness <b>{n(r.metrics.jain_fairness,3)}</b></span><span>Conflicts <b>{n(r.metrics.predicted_conflicts)}</b></span></div></div>)}</div>
  </div>}
  {!result?<div className="benchmark-empty"><div className="empty-icon"><BarChart3 size={27}/></div><h3>Scientific comparison ready</h3><p>Run the experiment to compare actual backend executions. The results shown here will never be fabricated or hardcoded.</p><Badge>3 GOVERNANCE MODES  |  2 ABLATIONS</Badge></div>:<>
   <div className="research-context"><Badge tone="mint"><Check size={12}/> Computed from simulation</Badge><span>{firstCaps(result.scenario)}  |  {result.population} initial UAVs  |  {result.steps} ticks  |  seed {result.seed}</span></div>
   <div className="comparison-grid">{main.map(row=><div key={row.policy} className={`comparison-card ${row.policy==='nabh'?'leading':''}`}>
    <div className="comparison-name"><span className="indicator" style={{background:shades[row.policy]}}/>{MODE_LABELS[row.policy]}</div>
    <strong>{n(row.completed)}</strong><small>completed missions</small>
    <div className="bar-track"><div style={{width:`${100*row.completed/maximum}%`,background:shades[row.policy]}}/></div>
    <div className="comparison-stat"><span>Jain fairness</span><b>{n(row.jain_fairness,3)}</b></div>
    <div className="comparison-stat"><span>Wait p95 (ticks)</span><b>{n(row.p95_total_wait)}</b></div>
    <div className="comparison-stat"><span>Predicted conflicts</span><b>{n(row.predicted_conflicts)}</b></div>
    <div className="comparison-stat"><span>Safety breaches</span><b>{n(row.safety_violations)}</b></div>
    <div className="comparison-stat"><span>Message overhead</span><b>{n(row.messages)}</b></div>
   </div>)}</div>
   <div className="section-card"><div className="stack-title">ABLATION STUDIES <Badge>MECHANISM CHECK</Badge></div>
    <div className="ablation-grid">{rows.filter(r=>r.ablation!=='none').map(row=><div className="ablation-card" key={row.ablation}>
      <Badge tone="amber">{row.ablation==='no_credits'?'FAIRNESS CREDITS OFF':'ADAPTIVE NORMS OFF'}</Badge>
      <div><strong>{n(row.completed)}</strong><span>completed missions</span></div>
      <div><strong>{n(row.jain_fairness,3)}</strong><span>Jain fairness</span></div>
      <p>Compared against the full NABH-NITI policy with the same scenario and seed.</p>
     </div>)}</div>
   </div>
   <div className="research-note"><ShieldAlert size={16}/><p>These are discrete simulator metrics-not certified real-world UAV safety or a 95% predictive-accuracy claim. Contention is counted separately from hard safety violations. Modes can trade efficiency against fairness and message overhead.</p></div>
  </>}
 </div>;
}

export default function App(){
 const [live,setLive]=useState<Frame>(INITIAL);
 const [connected,setConnected]=useState(false);
 const [selection,setSelection]=useState<number|null>(null);
 const [rightTab,setRightTab]=useState<'inspector'|'laws'|'events'>('inspector');
 const [page,setPage]=useState<'airspace'|'research'|'rules'>('airspace');
 const [view,setView]=useState<ViewPrefs>({altitude:-1,trails:true,zones:false,grid:false,buildings:true,night:false,heatmap:false,camera:'orbit',network:false,labels:true,scope:'smart',kind:'all',sector:'all'});
 const [population,setPopulation]=useState(150);
 const [presenting,setPresenting]=useState(false);
 const [demo,setDemo]=useState(false);
 const stageRef=useRef<HTMLDivElement|null>(null);
 const frameRef=useRef<Frame>(INITIAL);
 const [seed,setSeed]=useState(7);
 const [fairness,setFairness]=useState(true);
 const [adaptive,setAdaptive]=useState(true);
 const [scenario,setScenario]=useState('normal');
 const [toast,setToast]=useState('Connect to the Python engine to begin live simulation.');
 const [comparison,setComparison]=useState<Comparison|null>(null);
 const [busy,setBusy]=useState(false);
 const [fork,setFork]=useState<Counterfactual|null>(null);
 const [forkBusy,setForkBusy]=useState(false);
 const [selfishPercent,setSelfishPercent]=useState(40);
 const [blackoutSector,setBlackoutSector]=useState('S1-1');
 const [replayTicks,setReplayTicks]=useState<number[]>([]);
 const [replay,setReplay]=useState<Frame|null>(null);
 const [replayTick,setReplayTick]=useState<number|null>(null);
 const frame=replay||live;
 frameRef.current=frame;
 const picked=frame.drones.find(d=>d.id===selection);
 const m=frame.metrics;
 const isReplay=replay!==null;
 const emergencyMode=frame.scenario==='medical'||frame.norms.some(rule=>rule.kind==='medical_priority');
 const droneCounts=useMemo(()=>Object.keys(COLORS).map(kind=>({kind,color:COLORS[kind],count:frame.drones.filter(d=>d.kind===kind).length})),[frame.drones]);
 const visibleFleet=useMemo(()=>displayFleet(frame.drones,view,selection),[frame.drones,view,selection]);
 const sectors=useMemo(()=>Array.from(new Set(frame.drones.map(d=>d.sector))).sort(),[frame.drones]);
 const latestNegotiation=frame.negotiations?.[0];

 useEffect(()=>{
  let ws:WebSocket|null=null,stop=false,reconnect:ReturnType<typeof setTimeout>|null=null;
  const connect=()=>{
   if(stop)return;
   ws=new WebSocket(WS);
   ws.onopen=()=>{setConnected(true);setToast('Telemetry link established  |  live sector agents connected');};
   ws.onmessage=e=>{try{setLive(JSON.parse(e.data) as Frame);}catch{setToast('A malformed telemetry message was received.');}};
   ws.onerror=()=>setConnected(false);
   ws.onclose=()=>{setConnected(false);if(!stop)reconnect=setTimeout(connect,1200);};
  };connect();
  return ()=>{stop=true;if(reconnect)clearTimeout(reconnect);ws?.close();};
 },[]);
 const notify=(msg:string)=>setToast(msg);
 const command=useCallback(async(action:string,value?:unknown)=>{
  try{
   const r=await fetch(`${API}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,value})});
   if(!r.ok)throw Error((await r.json()).detail||r.statusText);
   notify(`Command accepted  |  ${firstCaps(action)}`);
  }catch(e){notify(`Action failed  |  ${String(e)}`);}
 },[]);
 const reset=async(mode:string=live.metrics.mode,extra?:{population?:number;seed?:number;scenario?:string})=>{
  const body={drones:extra?.population??population,seed:extra?.seed??seed,mode,scenario:extra?.scenario??scenario,fairness,adaptive};
  try{
   const r=await fetch(`${API}/reset`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   if(!r.ok)throw Error((await r.json()).detail||r.statusText);
   setSelection(null);setReplay(null);setReplayTick(null);setComparison(null);
   notify(`Simulation reset  |  ${MODE_LABELS[mode]}  |  seed ${body.seed}`);
  }catch(e){notify(`Reset failed  |  ${String(e)}`);}
 };
 const inject=async(id:string)=>{
  try{const r=await fetch(`${API}/scenario/${id}`,{method:'POST'});if(!r.ok)throw Error(await r.text());setScenario(id);notify(`${SCENARIO_LABELS[id]} injected into live airspace`);}
  catch(e){notify(`Scenario failed  |  ${String(e)}`);}
 };
 const compare=async()=>{
  setBusy(true);setComparison(null);setPage('research');
  try{const q=new URLSearchParams({scenario,seed:String(seed),population:String(population),steps:'90',ablations:'true'});
   const r=await fetch(`${API}/compare?${q}`);if(!r.ok)throw Error(await r.text());setComparison(await r.json());notify('Paired governance experiments finished  |  all 5 policies evaluated');
  }catch(e){notify(`Experiment error  |  ${String(e)}`);}finally{setBusy(false);}
 };
 const runFork=async()=>{
  setForkBusy(true);setPage('research');
  try{const r=await fetch(`${API}/counterfactual?steps=60`);if(!r.ok)throw Error(await r.text());
      setFork(await r.json());notify('Counterfactual branch completed  |  3 identical live-world checkpoints');}
  catch(e){notify(`What-if experiment failed  |  ${String(e)}`);}finally{setForkBusy(false);}
 };
 const beginReplay=async()=>{
  if(isReplay){setReplay(null);setReplayTick(null);return;}
  try{const r=await fetch(`${API}/history`);const payload=await r.json();const ticks:number[]=payload.ticks;if(!ticks.length){notify('Replay frames will appear after a few live ticks.');return;}
   setReplayTicks(ticks);await loadReplay(ticks[ticks.length-1]);notify('Black-box replay: recorded telemetry, not a new simulation');
  }catch(e){notify(`Replay unavailable  |  ${String(e)}`);}
 };
 const loadReplay=async(tick:number)=>{
  try{const r=await fetch(`${API}/history/${tick}`);if(!r.ok)throw Error('Snapshot not retained');setReplay(await r.json());setReplayTick(tick);}
  catch(e){notify(String(e));}
 };
 const saveScenario=()=>{
  const bundle={project:'NABH-NITI',seed,population,mode:live.metrics.mode,scenario,fairness,adaptive};
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}));a.download=`nabhniti-scenario-${seed}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 };
 const exportFrame=()=>{
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(frame,null,2)],{type:'application/json'}));a.download=`nabhniti-telemetry-t${m.tick}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 };
 const changeView=(k:keyof ViewPrefs,v:boolean|number|string)=>setView(prev=>({...prev,[k]:v}));
 const togglePresentation=useCallback(async()=>{
  try {
   if(document.fullscreenElement) await document.exitFullscreen();
   else if(stageRef.current) await stageRef.current.requestFullscreen();
  } catch(e) { notify(`Fullscreen unavailable  |  ${String(e)}`); }
 },[]);
 useEffect(()=>{
  const listener=()=>setPresenting(document.fullscreenElement===stageRef.current);
  document.addEventListener('fullscreenchange',listener);
  return()=>document.removeEventListener('fullscreenchange',listener);
 },[]);
 useEffect(()=>{
  if(!demo)return;
  const views=['orbit','top','focus','street'] as const;
  let index=0;
  const timer=window.setInterval(()=>{
   index=(index+1)%views.length;
   const choice=views[index];
   if(choice==='focus'){
    const first=frameRef.current.drones.find(d=>d.kind==='medical')||frameRef.current.drones[0];
    if(first){setSelection(first.id);setRightTab('inspector');}
   }
   setView(v=>({...v,camera:choice}));
  },7000);
  return()=>window.clearInterval(timer);
 },[demo]);
 useEffect(()=>{
  const onKeyDown=(event:KeyboardEvent)=>{
   const target=event.target as HTMLElement|null;
   if(target?.closest('input,textarea,select,[contenteditable="true"]'))return;
   if(event.key==='Escape'){setSelection(null);setView(v=>v.camera==='focus'?{...v,camera:'orbit'}:v);}
   if(event.key.toLowerCase()==='f'&&selection!==null)setView(v=>({...v,camera:v.camera==='focus'?'orbit':'focus'}));
   if(event.key==='1')setView(v=>({...v,camera:'orbit'}));
   if(event.key==='2')setView(v=>({...v,camera:'top'}));
   if(event.key.toLowerCase()==='p')void togglePresentation();
   if(event.key.toLowerCase()==='d')setDemo(v=>!v);
  };
  window.addEventListener('keydown',onKeyDown);
  return ()=>window.removeEventListener('keydown',onKeyDown);
 },[selection,togglePresentation]);
 return <div className="app-shell">
  <div className="nav-rail">
   <div className="logo-glyph"><Compass size={27} strokeWidth={1.8}/></div>
   <div className="rail-links"><button className={page==='airspace'?'rail-active':''} title="Airspace command" onClick={()=>setPage('airspace')}><LayoutDashboard size={20}/></button>
    <button className={page==='research'?'rail-active':''} title="Research lab" onClick={()=>setPage('research')}><BarChart3 size={20}/></button>
    <button className={page==='rules'?'rail-active':''} title="Compare rules under all three governance modes" aria-label="Compare governance rules" onClick={()=>setPage('rules')}><Shield size={20}/></button>
    <button title="Replay" onClick={beginReplay}><History size={20}/></button></div>
   <div className="rail-end"><button title="Reset simulation" onClick={()=>reset()}><RotateCcw size={19}/></button><span className="rail-version">CITY COMMAND 2.0</span></div>
  </div>
  <div className="app-area">
   <header className="topbar"><div className="wordmark"><span className="wordmark-main">NABH<span>-</span>NITI</span><span className="wordmark-sub">AUTONOMOUS AIRSPACE COMMAND CENTER</span></div>
    <div className="topbar-center"><span className="header-dot"/> RESEARCH-GRADE MULTI-AGENT DIGITAL TWIN <span className="header-divider"/> TEAM ASTRADYNAMICS</div>
    <div className="topbar-right"><Badge tone={connected?'mint':'rose'}>{connected?<><Wifi size={13}/> LINK ONLINE</>:<><WifiOff size={13}/> ENGINE OFFLINE</>}</Badge><div className="topbar-clock"><Clock3 size={15}/> SIM T+{String(live.metrics.tick).padStart(4,'0')}</div></div>
   </header>
   <div className="body-grid">
    <aside className="control-sidebar">
     <div className="side-intro"><span className="eyebrow"><span className="mini-led"/> FLIGHT OPERATIONS</span><h2>Mission Control</h2><p>Configure, stress and govern your simulated airspace.</p></div>
     <div className="sidebar-section"><div className="side-heading"><span>01 / GOVERNANCE</span><ShieldCheck size={15}/></div>
      <div className="governance-picker">{modes.map(mode=><button key={mode} className={m.mode===mode?'governance-current':''} onClick={()=>reset(mode)}><span className="radio-ring"/>{MODE_LABELS[mode]}{m.mode===mode&&<Check size={14}/>}</button>)}</div>
      <p className="helper">Switching modes resets the simulation for a clean run.</p>
      <button className="secondary-btn full" onClick={()=>setPage('rules')}><BookOpen size={14}/> View rules for all 3 modes</button>
     </div>
     <div className="sidebar-section"><div className="side-heading"><span>02 / FLEET CONFIGURATION</span><SlidersHorizontal size={15}/></div>
      <div className="range-heading"><label htmlFor="count">Airspace population</label><strong>{population} <small>UAV</small></strong></div>
      <input type="range" id="count" min="50" max="500" step="10" value={population} onChange={e=>setPopulation(Number(e.target.value))}/>
      <div className="range-extents"><span>50 UAVs</span><span>500 UAVs</span></div>
      <label className="mini-input-label" htmlFor="seed">Deterministic experiment seed</label><div className="seed-box"><Target size={15}/><input id="seed" type="number" min="0" max="999999" value={seed} onChange={e=>setSeed(Math.min(999999,Math.max(0,Number(e.target.value)||0)))}/><Badge>REPRODUCIBLE</Badge></div>
      <button className="secondary-btn full" onClick={()=>reset()}><RefreshCcw size={15}/> Apply & reset world</button>
     </div>
     <div className="sidebar-section"><div className="side-heading"><span>03 / STRESS EVENTS</span><Zap size={15}/></div>
      <div className="scenario-list">{scenarios.map(({id,label,subtitle,icon:Icon,color})=><button key={id} className={`scenario-row scenario-${color}`} onClick={()=>inject(id)}>
       <div className="scenario-icon"><Icon size={17}/></div><div className="scenario-copy"><b>{label}</b><small>{subtitle}</small></div><Plus size={15} className="scenario-plus"/>
      </button>)}</div>
     </div>
     <div className="sidebar-section"><div className="side-heading"><span>04 / EXPERIMENT SWITCHES</span><Settings2 size={15}/></div>
      <label className="switch-row"><span>Fairness credits <small>Ablation toggle</small></span><input type="checkbox" checked={fairness} onChange={e=>{setFairness(e.target.checked);command('fairness',e.target.checked);}}/><i/></label>
      <label className="switch-row"><span>Adaptive norms <small>Ablation toggle</small></span><input type="checkbox" checked={adaptive} onChange={e=>{setAdaptive(e.target.checked);command('adaptive',e.target.checked);}}/><i/></label>
     </div>
     <div className="sidebar-section"><div className="side-heading"><span>05 / SCENARIO STUDIO</span><Settings2 size={15}/></div>
       <div className="range-heading"><label>Selfish bidders</label><strong>{selfishPercent}%</strong></div>
       <input type="range" min="0" max="80" step="10" value={selfishPercent} onChange={e=>setSelfishPercent(Number(e.target.value))}/>
       <button className="secondary-btn full" onClick={()=>command('selfish',selfishPercent/100)}>Apply bidding behavior</button>
       <label className="mini-input-label">Sector communications</label>
       <div className="sector-config"><select value={blackoutSector} onChange={e=>setBlackoutSector(e.target.value)}>
         {Array.from({length:16},(_,i)=><option key={i} value={`S${Math.floor(i/4)}-${i%4}`}>{`Sector S${Math.floor(i/4)}-${i%4}`}</option>)}
       </select><button onClick={()=>command('blackout',blackoutSector)}><Radio size={14}/> Toggle link</button></div>
     </div>
     <div className="sidebar-bottom"><div className="sidebar-submark"><Sparkles size={15}/> ENGINEERING THE SKY</div><span>AI3403  |  MULTI-AGENT SYSTEMS</span></div>
    </aside>
    <main className="main-content">
     <div className="content-heading"><div><span className="eyebrow">{page==='airspace'?'LIVE OPERATIONS / 3D DIGITAL TWIN':page==='rules'?'POLICY REFERENCE / THREE GOVERNANCE MODES':'EVALUATION / PAIRED-SEED ANALYTICS'}</span>
      <h1>{page==='airspace'?'Urban Airspace Operations':page==='rules'?'Traffic Governance Rules':'Research & Experimentation'} <span className="heading-accent">{page==='airspace'?'+':page==='rules'?'#':'*'}</span></h1>
      <p>{page==='airspace'?'Autonomous vehicles. Negotiated laws. Governed skies.':page==='rules'?'Understand exactly which traffic rules each governance model applies.':'Evidence-driven comparison of competing airspace governance policies.'}</p></div>
      <div className="heading-actions"><button onClick={saveScenario} title="Export scenario configuration"><Download size={16}/> Scenario</button><button className="heading-dark" onClick={exportFrame}><FileBarChart2 size={16}/> Export state</button></div>
     </div>
     {page==='research'?<ComparisonPanel result={comparison} busy={busy} onRun={compare} fork={fork} forkBusy={forkBusy} onFork={runFork}/>:page==='rules'?<PolicyGuide activeMode={m.mode} frame={frame} onRun={mode=>{setPage('airspace');void reset(mode);}} onBack={()=>setPage('airspace')}/>:<>
      <div className="airspace-panel" ref={stageRef}><div className="stage-top"><div className="stage-title"><div className="live-indicator"/><b>LIVE AIRSPACE VIEW</b><span>{frame.grid.width} x {frame.grid.height} x {frame.grid.levels} FLIGHT GRID</span></div>
        <div className="stage-actions"><button onClick={()=>changeView('camera',view.camera==='top'?'orbit':'top')} title="Switch between 3D and overhead views"><Compass size={16}/> {view.camera==='top'?'3D':'Top'} view</button>
         <button onClick={()=>changeView('camera',view.camera==='street'?'orbit':'street')} className={view.camera==='street'?'activated':''} title="Explore building facades and urban streets"><MapPin size={16}/> {view.camera==='street'?'Exit street':'Street view'}</button>
         <button onClick={()=>changeView('camera',view.camera==='focus'?'orbit':'focus')} className={view.camera==='focus'?'activated':''} disabled={!picked} title="Select a drone and follow its flight (F)"><Target size={16}/> {view.camera==='focus'?'Exit follow':'Follow UAV'}</button>
         <button onClick={()=>changeView('heatmap',!view.heatmap)} className={view.heatmap?'activated':''}><Layers3 size={16}/> Heatmap</button>
         <button onClick={()=>changeView('night',!view.night)} title="Change lighting">{view.night?<Moon size={16}/>:<Sun size={16}/>}</button>
         <button className={demo?'activated':''} onClick={()=>setDemo(v=>!v)} title="Start/stop cinematic camera tour (D)"><Clapperboard size={16}/>{demo?'Stop tour':'Auto tour'}</button>
         <button className={presenting?'activated':''} onClick={togglePresentation} title="Fullscreen presentation mode (P)">{presenting?<Minimize2 size={16}/>:<Maximize2 size={16}/>} {presenting?'Exit':'Fullscreen'}</button></div>
      </div>
      <div className="visual-controls">
       <div className="view-filter-group"><Eye size={15}/><span>TRAFFIC VIEW</span>
        {(['smart','all','priority','density'] as const).map(scope=><button key={scope} className={view.scope===scope?'chosen':''} onClick={()=>changeView('scope',scope)} title={scope==='smart'?'Decluttered representative agents, entire fleet still simulated':scope==='all'?'Render all matching agents (may be crowded)':scope==='priority'?'Focus on priority traffic':'Density overview'}>{scope==='smart'?'SMART':scope==='all'?'ALL UAVs':scope==='priority'?'PRIORITY':'DENSITY'}</button>)}
       </div>
       <div className="view-filter-group"><span>MISSION</span><select value={view.kind} aria-label="Filter UAV mission" onChange={e=>changeView('kind',e.target.value)}><option value="all">All missions</option>{Object.keys(COLORS).map(kind=><option key={kind} value={kind}>{firstCaps(kind)}</option>)}</select></div>
       <div className="view-filter-group"><span>SECTOR</span><select value={view.sector} aria-label="Filter airspace sector" onChange={e=>changeView('sector',e.target.value)}><option value="all">All sectors</option>{sectors.map(sector=><option key={sector}>{sector}</option>)}</select></div>
       <button className={`city-visibility ${view.buildings?'chosen':''}`} onClick={()=>changeView('buildings',!view.buildings)} title="Toggle city visibility"><Building2 size={14}/> City</button>
       <div className="view-count"><b>{visibleFleet.length}</b> rendered <span>/ {frame.drones.length} simulated</span></div>
      </div>
      <div className="scene-wrap"><Scene frame={frame} selected={selection} onPick={id=>{setSelection(id);setRightTab('inspector');}} view={view}/>
       <div className="scene-overlay-top"><Badge tone="mint"><span className="pulse-dot"/> {isReplay?'REPLAY RECORDED':'LIVE SIMULATION'}</Badge><span className="scene-coords">SYNCHRONIZED 3D SPACE  |  T+{m.tick.toString().padStart(4,'0')}</span></div>
       <div className="overlay-corner"><div className="hud-value"><span>{n(m.active)}</span><small>AIRCRAFT</small></div><div className="hud-value"><span>{n(m.active_norms)}</span><small>ACTIVE NORMS</small></div><div className="hud-value"><span>{n(m.safety_violations)}</span><small>BREACHES</small></div></div>
       <div className="showcase-district-note"><Sparkles size={12}/> ASTRADYNAMICS METROPOLITAN TESTBED <span>10 FACILITIES  |  {frame.grid.width*frame.grid.height*frame.grid.levels} AIRSPACE NODES</span></div>
       {emergencyMode&&<div className="showcase-medical-alert"><HeartPulse size={15}/> MEDICAL PRIORITY TRAFFIC <span>{frame.norms.some(q=>q.kind==='medical_priority')?'NEGOTIATED CORRIDOR ACTIVE':'SECTOR AGENTS MONITORING'}</span></div>}
       {picked&&<div className="showcase-focus-card" style={{borderColor:`${COLORS[picked.kind]||'#6cddff'}85`}}>
         <span className="showcase-focus-orb" style={{background:COLORS[picked.kind]||'#6cddff'}}/>
         <div><strong>UAV-{String(picked.id).padStart(3,'0')}</strong><small>{firstCaps(picked.kind)}  |  {picked.sector}  |  {picked.status}</small></div>
         <span className="showcase-focus-route"><i/> LIVE ROUTE TO DESTINATION</span>
         <button title="Clear selected drone (Esc)" aria-label="Clear selected drone" onClick={()=>{setSelection(null);if(view.camera==='focus')changeView('camera','orbit');}}>x</button>
       </div>}
       <div className="camera-hint"><Compass size={14}/> DRAG TO ORBIT <span> | </span> SCROLL TO ZOOM <span> | </span> CLICK UAV <span> | </span> F FOLLOW / ESC CLEAR</div>
       {view.scope==='density'&&<div className="density-caption">SECTOR DENSITY VIEW - {frame.drones.length} UAVs simulated</div>}
       <div className="stage-altitude"><span>FLIGHT LAYER</span>{[-1,...Array.from({length:frame.grid.levels},(_,i)=>i)].map(v=><button key={v} className={view.altitude===v?'on':''} onClick={()=>changeView('altitude',v)}>{v===-1?'ALL':`L${v+1}`}</button>)}</div>
      </div>
      <div className="stage-footer"><div className="fleet-legend">{droneCounts.map(d=><span key={d.kind}><i style={{background:d.color}}/>{firstCaps(d.kind)} <b>{d.count}</b></span>)}</div>
       <div className="scene-toggles"><button className={view.zones?'on':''} onClick={()=>changeView('zones',!view.zones)}><Layers3 size={14}/> Sectors</button><button className={view.grid?'on':''} onClick={()=>changeView('grid',!view.grid)}><Compass size={14}/> Ground grid</button><button className={view.trails?'on':''} onClick={()=>changeView('trails',!view.trails)}><Activity size={14}/> Flight paths</button><button className={view.network?'on':''} onClick={()=>changeView('network',!view.network)}><Radio size={14}/> Agent links</button><button className={view.labels?'on':''} onClick={()=>changeView('labels',!view.labels)}><MapPin size={14}/> Companies</button></div>
      </div>
      <div className="negotiation-dock"><MessageSquare size={15}/><strong>LIVE NEGOTIATION</strong>
       {latestNegotiation?<span><b>{firstCaps(latestNegotiation.kind)}</b>  |  {latestNegotiation.sector}  |  {latestNegotiation.bids?.length??0} participating bids  |  {latestNegotiation.approved?'Accepted':'Rejected'}  |  T+{latestNegotiation.tick}</span>:<span>Awaiting sector proposals  |  governed by {MODE_LABELS[m.mode]}</span>}
       <button onClick={()=>setRightTab('laws')}>View live laws <ArrowUpRight size={13}/></button><button onClick={()=>setPage('rules')}>All 3 rule systems <BookOpen size={13}/></button>
      </div></div>
      <div className="telemetry-title"><div><span className="eyebrow">SYSTEM-WIDE TELEMETRY</span><h3>Live performance metrics</h3></div><Badge tone="muted">REAL-TIME  |  DISCRETE TICKS</Badge></div>
      <div className="metrics-grid">
       <Metric icon={Users} label="ACTIVE AIRCRAFT" value={n(m.active)} meta="Across all flight levels" color="cyan"/>
       <Metric icon={Check} label="COMPLETED MISSIONS" value={n(m.completed)} meta={`${n(m.throughput,2)} missions / tick`} color="mint" data={frame.history} plot="completed"/>
       <Metric icon={ShieldCheck} label="SAFETY BREACHES" value={n(m.safety_violations)} meta={`${n(m.predicted_conflicts)} potential conflicts blocked`} color="mint"/>
       <Metric icon={Scale} label="JAIN'S FAIRNESS" value={n(m.jain_fairness,3)} meta="Non-emergency service access" color="cyan" data={frame.history} plot="fairness"/>
       <Metric icon={MessageSquare} label="NEGOTIATIONS" value={n(m.negotiations)} meta={`${n(m.messages)} logical messages`} color="amber"/>
       <Metric icon={Clock3} label="95TH-PCT WAIT" value={`${n(m.p95_total_wait)} t`} meta={`${n(m.starvation)} UAVs waiting >=10 ticks`} color="rose"/>
      </div>
      <div className="lower-strip"><div><div className="eyebrow">FLIGHT CONTROL</div><div className="transport"><button className="transport-primary" onClick={()=>command(live.paused?'resume':'pause')}>{live.paused?<Play size={17}/>:<Pause size={17}/>} {live.paused?'Resume':'Pause'}</button>
       <button onClick={()=>command('step')} title="Advance one simulation tick"><ArrowRight size={17}/> Tick</button>
       <button onClick={beginReplay} className={isReplay?'active':''}><History size={17}/> {isReplay?'Return live':'Black box'}</button>
       <button onClick={()=>reset()} title="Reset current simulation"><RotateCcw size={17}/></button>
      </div></div>
       <div className="lower-stat"><small>TRAFFIC PRESSURE</small><b>{m.active<150?'LOW':m.active<300?'MODERATE':'ELEVATED'}</b><div className="pressure-track"><i style={{width:`${Math.min(100,m.active/500*100)}%`}}/></div></div>
       <div className="lower-stat"><small>GOVERNANCE STATUS</small><b>{MODE_LABELS[m.mode]}</b><span>{m.approved_norms} laws enacted  |  {m.proposals} proposals</span></div>
      </div>
      {isReplay&&<div className="replay-controls"><span><History size={15}/> RECORDED BLACK BOX</span><input type="range" min="0" max={Math.max(0,replayTicks.length-1)} value={Math.max(0,replayTicks.indexOf(replayTick??-1))} onChange={e=>loadReplay(replayTicks[Number(e.target.value)])}/><b>T+{replayTick}</b><button onClick={()=>{setReplay(null);setReplayTick(null);}}>LIVE</button></div>}
      <div className="research-invite"><div className="invite-mark"><BarChart3 size={21}/></div><div><b>Want to prove NABH-NITI improves airspace governance?</b><p>Run real paired experiments: fixed rules vs centralized vs decentralized adaptive norms, with ablations.</p></div><button onClick={compare}>Compare all modes <ArrowUpRight size={16}/></button></div>
     </>}
    </main>
    <aside className="inspector-sidebar"><div className="right-tabs"><button className={rightTab==='inspector'?'selected':''} onClick={()=>setRightTab('inspector')} title="Agent inspector"><Target size={18}/><span>INSPECT</span></button>
     <button className={rightTab==='laws'?'selected':''} onClick={()=>setRightTab('laws')} title="Governance"><BookOpen size={18}/><span>LAWS</span></button>
     <button className={rightTab==='events'?'selected':''} onClick={()=>setRightTab('events')} title="Event feed"><Activity size={18}/><span>EVENTS</span></button></div>
     <div className="right-scroll">{rightTab==='inspector'?<><div className="right-title"><div className="eyebrow">01 / AUTONOMOUS AGENT</div><h3>Drone intelligence</h3></div><DroneInspector drone={picked} frame={frame}/>
      <div className="right-title right-section"><div className="eyebrow">02 / ACTIVE AIRSPACE LAWS</div><h3>Sector governance <Badge tone="mint">{frame.norms.length} LIVE</Badge></h3></div>
      {frame.norms.length?frame.norms.slice(0,5).map(q=><NormCard norm={q} key={q.id}/>):<div className="empty-list">No negotiated rules in effect yet.</div>}
      <div className="right-title right-section"><div className="eyebrow">03 / SYSTEM EVENT STREAM</div><h3>Recent activity</h3></div><Feed frame={{...frame,events:frame.events.slice(0,10)}}/>
     </>:rightTab==='laws'?<><div className="right-title"><div className="eyebrow">LAW-MAKING / NORM GOVERNANCE</div><h3>Digital constitution</h3></div><><button className="secondary-btn full" onClick={()=>setPage('rules')}><BookOpen size={14}/> Compare rules for all 3 modes</button><Governance frame={frame}/></></>:<><div className="right-title"><div className="eyebrow">ACTIVITY / AUDIT TRAIL</div><h3>Flight black box</h3></div><Feed frame={frame}/></>}</div>
     <div className="inspector-footer"><div><span className="mini-led"/> {connected?'ENCRYPTION-FREE LOCAL TELEMETRY':'SERVER NOT CONNECTED'}</div><span>SIMULATED AIRSPACE  |  NOT FOR REAL FLIGHT</span></div>
    </aside>
   </div>
   <div className="toast-bar"><span><Activity size={14}/>{toast}</span><span>ASTRADYNAMICS <i/> AI3403 MULTI-AGENT SYSTEMS</span></div>
  </div>
 </div>;
}
