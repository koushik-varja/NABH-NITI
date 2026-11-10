"""Dependency-free asset/source audit for the realistic-city showcase.

NOT a browser rendering test or substitute for `npm run build`.
"""
from __future__ import annotations
import json
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'frontend/src'
SCENE=(SRC/'Scene.tsx').read_text(encoding='utf-8')
CITY=(SRC/'RealisticCity.tsx').read_text(encoding='utf-8')
APP=(SRC/'App.tsx').read_text(encoding='utf-8')
CSS=(SRC/'style.css').read_text(encoding='utf-8')
TEXTURES=ROOT/'frontend/public/textures'
MODELS=ROOT/'frontend/public/models'
STYLES=['glass_blue','glass_silver','apartments','brick','concrete','modern','commercial','industrial','hospital','finance']
GROUND=['asphalt','pavement','grass','roof']
images=[TEXTURES/f'facade_{name}.jpg' for name in STYLES]+[TEXTURES/f'ground_{name}.jpg' for name in GROUND]
model_names=['medical','delivery','inspection','survey','cargo']
checks={
 'textured city rendered in existing 3D scene': "<RealisticCity width={dims.width}" in SCENE and "cityDimensions(frame.grid)" in SCENE,
 'all ten branded 3D destinations maintained': all(name in CITY for name in ('MEDICORE','SKYKART','NEXA TECH','AEROFIN','CIVIC SHIELD','AEROSTATE','ORION LABS','SKYLINK','SAFFRON BIO','ASTRADYNAMICS')),
 'ten types of textured façades included': len(STYLES)==10 and all(f'facade_{name}' in CITY or '/textures/facade_${s}' in CITY for name in STYLES),
 'every city texture exists': all(p.is_file() for p in images),
 'every texture is a readable image': all(Image.open(p).verify() is None for p in images),
 'street network and markings implemented': 'crosswalk-' in CITY and 'mark-x-' in CITY and 'mark-z-' in CITY,
 'park, trees, road vehicles, streetlights present': all(s in CITY for s in ('function Greenery','function Tree','function Car','function Lamp')),
 'named buildings have rooftop detail': all(s in CITY for s in ('function RoofEquipment','function Helipad','function Architecture')),
 'airspace still has sector and altitude visualization': 'frame.norms.map' in SCENE and 'level-' in SCENE,
 'drone fleet remains colored by instance': 'setColorAt(index, color)' in SCENE and 'vertexColors' not in SCENE,
 'all original multirotor flight visuals remain': all(s in SCENE for s in ('rotorOffsets','motors.current','blades.current','emergencyBeacons.current')),
 'selected drone route remains visible': 'selected.path.map(p => world(p, g))' in SCENE,
 'selected target pulse remains visible': '<TargetPulse position={world(selected.target, g)} />' in SCENE,
 'selected drone follow camera preserved': "mode === 'focus' && picked" in SCENE,
 'day mode is initial state': 'night:false' in APP,
 'drone HUD and branded labels preserved': 'showcase-focus-card' in APP and '.skyline-location' in CSS,
 'all five GLB aircraft present': all((MODELS/f'{name}.glb').is_file() for name in model_names),
 'all five GLB aircraft have binary glTF headers': all((MODELS/f'{name}.glb').read_bytes()[:4]==b'glTF' for name in model_names),
}
print('NABH-NITI Realistic City Showcase — source and asset audit')
for name, ok in checks.items():
    print(('PASS' if ok else 'FAIL')+'  '+name)
print(f'{sum(checks.values())}/{len(checks)} checks passed')
print('Source checks do not establish browser appearance, frame rates, or production build success.')
if not all(checks.values()):
    raise SystemExit(json.dumps([k for k,ok in checks.items() if not ok]))
