/**
 * NABH-NITI realistic urban digital twin (procedural, locally textured).
 * The city is an original illustrative Indian-metropolis-inspired testbed,
 * not a surveyed or georeferenced replica of a real city.
 * All generated imagery is bundled in /public/textures and loads offline.
 */
import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import { Grid, Html } from '@react-three/drei';
import * as THREE from 'three';

type CityProps = { width: number; height: number; night: boolean; labels: boolean; grid: boolean };
type Style = 'glass_blue' | 'glass_silver' | 'apartments' | 'brick' | 'concrete' | 'modern' | 'commercial' | 'industrial' | 'hospital' | 'finance';
type LandmarkData = { x: number; z: number; w: number; d: number; h: number; label: string; sub: string; style: Style; color: string; roofPad?: boolean; special?: 'hospital' | 'warehouse' | 'university' | 'finance' | 'vertiport' | 'lab' | 'civic' };
type BldgData = { x: number; z: number; w: number; d: number; h: number; style: Style; rooftop: number; rotation: number };

const styles: Style[] = ['glass_blue', 'glass_silver', 'apartments', 'brick', 'concrete', 'modern', 'commercial', 'industrial', 'hospital', 'finance'];
const texturePaths = [...styles.map(s => `/textures/facade_${s}.jpg`), ...['asphalt', 'pavement', 'grass', 'roof'].map(t => `/textures/ground_${t}.jpg`)];
const hash = (x: number, z: number) => {
  const n = Math.sin(x * 123.71 + z * 41.79 + 7.12) * 43758.545312;
  return n - Math.floor(n);
};

const ROAD_STEP = 7.5;
/** Ten named, separated destinations across a metropolitan-scale visual testbed.
 * These are illustrative places; the original discrete simulation is unchanged.
 */
function makeLandmarks(width: number, height: number): LandmarkData[] {
  const xc = (block: number) => Math.min(width - 4, block * ROAD_STEP + ROAD_STEP * .52) - (width - 1) / 2;
  const zc = (block: number) => Math.min(height - 4, block * ROAD_STEP + ROAD_STEP * .52) - (height - 1) / 2;
  const bx = Math.max(2, Math.floor((width - 1) / ROAD_STEP));
  const bz = Math.max(2, Math.floor((height - 1) / ROAD_STEP));
  const loc = (xf: number, zf: number) => ({ x: xc(Math.round(xf * (bx - 1))), z: zc(Math.round(zf * (bz - 1))) });
  return [
    { ...loc(.12,.12), w: 6.2, d: 5.6, h: 6.1, label: 'MEDICORE', sub: 'METROPOLITAN HOSPITAL', style: 'hospital', color: '#ff577e', roofPad: true, special: 'hospital' },
    { ...loc(.88,.85), w: 7.2, d: 6.0, h: 4.2, label: 'SKYKART', sub: 'CARGO & LOGISTICS', style: 'industrial', color: '#4be2d2', roofPad: true, special: 'warehouse' },
    { ...loc(.27,.84), w: 6.6, d: 5.4, h: 9.2, label: 'NEXA TECH', sub: 'TECHNOLOGY CAMPUS', style: 'glass_blue', color: '#b8a1ff' },
    { ...loc(.87,.12), w: 5.0, d: 4.7, h: 12.4, label: 'AEROFIN', sub: 'FINANCIAL DISTRICT', style: 'finance', color: '#f8d46f', special: 'finance' },
    { ...loc(.51,.11), w: 6.0, d: 5.2, h: 6.4, label: 'CIVIC SHIELD', sub: 'PUBLIC SAFETY HQ', style: 'concrete', color: '#ff829d', special: 'civic' },
    { ...loc(.66,.84), w: 7.1, d: 5.6, h: 4.6, label: 'AEROSTATE', sub: 'UNIVERSITY CAMPUS', style: 'brick', color: '#72e7c5', special: 'university' },
    { ...loc(.12,.43), w: 5.7, d: 4.8, h: 6.8, label: 'ORION LABS', sub: 'ROBOTICS RESEARCH', style: 'modern', color: '#95b7ff', special: 'lab' },
    { ...loc(.88,.55), w: 5.8, d: 5.1, h: 6.2, label: 'SKYLINK', sub: 'DATA CENTER', style: 'glass_silver', color: '#4bf0d5' },
    { ...loc(.39,.83), w: 5.8, d: 5.2, h: 5.1, label: 'SAFFRON BIO', sub: 'PHARMA CAMPUS', style: 'modern', color: '#e2b8ff', special: 'lab' },
    { ...loc(.56,.55), w: 5.4, d: 5.2, h: 4.2, label: 'ASTRADYNAMICS', sub: 'AIRSPACE VERTIPORT', style: 'glass_silver', color: '#55d9ff', roofPad: true, special: 'vertiport' },
  ];
}

function createDistrict(width: number, height: number, landmarks: LandmarkData[]): BldgData[] {
  const result: BldgData[] = [];
  const palette: Style[] = ['glass_blue','apartments','brick','concrete','glass_silver','modern','commercial','apartments'];
  const cx = (width - 1) / 2, cz = (height - 1) / 2;
  for (let cellX = 0; cellX < width - 1; cellX += ROAD_STEP) {
    for (let cellZ = 0; cellZ < height - 1; cellZ += ROAD_STEP) {
      // Gaps between towers intentionally represent parks, plazas and open yards.
      const zone=hash(cellX*.61+7,cellZ*.97+9);
      if(zone<.085)continue;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const x=cellX + 2.15 + i * 2.65 - cx;
          const z=cellZ + 2.12 + j * 2.75 - cz;
          if(Math.abs(x)>(width-2)/2||Math.abs(z)>(height-2)/2)continue;
          const k=hash(cellX*4.7+i*1.7,cellZ*3.31+j*2.14);
          if(k<.37)continue;
          const w=1.55+hash(x+5,z+12)*.65;
          const d=1.50+hash(x+8,z+9)*.72;
          if(landmarks.some(l=>Math.abs(x-l.x)<(w+l.w)/2+.28&&Math.abs(z-l.z)<(d+l.d)/2+.28))continue;
          // Preserve a meaningful civic green space in the center.
          if(Math.abs(x+5)<5.2&&Math.abs(z-5)<4.0)continue;
          const middle=Math.max(0,1-Math.hypot(x/(width*.5),z/(height*.5)));
          const h=2.6+hash(x+32,z+14)*4.2 + middle*(1.7+hash(x-15,z+7)*3.4);
          const index=Math.floor(hash(x-11,z+29)*palette.length);
          result.push({x,z,w,d,h,style:palette[index],rooftop:Math.floor(k*4),rotation:k>.84?Math.PI/2:0});
        }
      }
    }
  }
  return result;
}

type Mats = Record<Style, THREE.MeshStandardMaterial> & { roof: THREE.MeshStandardMaterial; asphalt: THREE.MeshStandardMaterial; grass: THREE.MeshStandardMaterial; pavement: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial; glass: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial };

function getMats(textures: THREE.Texture[], night: boolean): Mats {
  const mats = {} as Mats;
  styles.forEach((name, i) => {
    mats[name] = new THREE.MeshStandardMaterial({ map: textures[i], metalness: name.startsWith('glass') || name === 'finance' ? 0.45 : 0.07, roughness: name.startsWith('glass') || name === 'finance' ? .26 : .75, emissive: new THREE.Color(night ? '#243747' : '#0e1e28'), emissiveMap: textures[i], emissiveIntensity: night ? .18 : .035 });
  });
  mats.roof = new THREE.MeshStandardMaterial({ map: textures[13], color: '#d9e0e3', roughness: 0.79, metalness: 0.17 });
  mats.asphalt = new THREE.MeshStandardMaterial({ map: textures[10], color: '#919c9e', roughness: 0.97 });
  mats.pavement = new THREE.MeshStandardMaterial({ map: textures[11], color: '#e2ddd2', roughness: 0.9 });
  mats.grass = new THREE.MeshStandardMaterial({ map: textures[12], color: '#a2c4a4', roughness: 1.0 });
  mats.trim = new THREE.MeshStandardMaterial({ color: '#acb3b5', roughness: .56, metalness: .2 });
  mats.glass = new THREE.MeshStandardMaterial({ color: '#5c9eb8', roughness: .2, metalness: .5 });
  mats.metal = new THREE.MeshStandardMaterial({ color: '#4e6572', metalness: .56, roughness: .4 });
  return mats;
}

function RoofEquipment({ w, d, h, variant, mats }: { w: number; d: number; h: number; variant: number; mats: Mats }) {
  return <group position={[0, h + .12, 0]}>
    {/* Roof parapet and mechanically plausible HVAC equipment. */}
    <mesh position={[0, 0, -d / 2 + .09]} material={mats.trim}><boxGeometry args={[w, .22, .12]} /></mesh>
    <mesh position={[0, 0, d / 2 - .09]} material={mats.trim}><boxGeometry args={[w, .22, .12]} /></mesh>
    <mesh position={[-w / 2 + .09, 0, 0]} material={mats.trim}><boxGeometry args={[.12, .22, d]} /></mesh>
    <mesh position={[w / 2 - .09, 0, 0]} material={mats.trim}><boxGeometry args={[.12, .22, d]} /></mesh>
    <mesh position={[w * .17, .22, d * .13]} material={mats.metal}>
      <boxGeometry args={[w * .34, .32, d * .27]} />
    </mesh>
    <mesh position={[-w * .19, .28, -d * .16]} material={mats.roof}>
      <boxGeometry args={[w * .23, .42, d * .29]} />
    </mesh>
    {variant % 2 === 0 && (
      <group position={[w * .08, .47, -d * .22]}>
        <mesh material={mats.metal}><cylinderGeometry args={[.14, .17, .42, 12]} /></mesh>
        <mesh position={[0, .22, 0]} material={mats.trim}><cylinderGeometry args={[.18, .18, .04, 12]} /></mesh>
      </group>
    )}
  </group>;
}

function Architecture({ data, mats, landmark = false }: { data: BldgData; mats: Mats; landmark?: boolean }) {
  const { x, z, w, d, h, style, rooftop } = data;
  const usePodium = style === 'finance' || style === 'glass_blue' || style === 'glass_silver' || style === 'modern';
  return (
    <group position={[x, .12, z]} rotation={[0, data.rotation, 0]}>
      <mesh position={[0, h / 2, 0]} material={[mats[style], mats[style], mats.roof, mats.roof, mats[style], mats[style]]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {usePodium && <mesh position={[0, .30, 0]} material={mats.glass}><boxGeometry args={[w + .14, .55, d + .13]} /></mesh>}
      {/* A visibly layered facade: concrete floor banding and shallow glass awning. */}
      <mesh position={[0, h - .09, 0]} material={mats.trim}>
        <boxGeometry args={[w + .09, .16, d + .09]} />
      </mesh>
      {style === 'apartments' && (
        <>
          <mesh position={[0, h * .48, d / 2 + .13]} material={mats.trim}><boxGeometry args={[w * .89, .06, .24]} /></mesh>
          <mesh position={[0, h * .76, d / 2 + .13]} material={mats.trim}><boxGeometry args={[w * .89, .06, .24]} /></mesh>
          <mesh position={[0, h * .90, -d / 2 - .12]} material={mats.trim}><boxGeometry args={[w * .75, .045, .22]} /></mesh>
        </>
      )}
      {(style === 'commercial' || style === 'brick') && (
        <mesh position={[0, .52, d / 2 + .22]} material={mats.metal}>
          <boxGeometry args={[w * .9, .08, .45]} />
        </mesh>
      )}
      {(h > 2.5 || landmark) && <RoofEquipment w={w} d={d} h={h} variant={rooftop} mats={mats} />}
    </group>
  );
}

function Helipad({ y, radius, accent }: { y: number; radius: number; accent: string }) {
  return <group position={[0, y, 0]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 48]} /><meshStandardMaterial color="#343d43" roughness={.75}/>
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .01, 0]}>
      <ringGeometry args={[radius * .72, radius * .78, 48]} /><meshBasicMaterial color="#f2f6f2" side={THREE.DoubleSide}/>
    </mesh>
    <mesh position={[0, .018, 0]}><boxGeometry args={[radius * .1, .012, radius * .72]} /><meshBasicMaterial color="#f5f7f5" /></mesh>
    <mesh position={[-radius * .22, .018, 0]}><boxGeometry args={[radius * .09, .012, radius * .72]} /><meshBasicMaterial color="#f5f7f5" /></mesh>
    <mesh position={[radius * .22, .018, 0]}><boxGeometry args={[radius * .09, .012, radius * .72]} /><meshBasicMaterial color="#f5f7f5" /></mesh>
    {[0, 1, 2, 3].map(i => <mesh key={i} position={[Math.cos(i * Math.PI / 2) * radius * .9, .07, Math.sin(i * Math.PI / 2) * radius * .9]}>
      <sphereGeometry args={[.055, 8, 6]} /><meshBasicMaterial color={accent} toneMapped={false} />
    </mesh>)}
  </group>;
}

function Landmark({ item, mats, labels }: { item: LandmarkData; mats: Mats; labels: boolean }) {
  const building: BldgData = { x: item.x, z: item.z, w: item.w, d: item.d, h: item.h, style: item.style, rooftop: 1, rotation: 0 };
  const h = item.h;
  return <group>
    <Architecture data={building} mats={mats} landmark />
    <group position={[item.x, .12, item.z]}>
      {item.special === 'finance' && <>
        <mesh position={[0, h + .57, 0]} material={mats.finance}><boxGeometry args={[item.w * .63, 1.0, item.d * .65]} /></mesh>
        <mesh position={[0, h + 1.57, 0]}><cylinderGeometry args={[.025, .065, 1.18, 10]} /><meshStandardMaterial color="#d8e7ec" metalness={.6} roughness={.3} /></mesh>
      </>}
      {(item.special === 'hospital' || item.special === 'civic') && <group position={[0, h * .58, item.d / 2 + .06]}>
        <mesh><boxGeometry args={[.12, .85, .055]} /><meshBasicMaterial color={item.color} toneMapped={false}/></mesh>
        <mesh><boxGeometry args={[.82, .14, .06]} /><meshBasicMaterial color={item.color} toneMapped={false}/></mesh>
      </group>}
      {item.special === 'warehouse' && [-1, 0, 1].map(i => <group key={i} position={[i * .95, .46, item.d / 2 + .017]}>
        <mesh material={mats.metal}><boxGeometry args={[.73, .84, .055]} /></mesh>
        <mesh position={[0, .16, .035]}><boxGeometry args={[.61, .025, .015]} /><meshBasicMaterial color="#bdcdd3" /></mesh>
      </group>)}
      {item.special === 'university' && <>
        <mesh position={[0, h + .23, 0]} material={mats.brick}><boxGeometry args={[1.4, .42, 1.4]} /></mesh>
        <mesh position={[0, h + .65, 0]}><coneGeometry args={[.83, .54, 4]} /><meshStandardMaterial color="#405660" /></mesh>
      </>}
      {item.special === 'lab' && <mesh position={[0, h + .31, 0]} material={mats.glass}><boxGeometry args={[item.w * .53, .48, item.d * .58]} /></mesh>}
      {item.roofPad && <Helipad y={h + .27} radius={Math.min(item.w, item.d) * .27} accent={item.color} />}
      {item.special === 'vertiport' && <>
        <mesh position={[0, .31, item.d / 2 + .4]} material={mats.metal}><boxGeometry args={[item.w * .8, .13, 1.15]} /></mesh>
        <mesh position={[0, .50, item.d / 2 + .65]} material={mats.glass}><boxGeometry args={[item.w * .72, .35, .40]} /></mesh>
      </>}
      {labels && <Html position={[0, h + (item.special === 'finance' ? 3.15 : 1.28), 0]} center distanceFactor={28} style={{ pointerEvents: 'none' }}>
        <div className="skyline-location skyline-location--real" style={{ borderColor: `${item.color}a0` }}>
          <span className="skyline-location__light" style={{ background: item.color }} />
          <span><b>{item.label}</b><small>{item.sub}</small></span>
        </div>
      </Html>}
    </group>
  </group>;
}

function Tree({ x, z, scale = 1, variant = 0 }: { x: number; z: number; scale?: number; variant?: number }) {
  const green = ['#497a4c', '#3d7449', '#648a50', '#4b855f'][variant % 4];
  return <group position={[x, .16, z]} scale={scale}>
    <mesh position={[0, .40, 0]}><cylinderGeometry args={[.045, .066, .8, 7]} /><meshStandardMaterial color="#765c48" roughness={1} /></mesh>
    <mesh position={[0, .93, 0]}><dodecahedronGeometry args={[.42, 0]} /><meshStandardMaterial color={green} roughness={.94} /></mesh>
    <mesh position={[.18, .78, -.13]}><dodecahedronGeometry args={[.30, 0]} /><meshStandardMaterial color="#598d52" roughness={.98} /></mesh>
    <mesh position={[-.17, 1.06, .06]}><dodecahedronGeometry args={[.29, 0]} /><meshStandardMaterial color="#639c5b" roughness={.98} /></mesh>
  </group>;
}

function Lamp({ x, z, night }: { x: number; z: number; night: boolean }) {
  return <group position={[x, .16, z]}>
    <mesh position={[0, .74, 0]}><cylinderGeometry args={[.025, .039, 1.48, 8]} /><meshStandardMaterial color="#4a545d" roughness={.55} metalness={.65} /></mesh>
    <mesh position={[.16, 1.46, 0]}><boxGeometry args={[.37, .045, .065]} /><meshStandardMaterial color="#5a666c" metalness={.55} /></mesh>
    <mesh position={[.32, 1.41, 0]}><boxGeometry args={[.16, .06, .15]} /><meshBasicMaterial color={night ? '#ffe4a5' : '#cddde2'} toneMapped={false}/></mesh>
  </group>;
}

function Car({ x, z, angle, color, truck = false }: { x: number; z: number; angle: number; color: string; truck?: boolean }) {
  return <group position={[x, .15, z]} rotation={[0, angle, 0]} scale={truck ? 1.25 : 1}>
    <mesh position={[0, .18, 0]}><boxGeometry args={[.39, .22, .78]} /><meshStandardMaterial color={color} metalness={.34} roughness={.42} /></mesh>
    <mesh position={[0, .34, -.09]}><boxGeometry args={[.31, .16, .38]} /><meshStandardMaterial color="#263d49" metalness={.2} roughness={.24} /></mesh>
    {[-1, 1].map(dx => [-1, 1].map(dz => <mesh key={`${dx}${dz}`} position={[dx * .205, .12, dz * .24]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[.095, .095, .075, 10]} /><meshStandardMaterial color="#161c22" roughness={.9}/>
    </mesh>))}
    <mesh position={[0, .19, -.399]}><boxGeometry args={[.22, .055, .015]} /><meshBasicMaterial color="#ffdf9e" /></mesh>
    <mesh position={[0, .19, .399]}><boxGeometry args={[.22, .05, .015]} /><meshBasicMaterial color="#fa5961" /></mesh>
  </group>;
}

function Streets({ width, height, mats, night }: { width: number; height: number; mats: Mats; night: boolean }) {
  const cx = (width - 1) / 2, cz = (height - 1) / 2;
  const roadX = Array.from({ length: Math.ceil(width / ROAD_STEP) }, (_, i) => i * ROAD_STEP - cx);
  const roadZ = Array.from({ length: Math.ceil(height / ROAD_STEP) }, (_, i) => i * ROAD_STEP - cz);
  const cars = useMemo(() => {
    const colors = ['#cb4d46', '#d8dbe0', '#45718c', '#e5bf72', '#526a70', '#b2b6ba', '#6a9163', '#294e72'];
    const list: { x: number; z: number; a: number; c: string; truck: boolean }[] = [];
    for (let i = 0; i < 65; i++) {
      const vertical = i % 2 === 0;
      const lane = Math.floor(hash(i + 4, 21) * (vertical ? roadX.length : roadZ.length));
      const coordinate = (hash(i + 19, 36) * (vertical ? height - 3 : width - 3)) - (vertical ? cz : cx);
      const fixed = vertical ? roadX[lane] + (i % 4 === 0 ? .27 : -.27) : roadZ[lane] + (i % 4 === 0 ? .27 : -.27);
      list.push({ x: vertical ? fixed : coordinate, z: vertical ? coordinate : fixed, a: vertical ? 0 : Math.PI / 2, c: colors[i % colors.length], truck: i % 11 === 0 });
    }
    return list;
  }, [width, height]);
  return <group>
    <mesh position={[0, -.085, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.grass} receiveShadow>
      <planeGeometry args={[width + 12, height + 12]} />
    </mesh>
    <mesh position={[0, .015, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.pavement} receiveShadow>
      <planeGeometry args={[width + 3, height + 3]} />
    </mesh>
    {roadX.map((x, i) => <group key={`road-x-${i}`}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, .08, 0]} material={mats.asphalt} receiveShadow>
        <planeGeometry args={[1.35, height + 2]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x - .73, .081, 0]}>
        <planeGeometry args={[.035, height + 2]} /><meshBasicMaterial color="#d9d4c1" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x + .73, .081, 0]}>
        <planeGeometry args={[.035, height + 2]} /><meshBasicMaterial color="#d9d4c1" />
      </mesh>
      {Array.from({ length: Math.floor(height / 2.25) }, (_, j) => {
        const z = -cz + .1 + j * 2.25;
        return <mesh key={`mark-x-${i}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, .091, z]}>
          <planeGeometry args={[.045, .60]} /><meshBasicMaterial color="#e9e2c9" />
        </mesh>;
      })}
    </group>)}
    {roadZ.map((z, i) => <group key={`road-z-${i}`}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .084, z]} material={mats.asphalt} receiveShadow>
        <planeGeometry args={[width + 2, 1.35]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .085, z - .73]}><planeGeometry args={[width + 2, .035]} /><meshBasicMaterial color="#d9d4c1" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .085, z + .73]}><planeGeometry args={[width + 2, .035]} /><meshBasicMaterial color="#d9d4c1" /></mesh>
      {Array.from({ length: Math.floor(width / 2.25) }, (_, j) => {
        const x = -cx + .1 + j * 2.25;
        return <mesh key={`mark-z-${i}-${j}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, .093, z]}>
          <planeGeometry args={[.60, .045]} /><meshBasicMaterial color="#e9e2c9" />
        </mesh>;
      })}
    </group>)}
    {/* Zebra crossings on the main road junctions: readable from overhead view. */}
    {roadX.flatMap((x, i) => roadZ.filter((_, j) => (i + j) % 2 === 0).map((z, j) =>
      <group key={`crosswalk-${i}-${j}`} position={[x + 1, .12, z]}>
        {Array.from({ length: 6 }, (_, a) => <mesh key={a} rotation={[-Math.PI / 2, 0, 0]} position={[(a - 2) * .18, 0, 0]}>
          <planeGeometry args={[.105, .6]} /><meshBasicMaterial color="#e9ece7" />
        </mesh>)}
      </group>
    ))}
    {cars.map((c, i) => <Car key={i} x={c.x} z={c.z} angle={c.a} color={c.c} truck={c.truck} />)}
    {roadX.flatMap((x, i) => roadZ.filter((_, j) => (i + j) % 2 === 0).map((z, j) =>
      <Lamp key={`lamp-${i}-${j}`} x={x + 1.15} z={z + 1.15} night={night} />
    ))}
  </group>;
}

function Greenery({ width, height, landmarks, buildings }: { width: number; height: number; landmarks: LandmarkData[]; buildings: BldgData[] }) {
  const cx=(width-1)/2,cz=(height-1)/2;
  const trees=useMemo(() => {
    const out: { x: number; z: number; variant: number; scale: number }[] = [];
    for (let i = 0; i < 245; i++) {
      const x = hash(i + 12, 31) * (width - 1) - cx;
      const z = hash(46, i * 3.7 + 17) * (height - 1) - cz;
      if (Math.min(...Array.from({ length: Math.ceil(width / ROAD_STEP) }, (_, k) => Math.abs(x - (k * ROAD_STEP - cx)))) < .82) continue;
      if (Math.min(...Array.from({ length: Math.ceil(height / ROAD_STEP) }, (_, k) => Math.abs(z - (k * ROAD_STEP - cz)))) < .82) continue;
      if (landmarks.some(l=>Math.abs(x-l.x)<l.w/2+.36&&Math.abs(z-l.z)<l.d/2+.36))continue;
      if (buildings.some(b=>Math.abs(x-b.x)<b.w/2+.20&&Math.abs(z-b.z)<b.d/2+.20))continue;
      out.push({ x, z, variant: i, scale: .52 + hash(i, 47) * .55 });
    }
    return out;
  }, [width, height, landmarks, buildings]);
  const park:[number,number]=[-5,5];
  return <group>
    <mesh rotation={[-Math.PI/2,0,0]} position={[park[0], .128, park[1]]}>
      <planeGeometry args={[10.5, 8.2]}/><meshStandardMaterial color="#5b9b65" roughness={1}/>
    </mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[park[0], .14, park[1]]}>
      <ringGeometry args={[.9,1.07,64]}/><meshStandardMaterial color="#d9d4c6" side={THREE.DoubleSide}/>
    </mesh>
    <mesh position={[park[0], .32, park[1]]}><cylinderGeometry args={[.38,.55,.46,24]} /><meshStandardMaterial color="#c4ced0" /></mesh>
    <mesh position={[park[0], .61, park[1]]}><sphereGeometry args={[.29,20,16]} /><meshBasicMaterial color="#64cae7" transparent opacity={.70}/></mesh>
    {[-1,1].flatMap(dx=>[-1,1].map(dz=><Tree key={`${dx}-${dz}`} x={park[0]+dx*3.2} z={park[1]+dz*2.8} scale={.65} variant={dx+dz+3}/>))}
    {trees.map((t,i)=><Tree key={i} {...t}/>)}
  </group>;
}

export default function RealisticCity({ width, height, night, labels, grid }: CityProps) {
  const textures = useLoader(THREE.TextureLoader, texturePaths);
  useMemo(() => {
    for (const [i, t] of textures.entries()) {
      t.colorSpace = THREE.SRGBColorSpace;
      if (i >= styles.length) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(i === 10 ? 2 : 5, i === 10 ? 8 : 5);
      }
      t.anisotropy = 8;
      t.needsUpdate = true;
    }
  }, [textures]);
  const mats = useMemo(() => getMats(textures, night), [textures, night]);
  useEffect(() => () => {
    for (const m of Object.values(mats)) m.dispose();
  }, [mats]);
  const landmarks = useMemo(() => makeLandmarks(width, height), [width, height]);
  const buildings = useMemo(() => createDistrict(width, height, landmarks), [width, height, landmarks]);
  return <group>
    <Streets width={width} height={height} mats={mats} night={night}/>
    {buildings.map((data, i) => <Architecture key={i} data={data} mats={mats}/>)}
    {landmarks.map(item => <Landmark key={item.label} item={item} mats={mats} labels={labels}/>)}
    <Greenery width={width} height={height} landmarks={landmarks} buildings={buildings}/>
    {grid&&<Grid args={[width + 7, height + 7]} position={[0, .125, 0]} cellSize={2} cellThickness={.14} cellColor="#7f9aa6" sectionSize={ROAD_STEP} sectionThickness={.26} sectionColor="#719aad" fadeDistance={190} infiniteGrid={false}/>}
  </group>;
}
