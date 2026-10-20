from pathlib import Path
import base64,json
root=Path(__file__).parent
out=root/'package';out.mkdir(exist_ok=True)
def data(p,t):return 'data:'+t+';base64,'+base64.b64encode(p.read_bytes()).decode()
assets={'image':data(root/'assets/comicrox-still.png','image/png'),'video':data(root/'assets/comicrox-ring.webm','video/webm')}
config={'width':960,'height':160,'animated':False,'seconds':7,'messages':[{'text':'CGCs • NEW RELEASES • BACK ISSUES','label':'ON THE TABLE'},{'text':'SETS & RUNS','label':'FIND YOUR NEXT READ'},{'text':'REQUESTS WELCOME','label':'ASK IN THE CHAT'},{'text':"LET’S HAVE SOME FUN!",'label':'COMIC ROX LIVE'},{'text':'WWW.COMICROX.CO.UK','label':'MORE COMICS ONLINE'}]}
template=(root/'banner-template.html').read_text()
def serialize(v):return json.dumps(v,ensure_ascii=False).replace('<','\\u003c')
def make(c):return template.replace('__CONFIG__',serialize({**c,**assets}))
(out/'banner.html').write_text(make(config))
(out/'banner-wide.html').write_text(make({**config,'width':1600,'height':180}))
(out/'banner-blue-ring.html').write_text(make({**config,'animated':True}))
editor=(root/'editor-template.html').read_text().replace('__TEMPLATE__',serialize(template)).replace('__DEFAULTS__',serialize({**config,**assets}))
(out/'Edit messages.html').write_text(editor)
print('Built self-contained banner pages and editor.')
