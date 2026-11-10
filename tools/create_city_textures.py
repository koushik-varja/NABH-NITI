"""Generate original, reusable façade/ground textures for NABH-NITI's 3D city.
Requires only Pillow and NumPy; textures are committed to public/textures.
No third-party images or attribution dependencies.
"""
from pathlib import Path
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT=Path(__file__).resolve().parents[1]/'frontend'/'public'/'textures'
OUT.mkdir(parents=True,exist_ok=True)
S=512
styles=[
 ('glass_blue',  (32,64,88), (60,136,167), (16,45,67), 11, 6),
 ('glass_silver',(83,110,120),(119,169,192),(26,51,67), 11, 7),
 ('apartments', (183,165,143),(59,88,105),(41,53,57), 8, 5),
 ('brick',      (149,88,71),(65,86,95),(28,37,43), 6, 5),
 ('concrete',   (186,190,183),(72,101,119),(37,53,61), 8, 7),
 ('modern',     (77,94,103),(43,119,150),(17,42,64), 12, 7),
 ('commercial', (161,143,117),(77,103,119),(27,46,57), 5, 5),
 ('industrial', (108,127,133),(71,111,133),(33,54,64), 4, 9),
 ('hospital',   (211,216,207),(78,144,166),(38,72,89), 7, 7),
 ('finance',    (72,89,106),(68,125,151),(19,44,68), 13, 7),
]

def clamp(x): return int(max(0,min(255,x)))

def mix(a,b,t): return tuple(clamp(a[k]*(1-t)+b[k]*t) for k in range(3))

for name,wall,glass,shadow,rows,cols in styles:
    rng=random.Random('nabh'+name)
    W,H=512,768
    a=np.zeros((H,W,3),dtype=np.uint8)
    for y in range(H):
        shade=0.94+0.06*(y/H)
        for k in range(3): a[y,:,k]=clamp(wall[k]*shade)
    texture=Image.fromarray(a,mode='RGB')
    d=ImageDraw.Draw(texture)
    # Vertical façade ribs, floor slabs, architectural panel edges
    for i in range(cols+1):
        x=int(W*i/cols)
        d.rectangle((x-5,0,x+3,H),fill=mix(wall,(18,32,43),0.23))
        d.line((x+5,0,x+5,H),fill=mix(wall,(237,243,239),0.30),width=2)
    for j in range(rows+1):
        y=int(H*j/rows)
        d.rectangle((0,y-5,W,y+4),fill=mix(wall,(15,29,38),0.31))
        d.line((0,y+5,W,y+5),fill=mix(wall,(238,244,244),0.24),width=2)
    cellw=W/cols;cellh=H/rows
    for j in range(rows):
        for i in range(cols):
            x0=int(i*cellw+cellw*0.16);y0=int(j*cellh+cellh*0.15)
            x1=int((i+1)*cellw-cellw*0.14);y1=int((j+1)*cellh-cellh*0.16)
            if x1-x0<5:continue
            # Individual pane lighting/reflections; some dark, some warm occupied rooms.
            r=rng.random()
            pane=mix(glass,shadow,0.50 if r<0.30 else 0.14)
            if r>.91:pane=mix(pane,(236,191,118),0.55)
            if name.startswith('glass') or name in ['finance','modern']:
                pane=mix(pane,(104,170,193),0.22)
            d.rectangle((x0-3,y0-3,x1+3,y1+3),fill=mix(wall,shadow,0.54))
            d.rectangle((x0,y0,x1,y1),fill=pane)
            d.polygon([(x0,y0),(x1,y0),(x0+int((x1-x0)*.20),y1)],fill=mix(pane,(220,240,246),0.14))
            d.line((x0+3,y0+3,x1-3,y0+3),fill=mix(pane,(232,244,246),0.24),width=2)
            d.line((x0+int((x1-x0)*0.57),y0,x0+int((x1-x0)*0.57),y1),fill=mix(pane,shadow,0.40),width=3)
            if name in ('apartments','brick','commercial'):
                d.rectangle((x0-6,y1+1,x1+6,y1+6),fill=mix(wall,(225,218,199),0.30))
                if rng.random()>.65:
                    d.rectangle((x0+4,y0+7,x1-5,y0+int((y1-y0)*.48)), fill=mix(pane,(237,209,170),0.25))
    # Vary slight grain to suggest concrete, glass film and age.
    arr=np.asarray(texture,dtype=np.int16).copy()
    grain=np.random.default_rng(sum((i+1)*ord(ch) for i,ch in enumerate(name))).normal(0,2.8,(H,W,1))
    arr=np.clip(arr+grain,0,255).astype(np.uint8)
    Image.fromarray(arr,mode='RGB').save(OUT/f'facade_{name}.jpg', quality=91,subsampling=0)

rng=np.random.default_rng(2026)
for name,base,grain in [
    ('asphalt',(55,62,68),10),('pavement',(169,167,159),11),('grass',(67,111,76),14),('roof',(132,143,149),9)
]:
    a=np.zeros((512,512,3),dtype=np.uint8)
    noise=rng.normal(0,grain,(512,512,1))
    for k in range(3):a[:,:,k]=np.clip(base[k]+noise[:,:,0],0,255)
    im=Image.fromarray(a,mode='RGB')
    d=ImageDraw.Draw(im)
    if name=='pavement':
        for j in range(0,512,64):d.line((0,j,512,j),fill=(120,119,114),width=2)
        for j in range(0,512,128):
            off=0 if j%256==0 else 64
            for i in range(off,512,128):d.line((i,j,i,j+64),fill=(121,120,115),width=2)
    elif name=='roof':
        for j in range(0,512,82):d.line((0,j,512,j),fill=(101,116,125),width=3)
        for i in range(0,512,88):d.line((i,0,i,512),fill=(98,112,119),width=2)
    elif name=='grass':
        for _ in range(3500):
            x=int(rng.integers(0,512));y=int(rng.integers(0,512));c=(int(rng.integers(45,90)),int(rng.integers(93,140)),int(rng.integers(46,81)))
            d.line((x,y,x+2,y-4),fill=c,width=1)
    im.save(OUT/f'ground_{name}.jpg',quality=88)
print(f'Generated {len(styles)+4} original city textures into {OUT}')
