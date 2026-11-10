"""Render a contact sheet directly from the bundled ORIGINAL aircraft GLB meshes.

This is a static preview, not a browser/WebGL benchmark. Requires trimesh and matplotlib.
"""
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
import numpy as np
import trimesh

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/FLEET_PREVIEW.png'
LABELS=[('medical','EMERGENCY MEDICAL','PRIORITY TRANSPORT'),('delivery','CITY DELIVERY','LOCAL LOGISTICS'),
        ('inspection','INFRASTRUCTURE','CAMERA INSPECTION'),('survey','AERIAL SURVEY','SENSOR MISSIONS'),
        ('cargo','HEAVY CARGO','HEXACOPTER PLATFORM')]
fig=plt.figure(figsize=(15,8.4),facecolor='#081624')
fig.text(.05,.94,'NABH—NITI  /  AIRCRAFT FLEET',fontsize=25,fontweight='bold',color='#e4f7ff')
fig.text(.05,.901,'FIVE ORIGINAL 3D GLB MODELS  ·  QUADCOPTERS + HEXACOPTER  ·  NOT ARROWS',fontsize=10,color='#65b9c8',fontweight='bold')
for i,(kind,title,desc) in enumerate(LABELS):
    ax=fig.add_subplot(2,3,i+1,projection='3d',facecolor='#101f30')
    scene=trimesh.load(ROOT/f'frontend/public/models/{kind}.glb',force='scene')
    for mesh in scene.dump(concatenate=False):
        if not isinstance(mesh,trimesh.Trimesh):continue
        faces=mesh.vertices[mesh.faces]
        if len(faces)==0:continue
        c=np.array(mesh.visual.face_colors).astype(float)/255.
        if len(c)!=len(faces):c=np.broadcast_to(c[0],(len(faces),4))
        # Slightly boost exposure against the dark preview background.
        c=np.clip(c.copy(),0,1)
        c[:,:3]=np.minimum(1,c[:,:3]*.85+.13)
        coll=Poly3DCollection(faces,facecolors=c,linewidths=.045,edgecolors=(.12,.24,.32,.32))
        ax.add_collection3d(coll)
    ext=1.5 if kind=='cargo' else 1.05
    ax.set_xlim(-ext,ext);ax.set_ylim(-ext*.62,ext*.62);ax.set_zlim(-ext,ext)
    ax.view_init(elev=28,azim=52)
    ax.set_box_aspect((1.6,.62,1.6))
    ax.set_axis_off()
    box=ax.get_position();fig.text(box.x0+.018,box.y0+.038,title,color='#d7f4ff',fontsize=12,fontweight='bold')
    fig.text(box.x0+.018,box.y0+.014,desc,color='#6b9fb2',fontsize=9)
fig.text(.05,.045,'Models are included as local .glb assets. Actual web dashboard uses instanced multirotor fleet geometry and click-to-inspect GLB details.',
         color='#7197ac',fontsize=9)
fig.subplots_adjust(left=.035,right=.97,bottom=.08,top=.88,wspace=.02,hspace=.14)
OUT.parent.mkdir(parents=True,exist_ok=True)
fig.savefig(OUT,dpi=155,facecolor=fig.get_facecolor())
print(OUT,OUT.stat().st_size)
