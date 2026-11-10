"""Generate original, self-contained GLB aircraft assets; no stock model licenses.

Each mesh is a procedural multirotor with body, landing gear, motors and
separately named rotors for animation. Units are visual simulation units,
not physically calibrated to flight dynamics.
"""
from __future__ import annotations
from pathlib import Path
import math
import numpy as np
import trimesh

OUT=Path(__file__).resolve().parents[1]/"frontend/public/models"
OUT.mkdir(parents=True,exist_ok=True)
CONFIG={
 'medical':dict(n=4,scale=1.05,hull='#f0f5ee',trim='#ef4967',cabin='#f0f5ee'),
 'delivery':dict(n=4,scale=.95,hull='#3587a6',trim='#4be2e3',cabin='#e0ad67'),
 'inspection':dict(n=4,scale=.82,hull='#334858',trim='#f2c56f',cabin='#263847'),
 'survey':dict(n=4,scale=.92,hull='#756cc3',trim='#aaa1ff',cabin='#355b76'),
 'cargo':dict(n=6,scale=1.33,hull='#42535c',trim='#7ce2ba',cabin='#d3b37b'),
}
def rgba(color):
 color=color.strip('#');return [int(color[i:i+2],16) for i in (0,2,4)]+[255]
def add(scene,geom,name,color,pos=None,rotation=None):
 geom.visual.face_colors=np.tile(np.array(rgba(color),dtype='uint8'),(len(geom.faces),1))
 transform=np.eye(4)
 if rotation is not None: transform[:3,:3]=rotation[:3,:3]
 if pos is not None:transform[:3,3]=pos
 scene.add_geometry(geom,node_name=name,geom_name=name,transform=transform)

def tube(length,radius=0.038,sections=12):return trimesh.creation.cylinder(radius=radius,height=length,sections=sections)
def box(extents):return trimesh.creation.box(extents=extents)
def ellipsoid(radius=(.45,.15,.35)):
 m=trimesh.creation.icosphere(subdivisions=2,radius=1)
 m.apply_scale(radius)
 return m

def generate(kind,cfg):
 scene=trimesh.Scene()
 sc=cfg['scale'];n=cfg['n']
 add(scene,ellipsoid((.43*sc,.16*sc,.31*sc)),f'{kind}_body',cfg['hull'])
 add(scene,box((.40*sc,.06*sc,.32*sc)),f'{kind}_topdeck',cfg['trim'],pos=(0,.16*sc,0))
 for arm in range(n):
  theta=2*math.pi*arm/n+math.pi/4
  rx=.67*math.cos(theta)*sc;rz=.67*math.sin(theta)*sc
  beam=tube(.78*sc,radius=.045*sc)
  # Cylinder originally along Z; orient cylinder from middle of body to rotor.
  direction=np.array([math.cos(theta),0,math.sin(theta)])
  R=trimesh.geometry.align_vectors([0,0,1],direction)
  add(scene,beam,f'arm_{arm}',cfg['trim'],pos=(rx*.54,0,rz*.54),rotation=R)
  add(scene,trimesh.creation.cylinder(radius=.14*sc,height=.13*sc,sections=16),
       f'motor_{arm}','#1b2832',pos=(rx,.05*sc,rz),
       rotation=trimesh.geometry.align_vectors([0,0,1],[0,1,0]))
  # Authentic-looking protective motor ring, rigid rather than a direction arrow.
  guard=trimesh.creation.annulus(r_min=.265*sc,r_max=.281*sc,height=.026*sc,sections=36)
  add(scene,guard,f'rotor_guard_{arm}','#687c88',pos=(rx,.145*sc,rz),
      rotation=trimesh.geometry.align_vectors([0,0,1],[0,1,0]))
  # Short navigation light pod on the outside of each motor.
  add(scene,trimesh.creation.icosphere(subdivisions=1,radius=.036*sc),
      f'navlight_{arm}','#82f3f4' if arm%2 else '#fa607c',
      pos=(rx+(.12*sc if rx>=0 else -.12*sc),.06*sc,rz))
  # Rotor blades are separate node transforms, so the frontend can animate
  # each around its own motor shaft, rather than rotating the whole drone.
  rotor=box((.47*sc,.021*sc,.065*sc));rotor2=box((.065*sc,.021*sc,.47*sc))
  add(scene,rotor,f'rotor_{arm}_bladeA','#e3f3ee',pos=(rx,.145*sc,rz))
  add(scene,rotor2,f'rotor_{arm}_bladeB','#cfe2e1',pos=(rx,.149*sc,rz))
  add(scene,trimesh.creation.cylinder(radius=.055*sc,height=.035*sc,sections=12),
       f'prop_cap_{arm}',cfg['trim'],pos=(rx,.16*sc,rz),
       rotation=trimesh.geometry.align_vectors([0,0,1],[0,1,0]))
 for side in (-1,1):
  add(scene,box((.035*sc,.27*sc,.035*sc)),f'landing_pillar_{side}_a','#85969f',pos=(side*.26*sc,-.23*sc,-.19*sc))
  add(scene,box((.035*sc,.27*sc,.035*sc)),f'landing_pillar_{side}_b','#85969f',pos=(side*.26*sc,-.23*sc,.19*sc))
  add(scene,box((.045*sc,.045*sc,.65*sc)),f'landing_skid_{side}','#acbbc1',pos=(side*.26*sc,-.36*sc,0))
 if kind=='medical':
  # Red cross on the upper panel: clearly legible from overhead.
  add(scene,box((.07*sc,.018*sc,.26*sc)),'medical_top_cross_NS','#ef4664',pos=(0,.204*sc,0))
  add(scene,box((.26*sc,.018*sc,.07*sc)),'medical_top_cross_EW','#ef4664',pos=(0,.215*sc,0))
  add(scene,box((.39*sc,.22*sc,.30*sc)),'medical_case','#f3f8f8',pos=(0,-.19*sc,0))
  add(scene,box((.075*sc,.013*sc,.23*sc)),'medical_cross_z','#ed465b',pos=(0,-.3*sc,0))
  add(scene,box((.23*sc,.013*sc,.075*sc)),'medical_cross_x','#ed465b',pos=(0,-.308*sc,0))
 elif kind in ('delivery','cargo'):
  dims=(.45,.34,.49) if kind=='delivery' else (.68,.42,.70)
  add(scene,box(tuple(a*sc for a in dims)),'cargo_payload','#cca66b',pos=(0,-.23*sc,0))
  add(scene,box((dims[0]*sc,.03*sc,dims[2]*sc)),'cargo_strap',cfg['trim'],pos=(0,-.23*sc,0))
 elif kind=='inspection':
  add(scene,trimesh.creation.icosphere(subdivisions=2,radius=.13*sc),'gimbal','#93a8b6',pos=(0,-.22*sc,-.22*sc))
  add(scene,trimesh.creation.cylinder(radius=.055*sc,height=.07*sc,sections=12),
      'camera_lens','#1a2938',pos=(0,-.22*sc,-.35*sc))
 elif kind=='survey':
  add(scene,tube(.25*sc,radius=.018*sc),'survey_antenna','#cde4ed',pos=(0,.29*sc,0),
      rotation=trimesh.geometry.align_vectors([0,0,1],[0,1,0]))
 file=OUT/f'{kind}.glb';file.write_bytes(scene.export(file_type='glb'))
 print(kind,file.stat().st_size,'bytes',len(scene.geometry),'meshes')

if __name__=='__main__':
 for kind,cfg in CONFIG.items():generate(kind,cfg)
