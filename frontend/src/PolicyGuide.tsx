import { BookOpen, CheckCircle2, RadioTower, Scale, ShieldCheck, Timer, Workflow } from 'lucide-react';
import type { Frame } from './types';
import './policy-guide.css';

type Mode = 'static' | 'central' | 'nabh';

type Policy = {
  id: Mode;
  name: string;
  short: string;
  principle: string;
  steps: string[];
  laws: { name: string; detail: string }[];
  overhead: string;
  highlight: string;
};

const POLICIES: Policy[] = [
  {
    id: 'static', name: 'Fixed Rules', short: 'Baseline A',
    principle: 'Predetermined, ID-based right-of-way; no negotiated sector laws.',
    steps: [
      'Every drone independently plans a permitted 3D A* route to its mission target.',
      'If multiple drones request the same cell, the lower numeric UAV ID wins that time slot.',
      'Other contenders wait or try a safe alternative; the safety shield checks moves.',
      'The same arbitration rule applies during congestion, storms and emergencies.',
    ],
    laws: [
      { name: 'Fixed ID priority', detail: 'Lower UAV ID receives priority when target-cell proposals conflict.' },
      { name: 'No temporary norms', detail: 'No dynamic one-way lane, admission quota or emergency-priority law is created.' },
      { name: 'Basic rerouting', detail: 'A* replans around blocked nodes; no negotiated governance is involved.' },
    ],
    overhead: 'No simulated controller/bidding messages for movement arbitration.',
    highlight: 'Simple and reproducible, but not adaptive to mission-specific priorities.',
  },
  {
    id: 'central', name: 'Centralized', short: 'Baseline B',
    principle: 'One abstract global dispatcher prioritizes contested movements by utility.',
    steps: [
      'Drones compute paths, then contested destination cells are resolved with a global priority score.',
      'The score combines mission priority, deadline urgency and current waiting time.',
      'A controller-style reporting/dispatch cost of two logical messages per drone per tick is counted.',
      'The safety shield rejects unsafe movements; no sector-by-sector norm negotiation occurs.',
    ],
    laws: [
      { name: 'Global utility priority', detail: 'Priority = 3 x mission priority + 7 x urgency + 0.8 x capped wait.' },
      { name: 'Controller dispatch', detail: 'Highest-scoring contender receives a contested destination slot.' },
      { name: 'No adaptive norms', detail: 'No temporary negotiated medical-priority, quota or one-way law.' },
    ],
    overhead: 'Simulated two logical messages per drone per tick for global reporting/dispatch.',
    highlight: 'Mission-aware arbitration, with centralized coordination overhead.',
  },
  {
    id: 'nabh', name: 'NABH-NITI', short: 'Our proposed MAS',
    principle: 'Local sector agents and drone agents negotiate temporary, safety-checked traffic norms.',
    steps: [
      'Agents bid using mission priority, deadline urgency, waiting time and (when enabled) fairness credits.',
      'Every four ticks, a sector can consider context-dependent rules if enough agents are present.',
      'A proposed norm is activated when at least 60% of represented agents support it.',
      'Approved norms expire after 14 ticks, with cooldowns that reduce immediate reactivation.',
    ],
    laws: [
      { name: 'Medical priority', detail: 'In an active medical-priority sector, medical UAVs gain a strong utility bonus.' },
      { name: 'Congestion priority', detail: 'Additional priority goes to UAVs that have waited in a congested sector.' },
      { name: 'One-way altitude lane', detail: 'Restricts horizontal travel direction on flight level 2; medical drones are exempt.' },
      { name: 'Entry quota', detail: 'Caps non-medical sector admissions for a tick, preserving an emergency exception.' },
      { name: 'Fairness credits', detail: 'Waiting increases credits up to a cap; accepted movements can spend them.' },
      { name: 'Local coordination', detail: 'Adjacent sectors align directions for temporary one-way lanes.' },
      { name: 'Norm memory', detail: 'Observed rule outcomes inform later norm proposal ranking (descriptive, not causal).' },
    ],
    overhead: 'Localized proposal and bid messages, tracked by the simulation metrics.',
    highlight: 'Adaptive sector governance, with possible negotiation overhead and delay trade-offs.',
  },
];

const matrix: { label: string; values: [string, string, string] }[] = [
  { label: 'Movement conflict priority', values: ['Fixed UAV ID', 'Global utility score', 'Local utility bids + norms'] },
  { label: 'Emergency handling', values: ['No special norm', 'Mission-priority utility', 'Medical-priority sector norm'] },
  { label: 'Temporary one-way lanes', values: ['No', 'No', 'Yes, flight level 2'] },
  { label: 'Sector entry quotas', values: ['No', 'No', 'Yes, non-medical UAVs'] },
  { label: 'Fairness credits', values: ['No', 'No', 'Optional / ablation'] },
  { label: 'Adaptive norm creation', values: ['No', 'No', 'Yes, after support vote'] },
  { label: 'Communication accounting', values: ['No negotiation overhead', 'Global controller messages', 'Local sector/bid messages'] },
  { label: 'Hard safety shield', values: ['Yes', 'Yes', 'Yes'] },
];

export default function PolicyGuide({ activeMode, frame, onRun, onBack }: {
  activeMode: string;
  frame: Frame;
  onRun: (mode: Mode) => void;
  onBack: () => void;
}) {
  return <section className="policy-guide" aria-label="Rules under all three governance modes">
    <div className="policy-hero">
      <div>
        <span className="eyebrow"><BookOpen size={14} /> AIRSPACE POLICY REFERENCE</span>
        <h2>Rules under all three governance systems</h2>
        <p>Compare the exact policies implemented in our simulator. The shared safety constraints apply to every mode, but the way aircraft receive traffic priority changes.</p>
      </div>
      <button type="button" className="secondary-btn" onClick={onBack}>Back to live airspace</button>
    </div>

    <div className="safety-baseline">
      <ShieldCheck size={24} />
      <div>
        <strong>Non-negotiable safety constraints in ALL modes</strong>
        <p>At most one UAV per grid node; no head-on edge swaps; no entry into closed/no-fly nodes; bounded 3D flight space. All movements pass the same discrete-time safety shield. These are simulator rules, not certified aviation regulations.</p>
      </div>
    </div>

    <div className="policy-card-grid">
      {POLICIES.map(policy => <article className={`policy-card policy-${policy.id}`} key={policy.id}>
        <div className="policy-card-head"><div><span className="policy-kicker">{policy.short}</span><h3>{policy.name}</h3></div>{activeMode === policy.id && <span className="policy-current"><CheckCircle2 size={13}/> RUNNING</span>}</div>
        <p className="policy-principle">{policy.principle}</p>
        <div className="policy-subtitle"><Workflow size={15}/> How decisions are made</div>
        <ol className="policy-step-list">{policy.steps.map((step,i) => <li key={i}>{step}</li>)}</ol>
        <div className="policy-subtitle"><Scale size={15}/> Active rule definitions</div>
        <div className="policy-law-list">{policy.laws.map(law => <div className="policy-law" key={law.name}><b>{law.name}</b><span>{law.detail}</span></div>)}</div>
        <div className="policy-overhead"><RadioTower size={15}/><span>{policy.overhead}</span></div>
        <p className="policy-highlight">{policy.highlight}</p>
        <button type="button" className="policy-run" onClick={() => onRun(policy.id)}>{activeMode === policy.id ? 'Restart this governance mode' : `Run ${policy.name} in live simulator`}</button>
      </article>)}
    </div>

    <div className="policy-table-wrap">
      <div className="policy-table-head"><h3>Rule-by-rule comparison</h3><span>What changes between modes?</span></div>
      <div className="policy-table-scroll"><table className="policy-table"><thead><tr><th>Rule / capability</th><th>Fixed Rules</th><th>Centralized</th><th>NABH-NITI</th></tr></thead>
        <tbody>{matrix.map(r => <tr key={r.label}><th scope="row">{r.label}</th>{r.values.map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody></table></div>
    </div>

    <div className="policy-runtime">
      <div><Timer size={20}/><strong>Current live status</strong></div>
      <p>Policy: <b>{POLICIES.find(p=>p.id===activeMode)?.name ?? activeMode}</b> | Tick: <b>{frame.metrics.tick}</b> | Active negotiated norms: <b>{frame.norms.length}</b> | Proposals: <b>{frame.metrics.proposals}</b></p>
      <p>Only NABH-NITI creates temporary negotiated norms. They appear in the <b>LAWS</b> panel while they are active.</p>
    </div>
  </section>;
}
