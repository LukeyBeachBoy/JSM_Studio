import re,json,gzip,base64,pathlib,xml.etree.ElementTree as E
import sys
source=pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r'C:/Users/luker/Downloads/PC Controller Views.html')
m=json.loads(re.search(r'<script type="__bundler/manifest">(.*?)</script>',source.read_text(encoding='utf-8'),re.S).group(1))
keys=['steam','xbox-series','xbox-elite-2','dualsense','dualshock-4','switch-pro','8bitdo-ultimate-2','8bitdo-pro-2','dualsense-edge']
out=pathlib.Path('JSM_GUI/jsm_gui_tauri/src/assets/controllers');out.mkdir(exist_ok=True)
# Physical coordinates in the supplied common 1117 x 750 art space.
coords={1:((300.5,211,60),(690,365,60),(427,379),[(816,151),(749,218),(883,218),(816,284)],[(485,215),(632,215),(558.5,114),(558.5,271)]),2:((299,219,56),(691.5,374,56),(422.5,385.5),[(820.5,152),(748.5,220.5),(889.5,222.5),(820,291)],[(484.5,219.5),(632.5,219.5),(558.5,116.5)]),3:((399,371,56.5),(718,371,56.5),(248,235.5),[(869.5,161.5),(796.8,235.3),(942.8,235.3),(869.5,308.4)],[(325.5,126),(791.5,126),(558.5,375),(558.5,424.5)]),4:((398.5,387,59),(718.5,387,59),(245.5,249),[(871.5,175),(797.5,249),(945.5,249),(871.5,323)],[(353.5,150),(763.5,150),(558.5,391)]),5:((283,236,57),(690,375,57),(427,378),[(823,169),(744.5,237),(901.5,237),(823,305)],[(435,161),(682,161),(630,237),(487,237)]),6:((270.4,220.7,59.5),(695.8,380,59.5),(423,380),[(846.3,148.5),(775.2,220),(916.7,220),(846.3,291.9)],[(427.8,135.6),(689.2,135.6),(558.5,135.6),(490.7,209.6)]),7:((415.5,359,57),(701.5,359,57),(283.5,214.5),[(833.6,145.8),(755.1,214),(911.9,214),(833.6,282.2)],[(512.2,210),(604.8,210),(833.4,377.5),(283.6,377.4)]),8:((413,297.5,54),(704,297.5,54),(274,176),[(843,108),(776,174.5),(910,174.5),(843,241)],[(345.5,81),(771.5,81),(558.5,303),(558.5,352)])}
models={}
def shape(e,command):
 return dict(command=command,tag=e.tag,attrs={k:v for k,v in e.attrib.items() if k not in ['class','mask']})
def circle(command,x,y,r=26):return dict(command=command,tag='circle',attrs=dict(cx=str(x),cy=str(y),r=str(r)))
for i,e in enumerate(m.values()):
 b=base64.b64decode(e['data']);b=gzip.decompress(b) if e.get('compressed') else b
 t=json.loads(re.search(r'<script type="__bundler/template">(.*?)</script>',b.decode(),re.S).group(1))
 svgs=re.findall(r'<svg\b.*?</svg>',t,re.S)
 css=t[t.rfind('.b{'):];css=css[:css.index('</style>')]
 views=[]
 for j,s in enumerate(svgs):
  s=s.replace('sc-camel-view-box','viewBox')
  # Inline only the supplied SVG presentation rules; no document scripts/styles.
  rules=dict(re.findall(r'\.([\w]+)\{([^}]+)\}',css)) if i else {}
  s=re.sub(r'class="([^"]+)"',lambda a:'style="'+rules.get(a[1],'')+'"',s)
  (out/f'{keys[i]}-{["front","back"][j]}.svg').write_text(s,encoding='utf-8')
  views.append(s[s.index('>')+1:s.rindex('</svg>')])
 if i==0:continue # Existing Steam renderer already has its calibrated regions.
 a,bb,dp,face,center=coords[i]; controls=[circle(c,*p,30) for c,p in zip(['N','W','E','S'],face)]
 controls += [circle(c,*p,22) for c,p in zip(['-','+','HOME','CAPTURE' if i!=3 and i!=8 else 'MIC'],center)]
 x,y=dp
 controls += [dict(command=c,tag='rect',attrs=dict(x=str(xx-23),y=str(yy-23),width='46',height='46',rx='8')) for c,xx,yy in [('UP',x,y-48),('RIGHT',x+48,y),('DOWN',x,y+48),('LEFT',x-48,y)]]
 if i in [3,4,8]:
  front=E.fromstring(svgs[0]); touch=next(el for el in front.iter('path') if el.get('class')=='c')
  controls.append(shape(touch,'CAPTURE'))
 if i==6:controls[7]['command']='CAPTURE'
 if i==6:controls.append(circle('LMINI',338,57,18));controls.append(circle('RMINI',779,57,18))
 if i==8:
  controls += [shape(el,c) for el,c in zip([el for el in E.fromstring(svgs[0]).iter('path') if el.get('class')=='c'][-2:],['LSR','RSL'])]
 back=E.fromstring(svgs[1]);cl=[el for el in back.iter() if el.get('class')=='cl']; backs=[]
 # Back artwork is already mirrored, so left-hand regions stay on the left.
 orders={1:['ZL','ZR'],2:['ZL','ZR','LSL','RSR','LSR','RSL'],3:['ZL','ZR','L','R'],4:['ZL','ZR'],5:['L','R','ZL','ZR'],6:['ZL','ZR','L','R','LSL','RSR'],7:['ZL','ZR','LSL','RSR'],8:['ZL','ZR','LSL','RSR']}
 backs=[shape(el,c) for el,c in zip(cl,orders[i])]
 # DS4 and Xbox bumpers are thin outlines in this view; give them explicit hit regions.
 if i in [1,2,4,7,8]:
  bumpers={1:(300,817,147),2:(350,767,60),4:(300,817,183),7:(280,837,70),8:(270,847,122)}[i]
  lx,rx,yy=bumpers
  backs += [dict(command=c,tag='rect',attrs=dict(x=str(xx-48),y=str(yy-9),width='96',height='18',rx='8')) for c,xx in [('L',lx),('R',rx)]]
 models[keys[i]]=dict(name=re.search(r'<title>(.*?)</title>',t)[1],front=views[0],back=views[1],controls=controls,backControls=backs,sticks=[a,bb])
pathlib.Path('JSM_GUI/jsm_gui_tauri/src/components/controllerModels.json').write_text(json.dumps(models,ensure_ascii=False,indent=2),encoding='utf-8')
print('Imported',len(keys)*2,'SVG assets and',len(models),'live layouts')
