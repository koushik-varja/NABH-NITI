import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls, Sky, useGLTF } from '@react-three/drei';
import RealisticCity from './RealisticCity';
import * as THREE from 'three';
import type { Drone, Frame } from './types';
import { COLORS } from './types';
import {ALTITUDE_GAP,BASE_FLIGHT_HEIGHT,CITY_CELL_METERS,cityDimensions,detailedFleet,displayFleet,worldPosition} from './visuals';

export type ViewPrefs = {
  altitude: number;
  trails: boolean;
  zones: boolean;
  buildings: boolean;
  night: boolean;
  heatmap: boolean;
  camera: string;
  network: boolean;
  labels: boolean;
  grid: boolean;
  scope: 'smart'|'all'|'priority'|'density';
  kind: string;
  sector: string;
};

const MAX_DRONES = 750;
const world = worldPosition;
const brighten = (hex: string, amount = 0.24) => {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color('#ffffff'), amount);
  return `#${c.getHexString()}`;
};

function DroneFleet({
  drones,
  grid,
  selected,
  onPick,
  altitude,
}: {
  drones: Drone[];
  grid: Frame['grid'];
  selected: number | null;
  onPick: (id: number) => void;
  altitude: number;
}) {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const armsA = useRef<THREE.InstancedMesh>(null);
  const armsB = useRef<THREE.InstancedMesh>(null);
  const motors = useRef<THREE.InstancedMesh>(null);
  const blades = useRef<THREE.InstancedMesh>(null);
  const skids = useRef<THREE.InstancedMesh>(null);
  const payloads = useRef<THREE.InstancedMesh>(null);
  const halos = useRef<THREE.InstancedMesh>(null);
  const emergencyBeacons = useRef<THREE.InstancedMesh>(null);
  const previous = useRef<Map<number, THREE.Vector3>>(new Map());
  const cache = useRef<Drone[]>(drones);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const rotorOffsets = useMemo(() => [[0.55, 0.55], [-0.55, 0.55], [0.55, -0.55], [-0.55, -0.55]] as const, []);

  useEffect(() => {
    cache.current = drones;
    const ids = new Set(drones.map(d => d.id));
    for (const id of previous.current.keys()) if (!ids.has(id)) previous.current.delete(id);
  }, [drones]);

  const set = (
    mesh: THREE.InstancedMesh | null,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotation: number,
    tint?: string,
  ) => {
    if (!mesh) return;
    transform.position.set(x, y, z);
    transform.rotation.set(0, rotation, 0);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    if (tint) {
      color.set(tint);
      mesh.setColorAt(index, color);
    }
  };

  useFrame(({ clock }, delta) => {
    const active = cache.current.slice(0, MAX_DRONES);
    const n = active.length;
    [bodies.current, armsA.current, armsB.current, skids.current, payloads.current, halos.current, emergencyBeacons.current].forEach(m => { if (m) m.count = n; });
    if (motors.current) motors.current.count = n * 4;
    if (blades.current) blades.current.count = n * 4;

    const spin = clock.elapsedTime * 22;
    for (let i = 0; i < n; i++) {
      const d = active[i];
      const target = new THREE.Vector3(...world(d.pos, grid));
      let origin = previous.current.get(d.id);
      if (!origin) {
        origin = target.clone();
        previous.current.set(d.id, origin);
      }
      origin.lerp(target, Math.min(1, delta * 5));

      const visible = altitude === -1 || d.pos[2] === altitude;
      const baseScale = visible ? (selected === d.id ? 1.04 : 0.68) : 0.00001;
      const size = baseScale * (d.kind === 'cargo' ? 1.18 : d.kind === 'medical' ? 1.06 : 1);
      const y = origin.y + Math.sin(clock.elapsedTime * 2 + d.id) * 0.035;
      const yaw = -d.heading;
      const tint = COLORS[d.kind] || '#ffffff';
      const bodyTint = selected === d.id ? brighten(tint, 0.38) : tint;
      const armTint = selected === d.id ? '#ffffff' : brighten(tint, 0.54);
      const haloTint = selected === d.id ? '#f0fbff' : '#ff527b';

      const showHalo = selected === d.id || (d.kind === 'medical' && d.priority >= 9);
      set(halos.current, i, origin.x, y - 0.32 * size, origin.z, showHalo ? 1.48 * size : 0.00001, 1, showHalo ? 1.48 * size : 0.00001, 0, haloTint);
      set(bodies.current, i, origin.x, y, origin.z, 0.82 * size, 0.24 * size, 0.54 * size, yaw, bodyTint);
      set(armsA.current, i, origin.x, y + 0.035, origin.z, 1.92 * size, 0.08 * size, 0.08 * size, yaw + Math.PI / 4, armTint);
      set(armsB.current, i, origin.x, y + 0.035, origin.z, 1.92 * size, 0.08 * size, 0.08 * size, yaw - Math.PI / 4, armTint);
      set(skids.current, i, origin.x, y - 0.22 * size, origin.z, 1.05 * size, 0.07 * size, 0.86 * size, yaw, '#dbeff4');

      const payloadVisible = d.kind === 'cargo' || d.kind === 'delivery' || d.kind === 'medical';
      set(
        payloads.current,
        i,
        origin.x,
        y - 0.18 * size,
        origin.z,
        payloadVisible ? 0.39 * size : 0.00001,
        payloadVisible ? 0.26 * size : 0.00001,
        payloadVisible ? 0.42 * size : 0.00001,
        yaw,
        d.kind === 'medical' ? '#ffffff' : d.kind === 'cargo' ? '#ffd782' : '#a7f6fb',
      );

      for (let r = 0; r < 4; r++) {
        const [rx, rz] = rotorOffsets[r];
        const xx = (rx * Math.cos(yaw) - rz * Math.sin(yaw)) * size;
        const zz = (rx * Math.sin(yaw) + rz * Math.cos(yaw)) * size;
        const j = i * 4 + r;
        set(motors.current, j, origin.x + xx, y + 0.12 * size, origin.z + zz, 0.22 * size, 0.11 * size, 0.22 * size, 0, '#d8edfa');
        set(blades.current, j, origin.x + xx, y + 0.18 * size, origin.z + zz, 0.75 * size, 0.025 * size, 0.06 * size, spin * (r % 2 === 0 ? 1 : -1) + yaw, '#effcff');
      }
      const isEmergency = d.kind === 'medical' && d.priority >= 9;
      const beaconPulse = clock.elapsedTime * 5 + d.id;
      const beaconColor = Math.sin(beaconPulse) > 0 ? '#fffafa' : '#ff315f';
      set(emergencyBeacons.current, i, origin.x, y + 0.30 * size, origin.z, isEmergency ? 0.13 * size : 0.00001, isEmergency ? 0.13 * size : 0.00001, isEmergency ? 0.13 * size : 0.00001, 0, beaconColor);
    }

    for (const mesh of [emergencyBeacons.current, halos.current, bodies.current, armsA.current, armsB.current, skids.current, payloads.current, motors.current, blades.current]) {
      if (mesh) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  });

  const select = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const isRotorPart = e.object === motors.current || e.object === blades.current;
    const fleetIndex = isRotorPart ? Math.floor(e.instanceId / 4) : e.instanceId;
    const drone = drones[fleetIndex];
    if (drone) onPick(drone.id);
  };

  return (
    <group>
      <instancedMesh ref={halos} args={[undefined, undefined, MAX_DRONES]} frustumCulled={false} onClick={select}>
        <cylinderGeometry args={[1, 1, 0.02, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.20} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={emergencyBeacons} args={[undefined, undefined, MAX_DRONES]} frustumCulled={false} onClick={select}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[undefined, undefined, MAX_DRONES]} onClick={select} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={armsA} args={[undefined, undefined, MAX_DRONES]} frustumCulled={false} onClick={select}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={armsB} args={[undefined, undefined, MAX_DRONES]} frustumCulled={false} onClick={select}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={motors} args={[undefined, undefined, MAX_DRONES * 4]} frustumCulled={false} onClick={select}>
        <cylinderGeometry args={[1, 1, 1, 10]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={blades} args={[undefined, undefined, MAX_DRONES * 4]} frustumCulled={false} onClick={select}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.90} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={skids} args={[undefined, undefined, MAX_DRONES]} frustumCulled={false} onClick={select}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={payloads} args={[undefined, undefined, MAX_DRONES]} frustumCulled={false} onClick={select}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Airspace({ frame, selected, view }: { frame: Frame; selected: Drone | undefined; view: ViewPrefs }) {
  const g = frame.grid;
  return (
    <group>
      {view.zones && Array.from({ length: g.levels }, (_, i) => (
        <mesh key={`level-${i}`} position={[0, BASE_FLIGHT_HEIGHT + i*ALTITUDE_GAP, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[g.width*CITY_CELL_METERS, g.height*CITY_CELL_METERS]} />
          <meshBasicMaterial color={i % 2 === 0 ? '#3489c3' : '#2d7eb5'} transparent opacity={0.06} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {view.zones && Array.from({ length: Math.ceil(g.width / 6) - 1 }, (_, i) => (
        <Line key={`sx-${i}`} points={[[ (6 * (i+1) - g.width/2)*CITY_CELL_METERS, BASE_FLIGHT_HEIGHT-.2, -g.height*CITY_CELL_METERS/2],[(6 * (i+1) - g.width/2)*CITY_CELL_METERS, BASE_FLIGHT_HEIGHT-.2, g.height*CITY_CELL_METERS/2]]} color="#51cfff" lineWidth={1.2} dashed dashSize={0.3} gapSize={0.3} />
      ))}
      {view.zones && Array.from({ length: Math.ceil(g.height / 5) - 1 }, (_, i) => (
        <Line key={`sz-${i}`} points={[[-g.width*CITY_CELL_METERS/2,BASE_FLIGHT_HEIGHT-.2,(5 * (i+1) - g.height/2)*CITY_CELL_METERS],[g.width*CITY_CELL_METERS/2,BASE_FLIGHT_HEIGHT-.2,(5 * (i+1) - g.height/2)*CITY_CELL_METERS]]} color="#51cfff" lineWidth={1.2} dashed dashSize={0.3} gapSize={0.3} />
      ))}

      {view.zones && frame.norms.map(n => {
        const parts = n.sector.replace('S', '').split('-').map(Number);
        const x = (parts[0]*6+2.5-(g.width-1)/2)*CITY_CELL_METERS;
        const z = (parts[1]*5+2-(g.height-1)/2)*CITY_CELL_METERS;
        return (
          <group key={`n-${n.id}`}>
            <mesh position={[x, BASE_FLIGHT_HEIGHT-.14, z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[6*CITY_CELL_METERS-.4, 5*CITY_CELL_METERS-.4]} />
              <meshBasicMaterial color={n.kind === 'medical_priority' ? '#ff6d8b' : '#39e8b7'} transparent opacity={0.17} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        );
      })}

      {frame.blocked.slice(0,120).map((cell,i)=><mesh key={`blocked-${i}`} position={world(cell,g)}>
        <boxGeometry args={[CITY_CELL_METERS*.8,ALTITUDE_GAP*.85,CITY_CELL_METERS*.8]}/><meshBasicMaterial color="#ff5c8d" wireframe transparent opacity={.45}/>
      </mesh>)}

      {selected && (
        <group>
          <SelectionBeacon drone={selected} grid={g} />
          <mesh position={world(selected.pos, g)}>
            <sphereGeometry args={[0.95, 20, 16]} />
            <meshBasicMaterial color="#83f7ff" transparent opacity={0.12} depthWrite={false} />
          </mesh>
          <mesh position={world(selected.pos, g)} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.70, 0.82, 48]} />
            <meshBasicMaterial color="#6df4ff" side={THREE.DoubleSide} />
          </mesh>
          <TargetPulse position={world(selected.target, g)} />
          <Line points={[world(selected.pos, g), world(selected.target, g)]} color="#ffe38d" lineWidth={3.2} dashed dashSize={0.35} gapSize={0.2} />
          {view.trails && selected.path?.length > 1 && <Line points={selected.path.map(p => world(p, g))} color="#80f6ff" lineWidth={3.4} />}
        </group>
      )}

      {view.network && frame.negotiations.filter(q => frame.metrics.tick - q.tick < 4).slice(0, 2).flatMap((q, i) =>
        q.bids.slice(0, 18).map((bid, j) => {
          const d = frame.drones.find(a => a.id === bid.id);
          if (!d || frame.blackouts.includes(q.sector)) return null;
          const [sx, sz] = q.sector.slice(1).split('-').map(Number);
          const sectorCenter: [number, number, number] = [(sx*6+2.5-(g.width-1)/2)*CITY_CELL_METERS,BASE_FLIGHT_HEIGHT-1,(sz*5+2-(g.height-1)/2)*CITY_CELL_METERS];
          return <Line key={`net-${i}-${j}`} points={[world(d.pos, g), sectorCenter]} color="#6ce9f6" lineWidth={1} transparent opacity={0.45} dashed dashSize={0.22} gapSize={0.18} />;
        }))}

      {view.scope==='density'&&Array.from({length:Math.ceil(g.width/6)},(_,sx)=>Array.from({length:Math.ceil(g.height/5)},(_,sz)=>{
        const count=frame.drones.filter(d=>Math.floor(d.pos[0]/6)===sx&&Math.floor(d.pos[1]/5)===sz).length;
        return count>0?<Html key={`density-${sx}-${sz}`} center distanceFactor={35}
          position={[(sx*6+2.5-(g.width-1)/2)*CITY_CELL_METERS,BASE_FLIGHT_HEIGHT+2,(sz*5+2-(g.height-1)/2)*CITY_CELL_METERS]}
          style={{pointerEvents:'none'}}><div className="sector-density-tag"><b>{count}</b><span>UAVs  |  S{sx}-{sz}</span></div></Html>:null;
      }))}
      {view.heatmap && (
        <group>
          {Array.from({ length: Math.ceil(g.width / 6) }, (_, sx) => Array.from({ length: Math.ceil(g.height / 5) }, (_, sz) => {
            const count = frame.drones.filter(d => Math.floor(d.pos[0] / 6) === sx && Math.floor(d.pos[1] / 5) === sz).length;
            return count >= 4 ? (
              <mesh key={`${sx}-${sz}`} position={[(sx*6+3-g.width/2)*CITY_CELL_METERS,0.20,(sz*5+2.5-g.height/2)*CITY_CELL_METERS]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[5.6*CITY_CELL_METERS, 4.6*CITY_CELL_METERS]} />
                <meshBasicMaterial color={count > 17 ? '#ff496f' : '#ffb35d'} transparent opacity={Math.min(0.6, count / 45)} depthWrite={false} />
              </mesh>
            ) : null;
          }))}
        </group>
      )}
    </group>
  );
}


function SelectionBeacon({ drone, grid }: { drone: Drone; grid: Frame['grid'] }) {
  const ring = useRef<THREE.Group>(null);
  const p = world(drone.pos, grid);
  const tint = COLORS[drone.kind] || '#69e6ff';
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 4) * 0.11;
    ring.current.scale.set(pulse, 1, pulse);
  });
  return (
    <group position={p}>
      <group ref={ring}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
          <ringGeometry args={[1.04, 1.13, 54]} />
          <meshBasicMaterial color={tint} transparent opacity={0.96} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]}>
          <ringGeometry args={[1.28, 1.31, 54]} />
          <meshBasicMaterial color={tint} transparent opacity={0.46} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[0, -2.5, 0]}>
        <cylinderGeometry args={[0.014, 0.014, 4.6, 6]} />
        <meshBasicMaterial color={tint} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <Html position={[0, 1.2, 0]} center distanceFactor={12} style={{ pointerEvents: 'none' }}>
        <div className="selected-aircraft-tag" style={{ borderColor: tint }}>
          <strong>UAV-{String(drone.id).padStart(3, '0')}</strong>
          <span>{drone.kind.toUpperCase()}  |  {drone.sector}</span>
        </div>
      </Html>
    </group>
  );
}

function TargetPulse({ position }: { position: [number, number, number] }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 3.2) * 0.14;
    group.current.scale.setScalar(pulse);
    group.current.position.y = position[1] + Math.sin(t * 2.4) * 0.05;
  });
  return (
    <group ref={group} position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.52, 0.76, 42]} />
        <meshBasicMaterial color="#ffd36f" side={THREE.DoubleSide} transparent opacity={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.20, 0.24, 24]} />
        <meshBasicMaterial color="#fff7cf" side={THREE.DoubleSide} transparent opacity={0.95} />
      </mesh>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.7, 12]} />
        <meshBasicMaterial color="#ffd36f" />
      </mesh>
    </group>
  );
}

function InspectedDrone({ drone, grid, onPick, selected=false }: { drone: Drone; grid: Frame['grid']; onPick: (id: number) => void; selected?:boolean }) {
  const loaded = useGLTF(`/models/${drone.kind}.glb`);
  const model = useMemo(() => {
    const cloned = loaded.scene.clone(true);
    cloned.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(m => m.clone());
      else if (mesh.material) mesh.material = mesh.material.clone();
    });
    return cloned;
  }, [loaded.scene]);
  const rotorMeshes = useMemo(() => {
    const nodes: THREE.Object3D[] = [];
    model.traverse(part => { if (part.name.startsWith('rotor_')) nodes.push(part); });
    return nodes;
  }, [model]);
  useEffect(() => {
    model.traverse((part) => {
      const mesh = part as THREE.Mesh;
      if (mesh.isMesh) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m: any) => { if (m.color) m.color.lerp(new THREE.Color('#ffffff'), 0.18); });
        else if ((mesh.material as any)?.color) (mesh.material as any).color.lerp(new THREE.Color('#ffffff'), 0.18);
      }
    });
  }, [model]);
  const flying=useRef<THREE.Group>(null);
  useFrame(({clock},delta) => {
    for (const node of rotorMeshes) node.rotation.y += delta * 21;
    const group=flying.current;if(!group)return;
    const [x,y,z]=world(drone.pos,grid);
    const desired=new THREE.Vector3(x,y+.05*Math.sin(clock.elapsedTime*2.1+drone.id),z);
    group.position.lerp(desired,Math.min(1,delta*4.5));
    const yaw=-drone.heading;
    group.rotation.y+=Math.atan2(Math.sin(yaw-group.rotation.y),Math.cos(yaw-group.rotation.y))*Math.min(1,delta*3.5);
    group.rotation.z=Math.sin(clock.elapsedTime*1.5+drone.id)*.018;
  });
  return (
    <group ref={flying} position={world(drone.pos,grid)} scale={selected?1.36:1.13} onClick={e => { e.stopPropagation(); onPick(drone.id); }}>
      <primitive object={model} />
    </group>
  );
}

function CameraController({ mode, picked, grid }: { mode: string; picked?: Drone; grid: Frame['grid'] }) {
  const { camera, controls } = useThree();
  const previousMode = useRef<string>('');
  useFrame((_, delta) => {
    // Drei makeDefault registers OrbitControls as state.controls.
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (mode === 'focus' && picked) {
      const [x, y, z] = world(picked.pos, grid);
      const target = new THREE.Vector3(x, y, z);
      const speed = Math.min(1, delta * 3.5);
      const ideal = new THREE.Vector3(x + 9.5, y + 5.4, z + 11.5);
      camera.position.lerp(ideal, speed);
      orbit?.target?.lerp(target, speed);
      orbit?.update?.();
    } else if (mode !== previousMode.current) {
      if (mode === 'top') camera.position.set(0.1, 138, 0.2);
      else if (mode === 'street') camera.position.set(33, 5.0, 35);
      else camera.position.set(92, 87, 102);
      orbit?.target?.set(0, mode === 'street' ? 3.5 : BASE_FLIGHT_HEIGHT*.57, 0);
      camera.lookAt(0, mode === 'street' ? 3.5 : BASE_FLIGHT_HEIGHT*.57, 0);
      orbit?.update?.();
    }
    previousMode.current = mode;
  });
  return null;
}

export default function Scene({ frame, selected, onPick, view }: { frame: Frame; selected: number | null; onPick: (id: number) => void; view: ViewPrefs }) {
  const picked = frame.drones.find(d => d.id === selected);
  const visible = useMemo(()=>displayFleet(frame.drones,view,selected),[frame.drones,view,selected]);
  const detailed = useMemo(()=>detailedFleet(visible,selected),[visible,selected]);
  const detailedIds = useMemo(()=>new Set(detailed.map(d=>d.id)),[detailed]);
  const instanced = useMemo(()=>visible.filter(d=>!detailedIds.has(d.id)),[visible,detailedIds]);
  const dims = useMemo(()=>cityDimensions(frame.grid),[frame.grid.width,frame.grid.height,frame.grid.levels]);
  return (
    <Canvas
      shadows={false}
      camera={{ position: [92, 87, 102], fov: 45, near: 0.1, far: 400 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[view.night ? '#0d2539' : '#9cc9df']} />
      {!view.night&&<Sky distance={450000} sunPosition={[100,55,-60]} turbidity={6} rayleigh={1.7} mieCoefficient={.006} mieDirectionalG={.82}/>}
      <fog attach="fog" args={[view.night ? '#0d2539' : '#a0cbdc', 135, 265]} />
      <ambientLight intensity={view.night ? 1.25 : 1.45} />
      <hemisphereLight args={[view.night ? '#bce2ff' : '#f6fcff', '#525f5e', view.night ? 1.2 : 1.8]} />
      <directionalLight position={[11, 23, 9]} intensity={view.night ? 1.9 : 2.3} color={view.night ? '#d8f0ff' : '#ffe8c0'} />
      <directionalLight position={[-12, 18, -10]} intensity={view.night ? 0.8 : 1.1} color="#7edaff" />

      {view.buildings && <Suspense fallback={null}><RealisticCity width={dims.width} height={dims.height} night={view.night} labels={view.labels} grid={view.grid}/></Suspense>}
      <Airspace frame={frame} selected={picked} view={view} />
      <DroneFleet drones={instanced} grid={frame.grid} selected={selected} onPick={onPick} altitude={view.altitude} />
      <Suspense fallback={null}>{detailed.map(drone=><InspectedDrone key={drone.id} drone={drone} grid={frame.grid} selected={drone.id===selected} onPick={onPick}/>)}</Suspense>
      <CameraController mode={view.camera} picked={picked} grid={frame.grid} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={6} maxDistance={245} maxPolarAngle={Math.PI / 2.04} minPolarAngle={0.05} target={[0, 8, 0]} />
    </Canvas>
  );
}
