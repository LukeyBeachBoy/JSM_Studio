import json, pathlib, subprocess, math
import numpy as np
from PIL import Image, ImageDraw

root=pathlib.Path(__file__).resolve().parents[1]
out=root/'captures/keyboard-comparison-2026-10-04'
samples=[]
for line in (out/'controller-telemetry.jsonl').open(encoding='utf-8'):
    r=json.loads(line); p=r['packet']
    for d in p.get('devices',[]):
        s=d.get('status',{}); samples.append([p['ts']/1000]+[v for side in ['left','right'] for v in [s[side+'Pad']['touched'],s[side+'Pad']['x'],s[side+'Pad']['y']]])
tele=np.asarray(samples,dtype=float); tele[:,0]-=tele[0,0]

# Detect the small saturated touch circles, distinguishing them from the
# straight outlines of highlighted keys by a circular perimeter template.
w,h=710,220; ox,oy=637,797; fps=10
cmd=['ffmpeg','-hide_banner','-loglevel','error','-i','C:/Users/luker/Downloads/jsm.mp4',
     '-vf',f'fps={fps},crop={w}:{h}:{ox}:{oy}','-f','rawvideo','-pix_fmt','rgb24','-']
proc=subprocess.Popen(cmd,stdout=subprocess.PIPE)
offsets=sorted(set((round(6*math.cos(a)),round(6*math.sin(a))) for a in np.linspace(0,2*math.pi,48,endpoint=False)))
detected=[]; index=0
while True:
    data=proc.stdout.read(w*h*3)
    if len(data)!=w*h*3: break
    rgb=np.frombuffer(data,dtype=np.uint8).reshape(h,w,3).astype(np.int16)
    for side in range(2):
        r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
        mask=(b-r>55)&(g-r>25)&(b>110) if side==0 else (r-b>70)&(g-b>35)&(r>130)
        score=np.zeros((h-16,w-16),dtype=np.uint8)
        for dx,dy in offsets: score+=mask[8+dy:h-8+dy,8+dx:w-8+dx]
        yy,xx=np.unravel_index(score.argmax(),score.shape)
        confidence=int(score[yy,xx]); x=xx+8+ox; y=yy+8+oy
        if confidence>=23: detected.append([index/fps,side,x,y,confidence])
    index+=1
proc.wait()
video=np.asarray(detected,dtype=float)
np.savetxt(out/'video-cursor-points.csv',video,delimiter=',',header='videoSeconds,side,xPixels,yPixels,ringScore',comments='')

# Match absolute video positions against both telemetry trajectories. Fit the
# small grid origin/size differences instead of assuming exact CSS dimensions.
best=None
for shift in np.arange(35,90,0.0333333):
    ti=np.searchsorted(tele[:,0],video[:,0]+shift).clip(0,len(tele)-1)
    side=video[:,1].astype(int); touched=tele[ti,1+side*3]>0
    if touched.sum()<len(video)*0.85: continue
    x=tele[ti,2+side*3]; y=tele[ti,3+side*3]
    pred=[]; coeff=[]
    for axis,values in [(2,x),(3,y)]:
        a=np.column_stack([values[touched],np.ones(touched.sum())])
        c=np.linalg.lstsq(a,video[touched,axis],rcond=None)[0]
        coeff.append(c.tolist()); pred.append(a@c)
    error=np.sqrt(np.mean((pred[0]-video[touched,2])**2+(pred[1]-video[touched,3])**2))
    if best is None or error<best['pixelRmse']:
        best={'telemetryOffsetSeconds':float(shift),'pixelRmse':float(error),'matchedFrames':int(touched.sum()),'detectedPoints':len(video),'pixelMappingXY':coeff}
(out/'video-alignment.json').write_text(json.dumps(best,indent=2))
print(json.dumps(best))

im=Image.new('RGB',(1200,650),'#15191f'); draw=ImageDraw.Draw(im)
draw.text((30,15),'JSM comparison: raw pad trajectories (0 degree rotation)',fill='white')
for side,name in [(0,'Left pad'),(1,'Right pad')]:
    x0=40+side*590; y0=80; size=510
    draw.rectangle((x0,y0,x0+size,y0+size),outline='#667080')
    draw.text((x0,y0-25),name,fill='white')
    for coord in [-0.5,0,0.5]:
        pos=(coord+1)*size/2
        draw.line((x0+pos,y0,x0+pos,y0+size),fill='#29323e')
        draw.line((x0,y0+pos,x0+size,y0+pos),fill='#29323e')
    start=best['telemetryOffsetSeconds'] if best else 66
    end=start+43.433
    previous=None
    for t,contact,x,y in tele[:,[0,1+3*side,2+3*side,3+3*side]]:
        if not(start<=t<=end) or not contact: previous=None; continue
        point=(x0+(x+1)*size/2,y0+(y+1)*size/2)
        fraction=min(1,max(0,(t-start)/43.433))
        colour=(int(55+200*fraction),int(190-70*fraction),int(250-175*fraction))
        if previous: draw.line((*previous,*point),fill=colour,width=2)
        previous=point
draw.text((40,615),'Blue: start of video; orange: end. Axes are pad coordinates (-1 to +1), Y down.',fill='white')
im.save(out/'raw-pad-trajectories.png')

