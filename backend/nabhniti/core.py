"""NABH-NITI deterministic, discrete-time, 3-D normative multi-agent airspace.

Research model, not aviation-grade flight-control or a physical accuracy claim.
Time-aware one-tick resource reservations guarantee that after each discrete tick
no two UAVs share a node and no occupied-edge head-on swaps occur.
"""
from __future__ import annotations

from dataclasses import dataclass, asdict, field
from collections import defaultdict, deque
from typing import Any
import heapq
import math
import random

Point = tuple[int, int, int]
KINDS = ("delivery", "inspection", "survey", "medical", "cargo")
POLICIES = ("static", "central", "nabh")
SCENARIOS = ("normal", "congestion", "medical", "festival", "storm", "failure", "selfish")
PRIORITIES = {"delivery": 2, "inspection": 3, "survey": 2, "medical": 10, "cargo": 1}

@dataclass
class Drone:
    id: int
    kind: str
    pos: Point
    target: Point
    deadline: int
    battery: float = 100.0
    credits: int = 5
    waiting: int = 0
    total_wait: int = 0
    travelled: int = 0
    deliveries: int = 0
    selfish: bool = False
    path: list[Point] | None = None
    status: str = "enroute"
    last_bid: float = 0.0
    last_reason: str = "Awaiting traffic clearance"
    heading: float = 0.0
    mission_started: int = 0
    mission_travel_times: list[int] = field(default_factory=list)

    @property
    def priority(self) -> int:
        return PRIORITIES[self.kind]

@dataclass
class Norm:
    id: int
    sector: str
    kind: str
    activated_tick: int
    expires_tick: int
    support: float
    proposer: str = "sector"
    participants: int = 0
    votes_for: int = 0
    votes_against: int = 0
    safety_passed: bool = True
    rationale: str = ""
    bid_summary: list[dict[str, Any]] = field(default_factory=list)
    entry_direction: int = 1
    quota: int = 0
    baseline_wait_fraction: float = 0.0
    observed_wait_sum: float = 0.0
    observed_ticks: int = 0
    effectiveness_score: float | None = None

class Simulator:
    def __init__(self, drones: int = 60, seed: int = 7, mode: str = "nabh", width: int = 24,
                 height: int = 20, levels: int = 4, fairness: bool = True, adaptive: bool = True,
                 scenario: str = "normal", norm_memory: bool = True):
        if mode not in POLICIES:
            raise ValueError(f"mode must be one of {POLICIES}")
        if scenario not in SCENARIOS:
            raise ValueError(f"scenario must be one of {SCENARIOS}")
        if not 4 <= width <= 80 or not 4 <= height <= 80 or not 2 <= levels <= 10:
            raise ValueError("Grid dimension outside supported range")
        if drones < 0 or drones > width * height * levels:
            raise ValueError("drone count exceeds grid capacity")
        self.seed, self.rng = seed, random.Random(seed)
        self.mode, self.scenario = mode, scenario
        self.width, self.height, self.levels = width, height, levels
        self.fairness_enabled, self.adaptive_enabled, self.norm_memory_enabled = fairness, adaptive, norm_memory
        self.drones: dict[int, Drone] = {}
        self.tick = self.completed = self.messages = self.negotiations = 0
        self.conflicts = self.safety_violations = self.total_delay = 0
        self.proposals = self.rules_approved = self.rules_rejected = self.rule_flips = 0
        self.failed = self.emergency_completed = self.emergency_total_time = 0
        self.total_elapsed = self.total_mission_time = 0
        self.predicted_conflicts = 0
        self.weather_blocked: set[Point] = set()
        self.blackout_sectors: set[str] = set()
        self.selfish_fraction = 0.0
        self.events: deque[dict[str, Any]] = deque(maxlen=350)
        self.active_norms: dict[str, Norm] = {}
        self.norm_history: deque[dict[str, Any]] = deque(maxlen=240)
        self.negotiation_history: deque[dict[str, Any]] = deque(maxlen=150)
        self.norm_effectiveness: dict[str, list[float]] = defaultdict(list)
        self.sector_cooldowns: dict[str, int] = {}
        self.next_norm = self.next_drone_id = 1
        self.paused = False
        self.runtime_stats: deque[dict[str, Any]] = deque(maxlen=250)
        self.add_drones(drones)
        self.log("system", f"Initialized {len(self.drones)} simulated UAV agents  |  {mode.upper()}  |  seed {seed}")

    def sector(self, pos: Point) -> str:
        return f"S{pos[0] // 6}-{pos[1] // 5}"

    def log(self, kind: str, message: str, **extra: Any) -> None:
        self.events.appendleft({"tick": self.tick, "type": kind, "message": message, **extra})

    def in_bounds(self, pos: Point) -> bool:
        return 0 <= pos[0] < self.width and 0 <= pos[1] < self.height and 0 <= pos[2] < self.levels

    def neighbors(self, pos: Point):
        x, y, z = pos
        for delta in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)):
            nxt = (x+delta[0], y+delta[1], z+delta[2])
            if self.in_bounds(nxt) and nxt not in self.weather_blocked:
                yield nxt

    def free_node(self, occupied: set[Point], *, far_from: Point | None = None) -> Point:
        for _ in range(2500):
            p = (self.rng.randrange(self.width), self.rng.randrange(self.height), self.rng.randrange(self.levels))
            if p in occupied or p in self.weather_blocked: continue
            if far_from is not None and self.heuristic(p, far_from) < 7: continue
            return p
        for z in range(self.levels):
            for x in range(self.width):
                for y in range(self.height):
                    p = (x, y, z)
                    if p not in occupied and p not in self.weather_blocked and (far_from is None or self.heuristic(p, far_from) >= 7):
                        return p
        raise ValueError("No available node respecting constraints")

    @staticmethod
    def heuristic(a: Point, b: Point) -> int:
        return sum(abs(x-y) for x,y in zip(a,b))

    def add_drones(self, count: int, kind: str | None = None) -> int:
        if kind is not None and kind not in KINDS: raise ValueError("unknown drone class")
        if count < 0 or count > 1500: raise ValueError("drone request must be between 0 and 1500")
        occupied = {d.pos for d in self.drones.values()}
        added = 0
        for _ in range(count):
            if len(occupied) >= self.width * self.height * self.levels - len(self.weather_blocked): break
            try:
                start = self.free_node(occupied)
                target = self.free_node({start}, far_from=start)
            except ValueError: break
            index = self.next_drone_id
            self.next_drone_id += 1
            k = kind or self.rng.choices(KINDS, weights=(7,3,2,1,2))[0]
            deadline = self.tick + (28 if k == "medical" else self.rng.randint(35, 90))
            self.drones[index] = Drone(id=index, kind=k, pos=start, target=target, deadline=deadline,
                                        mission_started=self.tick)
            occupied.add(start)
            added += 1
        if self.tick > 0: self.log("spawn", f"{added} {kind or 'mixed'} UAV agents deployed", count=added)
        return added

    def pathfind(self, source: Point, goal: Point) -> list[Point]:
        """Admissible 3D A* on six-neighbor space, obeying no-fly volumes.

        Strategic topological routing is followed by conflict-free *time-step*
        movement allocation; 3D A* alone does NOT provide flight separation.
        """
        if source == goal: return [source]
        if not self.in_bounds(source) or not self.in_bounds(goal) or goal in self.weather_blocked:
            return [source]
        costs: dict[Point, int] = {source: 0}
        parents: dict[Point, Point | None] = {source: None}
        queue: list[tuple[int,int,Point]] = [(self.heuristic(source,goal),0,source)]
        while queue:
            _,distance,current = heapq.heappop(queue)
            if distance != costs[current]: continue
            if current == goal:
                result = [goal]
                while result[-1] != source: result.append(parents[result[-1]])
                return list(reversed(result))
            for nxt in self.neighbors(current):
                new_cost = distance+1
                if new_cost < costs.get(nxt, 1_000_000):
                    costs[nxt] = new_cost
                    parents[nxt] = current
                    heapq.heappush(queue,(new_cost+self.heuristic(nxt,goal),new_cost,nxt))
        return [source]

    def _bid(self, d: Drone, destination: Point | None = None) -> float:
        urgency = max(0, 24-(d.deadline-self.tick))/24
        base = 3*d.priority + 7*urgency + 0.8*min(15,d.waiting)
        if self.mode == "static": return -float(d.id)  # ID-based fixed FIFO right-of-way
        if self.mode == "central": return base
        if self.sector(d.pos) in self.blackout_sectors: return base * .75
        norm = self.active_norms.get(self.sector(d.pos))
        if norm and norm.kind == "medical_priority" and d.kind == "medical": base += 24
        if norm and norm.kind == "congestion_priority": base += 1.2*min(d.waiting,12)
        if norm and norm.kind == "entry_quota": base += 0.4*min(d.waiting,12)
        if self.fairness_enabled: base += 1.4*d.credits
        if d.selfish: base += 8  # private inflated bid; all movement still checked by safety shield
        return round(base,3)

    def _norm_candidates(self, agents: list[Drone]) -> list[str]:
        medical = sum(d.kind == "medical" for d in agents)
        waiting = sum(d.waiting > 1 for d in agents)
        candidates: list[str] = []
        if medical > 0 and len(agents) >= 3: candidates.append("medical_priority")
        if len(agents) >= 12 and (waiting >= 2 or len(agents) >= 19):
            candidates.extend(("congestion_priority", "one_way_lane"))
        if len(agents) >= 22: candidates.append("entry_quota")
        return candidates

    def _proposal_value(self, kind: str, agents: list[Drone]) -> float:
        medical = any(d.kind == "medical" for d in agents)
        pressure = min(1, len(agents)/25)
        waiting = sum(d.waiting > 0 for d in agents)/len(agents)
        # Choose traffic norms for congestion TYPE, not just a generic priority label.
        # A rotating context probe provides opportunities to evaluate alternatives.
        phase=(self.tick//4+sum(ord(c) for c in self.sector(agents[0].pos)))%3
        bidirectional=min(sum(d.target[0]>d.pos[0] for d in agents),
                          sum(d.target[0]<d.pos[0] for d in agents))/max(1,len(agents))
        values = {"medical_priority": 0.99 if medical else 0.,
                  "congestion_priority": 0.44 + 0.24*pressure + 0.21*waiting,
                  "one_way_lane": 0.47 + 0.22*pressure + 0.31*bidirectional + (0.27 if phase==1 else 0),
                  "entry_quota": 0.51 + 0.24*pressure + (0.35 if phase==0 else 0)}
        memory = self.norm_effectiveness.get(kind, [])
        memory_bonus = (max(-0.08,min(0.08,sum(memory[-8:])/len(memory[-8:])*0.15)) if memory and self.norm_memory_enabled else 0)
        return values[kind] + memory_bonus

    def make_norms(self) -> None:
        # Observe real traffic during a norm's lifetime. Before/after pressure
        # difference is a descriptive effectiveness signal, NOT a causal estimate.
        currently: dict[str, list[Drone]] = defaultdict(list)
        for d in self.drones.values():currently[self.sector(d.pos)].append(d)
        for sector, norm in list(self.active_norms.items()):
            local=currently.get(sector,[])
            if local:
                norm.observed_wait_sum += sum(d.waiting>0 for d in local)/len(local)
                norm.observed_ticks += 1
            if self.tick < norm.expires_tick and sector not in self.blackout_sectors: continue
            norm.effectiveness_score = round(norm.baseline_wait_fraction -
                norm.observed_wait_sum/max(1,norm.observed_ticks),4)
            self.norm_effectiveness[norm.kind].append(norm.effectiveness_score)
            self.norm_history.appendleft(asdict(norm))
            del self.active_norms[sector]
            self.sector_cooldowns[sector] = self.tick+3  # anti-oscillation hysteresis
            self.log("norm_retired", f"N-{norm.id:03d} retired in {sector}  |  descriptive score {norm.effectiveness_score:+.2f}",
                     sector=sector, norm_id=norm.id, score=norm.effectiveness_score)
        if self.mode != "nabh" or not self.adaptive_enabled or self.tick % 4 != 0: return
        sectors: dict[str,list[Drone]] = defaultdict(list)
        for d in self.drones.values(): sectors[self.sector(d.pos)].append(d)
        for sector, agents in sorted(sectors.items()):
            if sector in self.active_norms or sector in self.blackout_sectors or self.tick < self.sector_cooldowns.get(sector,0):
                continue
            kinds = self._norm_candidates(agents)
            if not kinds: continue
            kind = max(kinds, key=lambda k: (self._proposal_value(k,agents),k))
            bids = [{"id":d.id,"bid":round(self._bid(d),2),"kind":d.kind,"support": bool(d.kind == "medical" or d.waiting > 1 or (not d.selfish))} for d in agents]
            yes = sum(b["support"] for b in bids)
            support = yes/len(bids)
            self.messages += 1+2*len(agents)
            self.proposals += 1
            rationale = f"{len(agents)} active agents; {sum(d.waiting>0 for d in agents)} currently waiting"
            self.log("proposal",f"{sector} proposed {kind.replace('_',' ')}  |  {yes}/{len(agents)} votes",sector=sector, proposal=kind)
            approved = support >= 0.60
            record = {"tick":self.tick,"sector":sector,"kind":kind,"support":round(support,3),
                      "approved":approved,"bids":bids[:18],"rationale":rationale}
            self.negotiation_history.appendleft(record)
            if approved:
                # Norms are soft traffic policies, never waive node or head-on separation.
                n = Norm(self.next_norm,sector,kind,self.tick,self.tick+14,round(support,3),
                         proposer=f"Sector agent {sector}", participants=len(agents),votes_for=yes,
                         votes_against=len(agents)-yes,rationale=rationale,bid_summary=bids[:12],
                         entry_direction=1 if sum(d.target[0]>d.pos[0] for d in agents)>=sum(d.target[0]<d.pos[0] for d in agents) else -1,
                         quota=max(2, len(agents)//6),
                         baseline_wait_fraction=sum(d.waiting>0 for d in agents)/len(agents))
                # Local sector agents reconcile directions with neighbors.
                if n.kind=='one_way_lane':
                    sx,sy=map(int,sector[1:].split('-'))
                    for neighbor in (f'S{sx-1}-{sy}',f'S{sx+1}-{sy}',f'S{sx}-{sy-1}',f'S{sx}-{sy+1}'):
                        nearby=self.active_norms.get(neighbor)
                        if nearby and nearby.kind=='one_way_lane':
                            n.entry_direction=nearby.entry_direction
                            self.messages+=2
                            self.log('coordination',f'{sector} aligned its one-way direction with {neighbor}',sector=sector)
                            break
                self.active_norms[sector]=n
                self.norm_history.appendleft(asdict(n))
                self.next_norm+=1
                self.rules_approved+=1
                self.log("norm_activated",f"N-{n.id:03d}  |  {kind.replace('_',' ')} activated in {sector}",
                         sector=sector,norm_id=n.id,norm_kind=kind)
            else:
                self.rules_rejected+=1
                self.sector_cooldowns[sector] = self.tick+4
                self.log("proposal_rejected",f"{kind} rejected in {sector}  |  insufficient agreement",sector=sector)

    def _norm_permits(self, drone: Drone, proposed: Point) -> bool:
        if self.mode != "nabh": return True
        n = self.active_norms.get(self.sector(proposed))
        if not n or n.kind != "one_way_lane" or proposed[2] != 1 or drone.kind == "medical": return True
        # A lane-specific restriction: drones can still use the other altitude layers.
        horizontal_dx = proposed[0] - drone.pos[0]
        return not (horizontal_dx != 0 and horizontal_dx != n.entry_direction)

    def step(self) -> None:
        if self.paused: return
        self.tick += 1
        if self.mode == 'central':
            # Abstract uplink state report plus controller dispatch for each UAV.
            # Static rules need no communication, and NABH uses localized bid traffic.
            self.messages += 2*len(self.drones)
        self.make_norms()
        occupied = {d.pos:d.id for d in self.drones.values()}
        proposals: dict[Point,list[Drone]] = defaultdict(list)
        candidates: dict[int,Point] = {}
        old_positions = {d.id:d.pos for d in self.drones.values()}
        for d in sorted(self.drones.values(), key=lambda x:x.id):
            if d.pos == d.target:
                d.deliveries += 1
                self.completed += 1
                travel_time = self.tick-d.mission_started
                d.mission_travel_times.append(travel_time)
                if len(d.mission_travel_times)>30: d.mission_travel_times.pop(0)
                self.total_mission_time += travel_time
                self.total_elapsed += 1
                if d.kind == "medical":
                    self.emergency_completed += 1
                    self.emergency_total_time += travel_time
                d.deadline = self.tick + (28 if d.kind == "medical" else self.rng.randint(35,90))
                d.mission_started = self.tick
                d.battery = min(100, d.battery+30)  # recharge at destination depot
                try: d.target = self.free_node({d.pos}, far_from=d.pos)
                except ValueError: pass
                d.path = None
            # Energy is a simplified budget. An exhausted UAV holds position
            # until it reaches a modeled depot; no physical landing is simulated.
            if d.battery <= 0:
                d.path = None
                d.last_reason = "Holding: battery depleted (simulation proxy)"
                continue
            if not d.path or len(d.path)<2 or d.path[0]!=d.pos or any(p in self.weather_blocked for p in d.path):
                d.path=self.pathfind(d.pos,d.target)
            if len(d.path)<2:
                d.last_reason="Holding: no permitted route"
                continue
            proposed=d.path[1]
            if d.waiting >= 2 or not self._norm_permits(d, proposed):
                # Local reactive deconfliction: escape persistent queueing by selecting
                # a permissible free neighbor, preferring progress toward the mission.
                alternatives=[p for p in self.neighbors(d.pos)
                              if p not in occupied and self._norm_permits(d,p)]
                if alternatives:
                    current_distance=self.heuristic(d.pos,d.target)
                    alternatives.sort(key=lambda p:(self.heuristic(p,d.target),
                        abs(p[2]-d.target[2]), (p[0]*13+p[1]*7+p[2]+self.tick+d.id)%11))
                    best=alternatives[0]
                    if self.heuristic(best,d.target) <= current_distance + 1:
                        proposed=best
                        if proposed != d.path[1]:d.path=[d.pos,proposed]
            if not self._norm_permits(d, proposed):
                d.path=None
                d.last_reason="Holding: temporary altitude traffic rule"
                continue
            candidates[d.id]=proposed
            proposals[proposed].append(d)

        chosen:dict[int,Point]={}
        for cell, contenders in sorted(proposals.items()):
            contenders.sort(key=lambda d:(self._bid(d,cell), -d.id),reverse=True)
            winner=contenders[0]
            chosen[winner.id]=cell
            for d in contenders:
                d.last_bid=self._bid(d,cell)
                d.last_reason=("Reserved destination node" if d.id==winner.id else
                               f"Outbid by UAV-{winner.id}; waiting for next slot")
            if len(contenders)>1:
                self.predicted_conflicts+=len(contenders)-1
                self.conflicts+=1
                if self.mode=="nabh":
                    self.negotiations+=1
                    self.messages+=2*len(contenders)
                    if len(self.negotiation_history)<2 or self.tick%2==0:
                        bids=[{"id":d.id,"kind":d.kind,"bid":d.last_bid,"credits":d.credits} for d in contenders[:10]]
                        self.negotiation_history.appendleft({"tick":self.tick,"sector":self.sector(cell),
                            "kind":"node_allocation","approved":True,"winner":winner.id,"cell":cell,
                            "bids":bids,"rationale":"Highest admissible traffic bid wins one discrete time-slot"})
                    if self.tick%3==0:
                        self.log("negotiation",f"{len(contenders)} UAVs bid for {cell}; UAV-{winner.id} granted access",
                                 sector=self.sector(cell),winner=winner.id,cell=cell)

        # Entry quotas: select by bid, independent of target node collision.
        if self.mode=="nabh":
            entering:dict[str,list[int]]=defaultdict(list)
            for did,cell in chosen.items():
                if self.sector(old_positions[did])!=self.sector(cell):
                    n=self.active_norms.get(self.sector(cell))
                    if n and n.kind=="entry_quota" and self.drones[did].kind!="medical": entering[n.sector].append(did)
            for sector,ids in entering.items():
                n=self.active_norms[sector]
                ids.sort(key=lambda did:(self.drones[did].last_bid,-did),reverse=True)
                for did in ids[n.quota:]:
                    del chosen[did]
                    self.drones[did].last_reason=f"Quota N-{n.id:03d}: sector admission deferred"

        # Safety shield: cancel moves whose target occupant will not vacate; then
        # cancel edge swaps. Fixed-point iteration makes chains deterministic.
        while True:
            invalid=set()
            for did,cell in chosen.items():
                occupier=occupied.get(cell)
                if occupier is not None and occupier not in chosen: invalid.add(did)
                if occupier is not None and chosen.get(occupier)==old_positions[did]:
                    invalid.update((did,occupier))
            if not invalid: break
            for did in invalid:
                if did in chosen:
                    del chosen[did]
                    self.drones[did].last_reason="Safety shield: occupied position / head-on swap"
            self.predicted_conflicts+=len(invalid)

        for d in self.drones.values():
            if d.id not in chosen:
                d.waiting+=1
                d.total_wait+=1
                self.total_delay+=1
                d.status="holding" if d.battery>0 else "battery_low"
                if self.mode=="nabh" and self.fairness_enabled: d.credits=min(15,d.credits+1)
                continue
            nxt=chosen[d.id]
            old=d.pos
            d.pos=nxt
            d.path=d.path[1:] if d.path else None
            d.travelled+=1
            d.battery=max(0, d.battery-(0.39 if old[2]!=nxt[2] else 0.19))
            d.heading=math.atan2(nxt[1]-old[1],nxt[0]-old[0]) if old[:2]!=nxt[:2] else d.heading
            d.waiting=0
            d.status="emergency" if d.kind=="medical" else "enroute"
            if self.mode=="nabh" and self.fairness_enabled: d.credits=max(0,d.credits-1)
            d.last_reason=("Priority bid accepted by local sector" if self.mode=="nabh" else
                           "Dispatched by global controller" if self.mode=="central" else "Fixed right-of-way granted")

        new_positions=[d.pos for d in self.drones.values()]
        if len(new_positions)!=len(set(new_positions)):
            self.safety_violations+=1
            raise AssertionError("Hard node-separation invariant broken")
        if not all(self.in_bounds(p) and p not in self.weather_blocked for p in new_positions):
            self.safety_violations+=1
            raise AssertionError("No-fly/boundary invariant broken")
        if self.tick%2==0:
            self.runtime_stats.append({"tick":self.tick,"completed":self.completed,"wait":self.total_delay,
                                       "conflicts":self.conflicts,"messages":self.messages,
                                       "fairness":self.fairness_index(),"norms":len(self.active_norms)})

    def fairness_index(self) -> float:
        # Jain fairness over access opportunity: moved steps / active tick opportunities.
        # Eligible non-medical agents only; avoids mixing protected medical priority.
        nonmedical=[d for d in self.drones.values() if d.kind!="medical"]
        scores=[(d.travelled+1)/(d.travelled+d.total_wait+1) for d in nonmedical]
        if not scores:return 1.0
        return (sum(scores)**2)/(len(scores)*sum(s*s for s in scores))

    def action(self, action: str, value: Any = None) -> None:
        if action=="add": self.add_drones(int(value) if value is not None else 50)
        elif action=="emergency":
            self.add_drones(1,"medical")
            self.log("emergency","MEDICAL PRIORITY  |  urgent UAV mission dispatched")
        elif action=="festival":
            self.add_drones(85)
            self.log("surge","FESTIVAL SURGE  |  85 new missions requested")
        elif action=="congestion":
            self.add_drones(110)
            self.log("surge","DENSE TRAFFIC  |  sector demand increased")
        elif action=="storm":
            occupied={d.pos for d in self.drones.values()}
            new={(x,y,z) for x in range(self.width//3,2*self.width//3)
                 for y in range(self.height//3,2*self.height//3) for z in range(self.levels)}-occupied
            self.weather_blocked |= new
            for d in self.drones.values(): d.path=None
            self.log("weather",f"STORM  |  {len(new)} volume cells restricted",count=len(new))
        elif action=="clear_storm":
            self.weather_blocked.clear()
            for d in self.drones.values():d.path=None
            self.log("weather","Storm cleared; airspace reopened")
        elif action=="blackout":
            sector=str(value or "S1-1")
            if sector in self.blackout_sectors:
                self.blackout_sectors.remove(sector)
                self.log("communication",f"Communications restored in {sector}")
            else:
                self.blackout_sectors.add(sector)
                self.log("communication",f"RADIO BLACKOUT in {sector}")
        elif action=="selfish":
            f=min(1,max(0,float(value if value is not None else 0.35)))
            self.selfish_fraction=f
            ids=sorted(self.drones)
            self.rng.shuffle(ids)
            selected=set(ids[:round(len(ids)*f)])
            for d in self.drones.values():d.selfish=d.id in selected
            self.log("behaviour",f"Selfish UAV bidding enabled for {f:.0%} of fleet")
        elif action=="fail":
            if self.drones:
                victim=self.rng.choice(sorted(self.drones))
                del self.drones[victim]
                self.failed+=1
                self.log("failure",f"UAV-{victim} lost; removed from active airspace",drone_id=victim)
        elif action=="mode":
            if value not in POLICIES:raise ValueError("Unknown governance mode")
            self.mode=str(value)
            self.active_norms.clear()
            self.log("system",f"Mode set to {self.mode}; use reset for fair comparisons")
        elif action=="pause":self.paused=True
        elif action=="resume":self.paused=False
        elif action=="step":
            previously=self.paused
            self.paused=False
            self.step()
            self.paused=previously
        elif action=="fairness":self.fairness_enabled=bool(value)
        elif action=="adaptive":
            self.adaptive_enabled=bool(value)
            if not self.adaptive_enabled:self.active_norms.clear()
        else:raise ValueError(f"Unknown action: {action}")

    def metrics(self) -> dict[str, Any]:
        drones=list(self.drones.values())
        waits=sorted(d.total_wait for d in drones)
        p95=waits[max(0,math.ceil(.95*len(waits))-1)] if waits else 0
        starvation=sum(d.waiting>=10 for d in drones)
        return {
            "tick":self.tick,"mode":self.mode,"active":len(drones),"completed":self.completed,
            "negotiations":self.negotiations,"conflicts":self.conflicts,"predicted_conflicts":self.predicted_conflicts,
            "safety_violations":self.safety_violations,"total_wait_ticks":self.total_delay,
            "mean_wait_ticks_per_active_uav":round(self.total_delay/max(1,len(drones)),2),
            "p95_total_wait":p95,"fairness_proxy":round(self.fairness_index(),4),
            "jain_fairness":round(self.fairness_index(),4),"messages":self.messages,"active_norms":len(self.active_norms),
            "proposals":self.proposals,"approved_norms":self.rules_approved,"rejected_norms":self.rules_rejected,
            "starvation":starvation,"failures":self.failed,
            "throughput":round(self.completed/max(1,self.tick),4),
            "mean_mission_time":round(self.total_mission_time/max(1,self.total_elapsed),2),
            "mean_emergency_time":round(self.emergency_total_time/max(1,self.emergency_completed),2) if self.emergency_completed else None,
            "emergency_completed":self.emergency_completed,"fairness_enabled":self.fairness_enabled,
            "adaptive_enabled":self.adaptive_enabled,
        }

    def snapshot(self, concise: bool = False) -> dict[str, Any]:
        result={
            "grid":{"width":self.width,"height":self.height,"levels":self.levels},
            "seed":self.seed,"scenario":self.scenario,"metrics":self.metrics(),
            "drones":[{**asdict(d),"sector":self.sector(d.pos),"priority":d.priority,
                       "path":d.path[:16] if d.path else [],"mission_travel_times":d.mission_travel_times[-5:]} for d in self.drones.values()],
            "norms":[asdict(n) for n in self.active_norms.values()],
            "events":list(self.events)[:(25 if concise else 65)],
            "negotiations":list(self.negotiation_history)[:(6 if concise else 22)],
            "blocked":[list(p) for p in sorted(self.weather_blocked)],
            "blackouts":sorted(self.blackout_sectors),"paused":self.paused,
            "history":list(self.runtime_stats)[-60:],
        }
        if not concise:result["norm_history"]=list(self.norm_history)[:35]
        return result
