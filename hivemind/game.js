(function(){
var $=function(id){return document.getElementById(id)};
var cv=$("c"),ctx=cv.getContext("2d",{alpha:false}),ME=1,small=innerWidth<500,MW=small?320:400,MH=small?208:260,W=MW,H=MH;
var S,off,octx,img,px,cols,names,cam={x:W/2,y:H/2,z:4},fitZ=4,pct=40,cw=0,ch=0,dpr=1,cent=[],parts=[],pi=0,acc=0,last=0,running=true,ended=false,centered=false,hudT=0,loopOn=false,pre=null;
// centroid pool (reused every 10 ticks) and per-player label cache (font strings, agent text, name width)
var CP=[],CN=new Int32Array(17),CX=new Float64Array(17),CY=new Float64Array(17),LC=[],ATK={v:-1,s:""};
for(var i=0;i<17;i++){CP.push({x:0,y:0,c:0,r:0});LC.push({fs:-1,f1:"",f2:"",nm:null,w:0,a:-1,s:""})}
for(var i=0;i<300;i++)parts.push({x:0,y:0,tx:0,ty:0,l:0,c:""});
function rgb(h){return[parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)]}
function fmt(n){n=Math.floor(n);return n>=1e6?(n/1e6).toFixed(1)+"M":n>=1e4?(n/1e3).toFixed(1)+"k":""+n}
var LOW=(navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4;
function resize(){var oz=fitZ;dpr=Math.min(innerWidth<500||LOW?1.5:2,devicePixelRatio||1);if(window.FX)FX.dpr=dpr;cw=innerWidth;ch=innerHeight;cv.width=cw*dpr|0;cv.height=ch*dpr|0;fitZ=Math.min(cw/W,ch/H)*.95;
// mid-match: keep the same zoom relative to the fit, then clamp so the map stays on screen
if(S&&oz>0){cam.z*=fitZ/oz;clampCam()}
if(!S){ctx.fillStyle="#07090f";ctx.fillRect(0,0,cv.width,cv.height)}}
addEventListener("resize",resize);addEventListener("orientationchange",function(){setTimeout(resize,250)});if(window.visualViewport)visualViewport.addEventListener("resize",resize);resize();
function df(x,y,o){return x>=0&&y>=0&&x<W&&y<H&&S.own[y*W+x]!==o}
function ao(x,y,A){return x>=0&&y>=0&&x<W&&y<H&&A.has(S.own[y*W+x])}
// alliances changed: repaint the whole map once (at most once per tick, from post())
var rp=false;function repaint(){for(var i=0;i<W*H;i++)paint(i);octx.putImageData(img,0,0);mctx.putImageData(mimg,0,0)}
// colour LUT: whole RGBA pixels as uint32 (rounded exactly like the old Uint8ClampedArray writes), written through Uint32 views; MC counts lit mask pixels
var QC=new Uint8ClampedArray(4),QU=new Uint32Array(QC.buffer);
function pk(r,g,b,a){QC[0]=r;QC[1]=g;QC[2]=b;QC[3]=a;return QU[0]}
var V0=pk(14,22,40,255),V1=pk(10,15,28,255),NEU=pk(24,30,44,255),GOLD=pk(255,216,77,255),M1=pk(255,255,255,255),M0=pk(255,255,255,0),LB=new Uint32Array(17),LG=new Uint32Array(17),LI=new Uint32Array(17),px32,mp32,MC=0;
function mkLut(){for(var o=1;o<17;o++){var b=cols[o];if(!b)continue;LB[o]=pk(b[0]*.82+46,b[1]*.82+46,b[2]*.82+46,255);LG[o]=pk(b[0]*.84+7*(1-.84),b[1]*.84+9*(1-.84),b[2]*.84+15*(1-.84),255);LI[o]=pk(b[0]*.7+7*(1-.7),b[1]*.7+9*(1-.7),b[2]*.7+15*(1-.7),255)}}
function paint(i){var o=S.own[i],x=i%W,y=(i/W)|0,c,m=M0;
if(o===255)c=((x+y)&3)===0?V0:V1;
else if(o===0)c=NEU;
else{var bd=df(x,y-1,o)||df(x,y+1,o)||df(x-1,y,o)||df(x+1,y,o);
c=bd?LB[o]:(df(x-1,y-1,o)||df(x+1,y-1,o)||df(x-1,y+1,o)||df(x+1,y+1,o)||df(x,y-2,o)||df(x,y+2,o)||df(x-2,y,o)||df(x+2,y,o))?LG[o]:LI[o];if(bd&&o===ME)m=M1;
// allies' shared border: gold, and pulsing with the glow mask
var A=bd&&S.sd<2&&S.P[o]&&S.P[o].allies;if(A&&A.size&&(ao(x,y-1,A)||ao(x,y+1,A)||ao(x-1,y,A)||ao(x+1,y,A))){c=GOLD;m=M1}}
px32[i]=c;var om=mp32[i];if(om!==m){if(m===M1)MC++;else if(om===M1)MC--;mp32[i]=m}}
function paintList(ch){if(!ch.length)return;var x0=W,y0=H,x1=-1,y1=-1,dx,dy;
for(var n=0;n<ch.length;n++){var i=ch[n],x=i%W,y=(i/W)|0;
for(dy=-2;dy<=2;dy++)for(dx=-2;dx<=2;dx++){var X=x+dx,Y=y+dy;if((dx<0?-dx:dx)+(dy<0?-dy:dy)<=2&&X>=0&&Y>=0&&X<W&&Y<H)paint(Y*W+X)}
if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
x0=Math.max(0,x0-2);y0=Math.max(0,y0-2);x1=Math.min(W-1,x1+2);y1=Math.min(H-1,y1+2);
octx.putImageData(img,0,0,x0,y0,x1-x0+1,y1-y0+1);mctx.putImageData(mimg,0,0,x0,y0,x1-x0+1,y1-y0+1)}
function fxCh(ch){if(ended)return;for(var n=0;n<ch.length;n++)if(S.own[ch[n]]===ME)FX.cap(ch[n])}
var mode="solo",human={},hexs=[],moff,mctx,mimg,mp,hx=0,hy=0,hv=false,aim=false,lpt="mouse",multi=false,ocv=null,oci=null;
// OVERCHARGE overlay: a cyan mask of my cells, rebuilt from S.own every 5 ticks only while overcharged
function ocMask(){if(!ocv||ocv.width!==W||ocv.height!==H){ocv=document.createElement("canvas");ocv.width=W;ocv.height=H;oci=ocv.getContext("2d").createImageData(W,H)}
var d=oci.data;for(var i=0,k=0;i<W*H;i++,k+=4){d[k]=60;d[k+1]=240;d[k+2]=255;d[k+3]=S.own[i]===ME?255:0}ocv.getContext("2d").putImageData(oci,0,0)}
function act(it){if(!S)return;if(S.sd>1&&(it.type==="ally"||it.type==="donate")){toast("nah it's every bot for themselves now 💀");return}if(mode==="client")Net.send({k:"i",it:it});else return S.apply(ME,it)}
function start(seed,o){o=o||{};mode=o.mode||"solo";ME=o.me||1;W=o.w||MW;H=o.h||MH;resize();
$("hud").style.display="";var B=pre&&pre.seed===seed&&pre.w===W&&pre.h===H?pre:build(seed,W,H);pre=null;S=B.S;Bots.init(S);names=[null];hexs=[null];human={};human[ME]=1;
for(var k=2;k<=16;k++){names[k]=Bots.NAMES[k-2];hexs[k]=Bots.COLORS[k-2]}names[1]=o.name||"YOU";hexs[1]=o.color||"#3cf0ff";
(o.slots||[]).forEach(function(s){names[s[0]]=s[1];hexs[s[0]]=s[2];human[s[0]]=1});
var BL=Bots.list();for(k=BL.length-1;k>=0;k--)if(human[BL[k].id])BL.splice(k,1);
var ba=S.acceptAlly,OF=Object.create(null);S.acceptAlly=function(t,f){if(!human[t])return ba(t,f);if(!human[f])return false;
// human↔human: first request is a 10 s offer ("o"), the other side's request accepts it; "" = silently ignored
var n=Date.now(),k,c=0;for(k in OF)if(OF[k]<n)delete OF[k];if(OF[t+">"+f]){delete OF[t+">"+f];return true}
if(OF[f+">"+t])return "";for(k in OF)if(k.split(">")[0]===""+f)c++;if(c>=3)return "";OF[f+">"+t]=n+10000;return "o"};
cols=hexs.map(function(h){return h?rgb(h):null});mkLut();
off=B.off;octx=B.octx;img=B.img;px=img.data;moff=B.moff;mctx=B.mctx;mimg=B.mimg;mp=mimg.data;px32=new Uint32Array(px.buffer);mp32=new Uint32Array(mp.buffer);MC=0;for(var q=0;q<mp32.length;q++)if(mp32[q]===M1)MC++;S.diff();FX.set(S,ME);FX.cent=cent;aim=false;
cam.x=W/2;cam.y=H/2;cam.z=fitZ;ended=false;centered=false;sdSeen=false;for(var i=0;i<17;i++){cent[i]=null;LC[i].fs=-1;LC[i].a=-1}$("end").style.display="none";resetHud();
for(i=0;i<parts.length;i++)parts[i].l=0;for(i in HC)delete HC[i];hud();kick()}
// map generation and the first frame, done ahead of time when the menu is idle; before anyone spawns, paint() reads only void and neutral cells
function build(seed,w,h){var s=Sim.create(seed,w,h,16),o=document.createElement("canvas");o.width=w;o.height=h;var oc=o.getContext("2d"),im=oc.createImageData(w,h);
var m=document.createElement("canvas");m.width=w;m.height=h;var mc=m.getContext("2d"),mi=mc.createImageData(w,h);
var sv=[S,px32,mp32,W,H,MC];S=s;px32=new Uint32Array(im.data.buffer);mp32=new Uint32Array(mi.data.buffer);W=w;H=h;for(var i=0;i<w*h;i++)paint(i);S=sv[0];px32=sv[1];mp32=sv[2];W=sv[3];H=sv[4];MC=sv[5];
oc.putImageData(im,0,0);mc.putImageData(mi,0,0);return{seed:seed,w:w,h:h,S:s,off:o,octx:oc,img:im,moff:m,mctx:mc,mimg:mi}}
function kick(){if(loopOn)return;loopOn=true;requestAnimationFrame(function(t){last=t;frame(t)})}
// runs every 10 ticks (never per frame) into pooled objects; r caches the label-size root
function cents(){var o,i;CN.fill(0);CX.fill(0);CY.fill(0);for(i=0;i<W*H;i++){o=S.own[i];if(!o||o===255)continue;CN[o]++;CX[o]+=i%W;CY[o]+=(i/W)|0}
for(o=0;o<17;o++){var n=CN[o];if(!n){cent[o]=null;continue}var c=CP[o];c.x=CX[o]/n+.5;c.y=CY[o]/n+.5;c.c=n;c.r=Math.sqrt(n);cent[o]=c}}
function spawnParts(){for(var k=0;k<S.attacks.length;k++){var a=S.attacks[k],c=cent[a.by];if(!c)continue;
var dx=a.fx-c.x,dy=a.fy-c.y,d=Math.hypot(dx,dy)||1,r=Math.min(d,14);
for(var m=0;m<3;m++){var p=parts[pi];pi=(pi+1)%parts.length;var j=(S.rand()-.5)*6;
p.x=a.fx+.5-dx/d*r-dy/d*j;p.y=a.fy+.5-dy/d*r+dx/d*j;p.tx=a.fx+.5+(S.rand()-.5)*3;p.ty=a.fy+.5+(S.rand()-.5)*3;p.l=1;p.c=hexs[a.by]||"#3cf0ff"}}}
// every timer the HUD owns, so a rematch or quit can clear them all
var TMO=new Set(),IVS=new Set();function later(fn,ms){var id=setTimeout(function(){TMO.delete(id);fn()},ms);TMO.add(id);return id}
function every(fn,ms){var id=setInterval(fn,ms);IVS.add(id);return id}function stopEvery(id){clearInterval(id);IVS.delete(id)}
function clearTimers(){TMO.forEach(clearTimeout);TMO.clear();IVS.forEach(clearInterval);IVS.clear()}
function toast(t,ms){var f=$("feed"),d=document.createElement("div");d.className="gl";d.setAttribute("role","status");d.textContent=t;if(ms)d.style.animationDuration=ms/1000+"s";f.appendChild(d);while(f.children.length>5)f.removeChild(f.firstChild);later(function(){if(d.parentNode)d.parentNode.removeChild(d)},ms||4000);return d}
// a swarm speaking: its name in its colour, a line, and an optional hint
function say(id,t,h,ms){var d=toast("",ms),n=document.createElement("b");n.textContent=names[id]+": ";n.style.color=hexs[id];d.appendChild(n);d.appendChild(document.createTextNode(t));
if(h){var s=document.createElement("small");s.textContent=" · 💡 "+h;d.appendChild(s)}return d}
function offerToast(a){var d=say(a,human[a]?"wants to ally 🤝":Diplo.line(a,S.tick),"",10000),tm=document.createElement("small"),n=10;tm.textContent=" 10s";d.appendChild(tm);
var iv=every(function(){n--;tm.textContent=" "+Math.max(0,n)+"s";if(n<=0||!d.parentNode)stopEvery(iv)},1000);
[["ACCEPT",1],["NAH",0]].forEach(function(o){var b=document.createElement("button");b.type="button";b.textContent=o[0];
b.addEventListener("click",function(ev){ev.stopPropagation();stopEvery(iv);if(S&&!ended){if(o[1])act({type:"ally",target:a});else if(mode!=="client"&&!human[a])Diplo.nah(a,ME)}if(d.parentNode)d.parentNode.removeChild(d)});d.appendChild(b)})}
function handle(e){FX.ev(e,cent[e.b],hexs[e.b]);
if(e.k==="kill"){rp=true;toast(e.a?names[e.a]+" deleted "+names[e.b]+" 💀":names[e.b]+" crashed 💀")}
else if(e.k==="ally"){if(e.ok)rp=true;
if(e.a===ME){if(e.ok)human[e.b]?toast(names[e.b]+" accepted 🤝"):say(e.b,Diplo.YES);else{var L=Diplo.reply(e.r);say(e.b,L[0],L[1],6000)}}
else if(e.b===ME){if(e.ok)toast(names[e.a]+" allied you 🤝")}else if(e.ok)toast(names[e.a]+" 🤝 "+names[e.b])}
else if(e.k==="offer"){if(e.b===ME)offerToast(e.a);else if(e.a===ME)toast("ally offer sent to "+names[e.b]+" ⏳")}
else if(e.k==="snake"){rp=true;toast("🐍 "+names[e.a]+" backstabbed "+names[e.b])}
else if(e.k==="unally"){rp=true;if(e.a===ME||e.b===ME)toast(names[e.a]+" ended the alliance with "+names[e.b])}
else if(e.k==="donate"&&(e.a===ME||e.b===ME))toast(e.a===ME?"sent 20% to "+names[e.b]+" 🎁":names[e.a]+" sent you agents 🎁");
else if(e.k==="ab"&&e.a!==ME&&S.rand()<.25)toast(names[e.a]+(e.ab==="vx"?" launched a virus 🦠":" overcharged ⚡"))}
function step(){Bots.tick(S);S.step();var chg=S.diff();paintList(chg);fxCh(chg);var ev=S.events;S.events=[];ev.forEach(handle);if(mode==="host")Net.hostTick(chg,ev);post()}
function applyP(p){for(var i=0;i<16;i++){var q=S.P[i+1],v=p[i];q.agents=v[0];q.cells=v[1];if(q.alive&&!v[2]&&!q.diedAt)q.diedAt=S.tick;q.alive=!!v[2];q.vxCd=v[3];q.fwCd=v[4];if(v[0]>q.peak)q.peak=v[0]}}
function netTick(m){if(mode!=="client"||!S)return;var d=m.d,ch=[],i;for(i=0;i<d.length;i+=2){S.put(d[i],d[i+1]);ch.push(d[i])}paintList(ch);fxCh(ch);S.tick=m.tick;S.sd=m.sd;S.sdT=m.sdt;applyP(m.p);
S.attacks=m.a.map(function(a){return{by:a[0],t:0,n:a[2],fx:a[1]%W,fy:(a[1]/W)|0}});
S.missiles=(m.m||[]).map(function(q){return{by:q[0],x:q[1],y:q[2],landTick:q[3]}});
m.e.forEach(function(e){var A=S.P[e.a],B=S.P[e.b];
if(e.k==="kill"){if(A)A.kills++;if(B){B.alive=false;B.diedAt=S.tick;B.allies.forEach(function(o){S.P[o].allies.delete(e.b)});B.allies.clear()}}
else if(e.k==="ally"){if(e.ok&&A&&B){A.allies.add(e.b);B.allies.add(e.a)}}
else if(e.k==="unally"||e.k==="snake"){if(A&&B){A.allies.delete(e.b);B.allies.delete(e.a)}}
else if(e.k==="ab"){if(A&&e.ab==="fw")A.fwUntil=S.tick+S.FWT}
else if(e.k==="win")S.winner=e.a;handle(e)});
var me=S.P[ME];if(!me.spawned&&me.cells>0){me.spawned=true;cents();var c=cent[ME];if(c){me.sx=c.x;me.sy=c.y}}post()}
function netSnap(m){if(mode!=="client"||!S)return;var o=m.own,k=0,i,n;for(i=0;i<o.length;i+=2)for(n=0;n<o[i+1];n++)S.own[k++]=o[i];S.rebuild();
for(i=0;i<W*H;i++)paint(i);octx.putImageData(img,0,0);mctx.putImageData(mimg,0,0);S.tick=m.tick;S.winner=m.winner;S.sd=m.sd;S.sdT=m.sdt;applyP(m.p);cents()}
window.HM={startSolo:function(seed,name,color){if(window.Net)Net.leave();start(seed,{name:name,color:color})},
startOnline:function(o){start(o.seed,o)},
prebuild:function(seed){if(!pre||pre.seed!==seed||pre.w!==MW)pre=build(seed,MW,MH)},applyTick:netTick,applySnap:netSnap,S:function(){return S},
dims:function(){return{w:MW,h:MH}},
applyFor:function(id,it){try{if(!S||mode!=="host"||ended||!(id>1&&id<=16)||!human[id]||id===ME||!it)return;var p=S.P[id];if(!p||!p.alive)return;
if(S.sd>1&&(it.type==="ally"||it.type==="donate"))return;if(("x" in it||"y" in it)&&!(it.x>=0&&it.y>=0&&it.x<S.W&&it.y<S.H))return;return S.apply(id,it)}catch(e){console.warn("HIVEMIND applyFor",e)}},
botify:function(id){if(!S||!human[id]||id===ME)return;delete human[id];names[id]+=" 🤖";Bots.list().push({id:id,name:names[id],color:hexs[id],pers:"opportunist",at:S.tick+1,next:S.tick+1})},
stop:function(){mode="solo";aimOff();aim=false;hv=false;ended=true}};
// FINAL SHOWDOWN, from the synced state on host and clients alike: every alliance gone, gold borders repainted away
var sdSeen=false;function post(){if(S.sd>1&&!sdSeen){sdSeen=true;for(var a=1;a<S.P.length;a++)S.P[a].allies.clear();rp=true;hidePop();if(!ended)toast("🔥 FINAL SHOWDOWN · every alliance is dissolved, only one survives",6000)}
if(rp){rp=false;repaint()}if(S.tick%10===0||S.tick===S.SPAWN)cents();var MEp=S.P[ME];if(MEp.fwUntil>S.tick&&MEp.alive&&(S.tick%5===0||MEp.fwUntil-S.tick>=S.FWT-1))ocMask();if(S.tick%2===0)spawnParts();if(!ended)FX.step();
var me=S.P[ME];if(me.spawned&&!centered&&S.tick>=S.SPAWN)centerMe();
if(S.winner||(!me.alive&&S.tick>S.SPAWN))end()}
// spawn zoom: ~40 cells across the short side of the screen, so your spawn area fills it on a 400×260 map
function SZ(){return Math.min(48,Math.max(fitZ*2.2,Math.min(cw,ch)/40))}
function centerMe(){var me=S.P[ME];centered=true;cam.x=me.sx+.5;cam.y=me.sy+.5;cam.z=Math.max(cam.z,SZ());clampCam()}
function focusSpawn(){var me=S.P[ME];cam.x=me.sx+.5;cam.y=me.sy+.5;cam.z=Math.max(cam.z,SZ()*.6);clampCam()}
function s2g(sx,sy){return{x:(sx-cw/2)/cam.z+cam.x,y:(sy-ch/2)/cam.z+cam.y}}
function clampCam(){cam.z=Math.max(fitZ*.6,Math.min(48,cam.z));cam.x=Math.max(0,Math.min(W,cam.x));cam.y=Math.max(0,Math.min(H,cam.y))}
function zoomAt(sx,sy,f){var g=s2g(sx,sy);cam.z*=f;clampCam();cam.x=g.x-(sx-cw/2)/cam.z;cam.y=g.y-(sy-ch/2)/cam.z;clampCam()}
function draw(t){FX.frame(t);ctx.setTransform(dpr,0,0,dpr,FX.sx*dpr,FX.sy*dpr);ctx.fillStyle="#07090f";ctx.fillRect(-20,-20,cw+40,ch+40);FX.bg(ctx,cw,ch,t);ctx.imageSmoothingEnabled=false;
var z=cam.z,ox=cw/2-cam.x*z,oy=ch/2-cam.y*z;ctx.drawImage(off,ox,oy,W*z,H*z);
if(MC>0){ctx.globalAlpha=.2+.4*(.5+.5*Math.sin(t/220));ctx.drawImage(moff,ox,oy,W*z,H*z);ctx.globalAlpha=1}
var MO=S.P[ME];if(ocv&&MO.fwUntil>S.tick&&MO.alive){ctx.globalAlpha=.16+.16*(.5+.5*Math.sin(t/140))+(FX.RM?0:Math.random()*.06);ctx.drawImage(ocv,ox,oy,W*z,H*z);ctx.globalAlpha=1}
// same pixels as rgba(255,216,77,a) per rect: one solid colour, the pulse in globalAlpha, every datacenter in one path (they sit ~20 cells apart, so nothing overlaps; off-screen ones are skipped)
var s=.5+.5*Math.sin(t/300),q=z*(.55+.35*s),r=z*(.8+s*.8),k,i,x,y,D=S.dcs;ctx.fillStyle="#ffd84d";ctx.globalAlpha=.55+.45*s;ctx.beginPath();
for(k=0;k<D.length;k++){i=D[k];x=ox+(i%W+.5)*z;y=oy+(((i/W)|0)+.5)*z;if(x<-z||y<-z||x>cw+z||y>ch+z)continue;ctx.rect(x-q/2,y-q/2,q,q)}ctx.fill();
if(z>6){ctx.strokeStyle="#ffd84d";ctx.lineWidth=1;ctx.globalAlpha=.5-.4*s;ctx.beginPath();
for(k=0;k<D.length;k++){i=D[k];x=ox+(i%W+.5)*z;y=oy+(((i/W)|0)+.5)*z;if(x<-r||y<-r||x>cw+r||y>ch+r)continue;ctx.rect(x-r/2,y-r/2,r,r)}ctx.stroke()}ctx.globalAlpha=1;
// particles: still updated everywhere, drawn only on screen, one path per run of same colour and alpha (an attack's burst shares both)
var ps=Math.max(1.5,z*.3),rc=null,ra=-1;for(k=0;k<parts.length;k++){var p=parts[k];if(p.l<=0)continue;p.x+=(p.tx-p.x)*.07;p.y+=(p.ty-p.y)*.07;p.l-=.02;
var al=Math.min(1,p.l*2),PX0=ox+p.x*z-ps/2,PY0=oy+p.y*z-ps/2;if(al<=0||PX0>cw+20||PY0>ch+20||PX0<-ps-20||PY0<-ps-20)continue;
if(p.c!==rc||al!==ra){if(rc!==null)ctx.fill();rc=p.c;ra=al;ctx.globalAlpha=al;ctx.fillStyle=rc;ctx.beginPath()}ctx.rect(PX0,PY0,ps,ps)}
if(rc!==null)ctx.fill();
ctx.globalAlpha=1;FX.draw(ctx,ox,oy,z,t);ctx.textAlign="center";ctx.textBaseline="middle";
// labels: font strings rebuilt only when the size changes, measureText only when the name or size changes, agent text only when the count changes
for(var o=1;o<17;o++){var c=cent[o],pl=S.P[o];if(!c||!pl||!pl.alive||c.c<30)continue;var fs=Math.min(26,c.r*z*.22);if(fs<9)continue;
var X=ox+c.x*z,Y=oy+c.y*z,L=LC[o];if(L.fs!==fs){L.fs=fs;L.f1="600 "+fs+"px Geist,system-ui,sans-serif";L.f2="400 "+(fs*.7)+"px 'Geist Mono',monospace";L.nm=null}
ctx.font=L.f1;if(L.nm!==names[o]){L.nm=names[o];L.w=ctx.measureText(L.nm).width}var hw=Math.max(L.w,fs*3)/2+1;
if(X+hw<0||X-hw>cw||Y+fs*1.6<0||Y-fs>ch)continue;var ag=Math.floor(pl.agents);if(L.a!==ag){L.a=ag;L.s=fmt(ag)}
ctx.fillStyle="rgba(0,0,0,.55)";ctx.fillText(L.nm,X+1,Y+1);ctx.fillStyle=o===ME?"#fff":"rgba(255,255,255,.92)";ctx.fillText(L.nm,X,Y);ctx.font=L.f2;ctx.fillText(L.s,X,Y+fs*.95)}
var MP=S.P[ME],mc=cent[ME];if(mc&&MP.alive&&!ended&&S.tick>=S.SPAWN&&z<fitZ*1.8){var AX=ox+mc.x*z,AY=oy+mc.y*z-34-4*Math.sin(t/250);ctx.fillStyle="rgba(0,0,0,.5)";ctx.fillRect(AX-18,AY-20,36,16);
ctx.fillStyle="#fff";ctx.beginPath();ctx.moveTo(AX,AY+10);ctx.lineTo(AX-7,AY);ctx.lineTo(AX+7,AY);ctx.fill();ctx.font="700 12px Geist,system-ui,sans-serif";ctx.fillText("YOU",AX,AY-12)}
if(aim&&hv&&MP.alive&&!ended){var vg=s2g(hx,hy),VX=Math.floor(vg.x),VY=Math.floor(vg.y),VR=S.VXR,nf=0,gr0=S.tick<S.graceEnd,hx0=hx,hy0=hy;hx=ox+(VX+.5)*z;hy=oy+(VY+.5)*z;
// blast preview: tint every cell this virus would flip (same rules as Sim's land())
ctx.fillStyle="#ff3b4d";ctx.globalAlpha=.42;ctx.beginPath();for(var vy=-VR;vy<=VR;vy++)for(var vx=-VR;vx<=VR;vx++){if(vx*vx+vy*vy>VR*VR)continue;var CX0=VX+vx,CY0=VY+vy;if(CX0<0||CY0<0||CX0>=W||CY0>=H)continue;
var vo=S.own[CY0*W+CX0];if(vo===255||vo===ME||(vo&&(MP.allies.has(vo)||gr0||!S.P[vo].alive)))continue;nf++;ctx.rect(ox+CX0*z,oy+CY0*z,z,z)}ctx.fill();
var AR=Math.max(18,z*(VR+.5)),rs=.5+.5*Math.sin(t/120);var AQ=Math.round(AR);ctx.globalAlpha=.75+.25*rs;FX.spr(ctx,"r"+AQ,AQ+1,10,"#ff3b4d",function(g){g.strokeStyle="#ff3b4d";g.lineWidth=2;g.beginPath();g.arc(0,0,AQ,0,6.2832);g.stroke()},hx,hy,0);
ctx.globalAlpha=1;ctx.font="600 13px 'Geist Mono',monospace";ctx.fillStyle="rgba(0,0,0,.6)";ctx.fillText("🦠 +"+nf,hx+1,hy-AR-11);ctx.fillStyle="#fff";ctx.fillText("🦠 +"+nf,hx,hy-AR-12);
ctx.globalAlpha=.75+.25*rs;FX.spr(ctx,"x"+AQ,AQ*1.25+2,10,"#ff3b4d",function(g){g.strokeStyle="#ff3b4d";g.lineWidth=2;g.beginPath();g.arc(0,0,AQ*.35,0,6.2832);for(var a4=0;a4<4;a4++){var ca=Math.cos(a4*1.5708),sa=Math.sin(a4*1.5708);g.moveTo(ca*AQ*.6,sa*AQ*.6);g.lineTo(ca*AQ*1.25,sa*AQ*1.25)}g.stroke()},hx,hy,t/900);ctx.globalAlpha=1;hx=hx0;hy=hy0}
if(!aim&&hv&&MP.alive&&!ended&&S.tick>=S.SPAWN){var gx=Math.floor((hx-cw/2)/cam.z+cam.x),gy=Math.floor((hy-ch/2)/cam.z+cam.y);if(gx>=0&&gy>=0&&gx<W&&gy<H){var gi=gy*W+gx,go=S.own[gi];
if(go!==255&&go!==ME&&!(go&&S.tick<S.graceEnd)&&S.adjacent(gi,ME)){var PX=ox+(gx+.5)*z,PY=oy+(gy+.5)*z,R=Math.max(14,z*1.2);ctx.strokeStyle=hexs[ME];ctx.lineWidth=2;ctx.globalAlpha=.6+.4*s;ctx.beginPath();ctx.arc(PX,PY,R,0,6.2832);ctx.stroke();ctx.globalAlpha=1;
ctx.font="600 12px 'Geist Mono',monospace";ctx.fillStyle="rgba(0,0,0,.6)";var av=Math.floor(MP.agents*pct/100);if(ATK.v!==av){ATK.v=av;ATK.s="⚔ "+fmt(av)}ctx.fillText(ATK.s,PX+1,PY-R-9);ctx.fillStyle="#fff";ctx.fillText(ATK.s,PX,PY-R-10)}}}
if(aim){ctx.fillStyle="#ff6b78";ctx.font="600 16px Geist,system-ui,sans-serif";ctx.fillText(lpt==="mouse"?"🦠 Click to launch · right-click or Esc cancels":"🦠 Drag to aim · lift to fire · ✕ cancels",cw/2,cw<=640?ch-270:ch-120)}
if(S.tick<S.SPAWN){ctx.fillStyle="rgba(255,216,77,.9)";ctx.font="600 16px Geist,system-ui,sans-serif";ctx.fillText(S.P[ME].spawned?"Tap again to move your spawn":"Tap land to place your swarm",cw/2,ch-90)}}
// the loop runs only while a match exists and the tab is visible; start() and visibilitychange restart it via kick()
function frame(t){if(!running||!S){loopOn=false;return}requestAnimationFrame(frame);var dt=t-last;last=t;if(dt>500)dt=100;
if(mode!=="client"&&(!ended||mode==="host"&&!S.winner)){acc+=dt;var n=0;while(acc>=100&&n<5){step();acc-=100;n++;if(ended)break}if(n>=5)acc=0}
// idle (match over, or no input for 8 s): draw at ~30 fps; the sim still steps on real time above
var idle=ended||performance.now()-lastIn>8000;if(!idle||t-lastDraw>=31){lastDraw=t;var d0=fpsOn?performance.now():0;draw(t);if(fpsOn)fpsTick(t,performance.now()-d0)}
if(t-hudT>120){hudT=t;hud()}}
var lastIn=0,lastDraw=0,fpsOn=false,fpsEl=null,fN=0,fT=0,fMs=0;function poke(){lastIn=performance.now()}
["pointerdown","pointermove","wheel","keydown","touchstart"].forEach(function(n){addEventListener(n,poke,{passive:true})});
// dev readout, F toggles (off by default): frames per second and mean draw() ms
function fpsTick(t,ms){fN++;fMs+=ms;if(t-fT<500)return;fpsEl.textContent=(fN*1000/(t-fT)).toFixed(0)+" fps · "+(fMs/fN).toFixed(2)+" ms draw";fN=0;fMs=0;fT=t}
addEventListener("keydown",function(e){if(e.key!=="f"&&e.key!=="F"||e.ctrlKey||e.metaKey||/INPUT|TEXTAREA/.test(e.target.tagName))return;fpsOn=!fpsOn;
if(!fpsEl){fpsEl=document.createElement("div");fpsEl.setAttribute("aria-hidden","true");fpsEl.style.cssText="position:fixed;right:8px;bottom:8px;z-index:99;padding:2px 8px;border-radius:8px;background:rgba(0,0,0,.6);color:#7dff5a;font:400 12px 'Geist Mono',monospace;pointer-events:none";document.body.appendChild(fpsEl)}
fpsEl.style.display=fpsOn?"":"none";fN=0;fMs=0;fT=performance.now()});
document.addEventListener("visibilitychange",function(){running=!document.hidden;if(running&&S)kick()});
// HUD: every value is compared raw first; strings are built and textContent set only when it changed. Leaderboard rows are made once and reused.
var lb=$("lb"),HC={},PV=[20,40,60,80],LBA=[],LR=[],agE=$("ag"),pcE=$("pc"),spE=$("sp"),pgE=$("ping"),grE=$("gr"),pzE=$("pz");
function byCells(a,b){return b.cells-a.cells}
function chg(k,v){if(HC[k]===v)return false;HC[k]=v;return true}
for(i=0;i<6;i++){var d0=document.createElement("div"),i0=document.createElement("i"),n0=document.createElement("span"),v0=document.createElement("small");
d0.appendChild(i0);d0.appendChild(n0);d0.appendChild(v0);d0.style.display="none";lb.appendChild(d0);LR.push({d:d0,i:i0,n:n0,v:v0,id:-2,r:-1,al:false,hu:false,nm:null,col:null,me:false,c:-1,ld:-1})}
function hud(){if(chg("pct",pct))for(var q=0;q<4;q++)pb[q].className=PV[q]===pct?"on":"";if(!S)return;var me=S.P[ME];setDead(!me.alive&&S.tick>S.SPAWN);
if(mode!=="solo"&&window.Net){var ns=Net.status();if(chg("pgv",1))pgE.style.display="block";if(chg("ms",ns.ms)|chg("hn",ns.h))pgE.textContent="📶 "+ns.ms+" ms · humans "+ns.h+"/16"}else if(chg("pgv",0))pgE.style.display="none";
var ag=Math.floor(me.agents);if(chg("ag",ag))agE.textContent=fmt(ag)+" agents";
if(chg("cl",me.cells)|chg("ld",S.land))pcE.textContent=(me.cells/S.land*100).toFixed(1)+"% of map";
var sp=S.SPAWN-S.tick,sk=sp>0?Math.ceil(sp/10):me.fwUntil>S.tick&&me.alive?-2:-3;
if(chg("sp",sk)){spE.textContent=sk>0?"spawn "+sk+"s":sk===-2?"⚡ OVERCHARGED":"";spE.className=agE.className=sk===-2?"oc":""}
// grace countdown, then "GLOVES OFF" for 8 s
var gs=S.tick<S.SPAWN?-1:S.tick<S.graceEnd?Math.ceil((S.graceEnd-S.tick)/10):S.tick<S.graceEnd+80?0:-2;
// failsafe clock: the last 2 min before TIME'S UP
if(gs===-2&&S.tick>=S.TWARN&&S.tick<S.TMAX&&!S.winner)gs=1e5+Math.ceil((S.TMAX-S.tick)/10);
// FINAL SHOWDOWN banner: the countdown, then 8 s of the showdown line
if(!S.winner&&S.sd===1)gs=2e5+Math.max(0,Math.ceil((S.sdT+S.SDCD-S.tick)/10));else if(!S.winner&&S.sd>1&&S.tick<S.sdT+80)gs=3e5;
if(chg("gr",gs)){var tl=gs-1e5;grE.textContent=gs>=3e5?"🔥 FINAL SHOWDOWN — ONLY ONE SURVIVES":gs>=2e5?"⚔️ ALLIANCES EXPIRE IN "+(gs-2e5):gs>1e5?"⏰ "+(tl>=120?"2 min left":(tl/60|0)+":"+(tl%60<10?"0":"")+tl%60+" left"):gs>0?"🕊️ grace period · "+(gs/60|0)+":"+(gs%60<10?"0":"")+gs%60:gs===0?"⚔️ GLOVES OFF":"";grE.className=gs===0||gs>1e5?"go":"";grE.style.display=gs<0?"none":""}
LBA.length=0;for(var k=1;k<S.P.length;k++)if(S.P[k].alive)LBA.push(S.P[k]);LBA.sort(byCells);var n=Math.min(5,LBA.length),mi=LBA.indexOf(me);
for(var j=0;j<6;j++){var R=LR[j],p=j<n?LBA[j]:(j===n&&!(mi>=0&&mi<n))?me:null;if(!p){if(R.id!==-2){R.id=-2;R.d.style.display="none"}continue}
var r=j<n?j+1:mi+1,al=me.allies.has(p.id),hu=mode!=="solo"&&!!human[p.id],nm=names[p.id],col=hexs[p.id],isMe=p.id===ME;if(R.id===-2)R.d.style.display="";
if(R.col!==col){R.col=col;R.i.style.background=col}
if(R.id!==p.id||R.r!==r||R.al!==al||R.hu!==hu||R.nm!==nm){R.r=r;R.al=al;R.hu=hu;R.nm=nm;R.n.textContent=(r?r+". ":"")+nm+(hu?" ✓":"")+(al?" 🤝":"")}
if(R.me!==isMe){R.me=isMe;R.d.className=isMe?"me":""}
if(R.id!==p.id||R.c!==p.cells||R.ld!==S.land){R.c=p.cells;R.ld=S.land;R.v.textContent=(p.cells/S.land*100).toFixed(1)+"%"}R.id=p.id}
// ability buttons: cooldown ring, cost badge (red when unaffordable), glow + haptic tick when ready
var live=me.alive&&S.tick>=S.SPAWN&&!ended,vc=me.vxCd>S.tick?me.vxCd-S.tick:0,fc=me.fwCd>S.tick?me.fwCd-S.tick:0,cost=S.vxCost(me),poor=me.agents<cost,vr=live&&!vc&&!poor,fr=live&&!fc;
if(chg("vc",vc))vxB.style.setProperty("--cd",vc/S.VXCD);if(chg("fc",fc))fwB.style.setProperty("--cd",fc/S.FWCD);
var vs=vc?Math.ceil(vc/10)+"s":live?fmt(cost):"";if(chg("vs",vs))vxB.c.textContent=vs;var fs=fc?Math.ceil(fc/10)+"s":"";if(chg("fs",fs))fwB.c.textContent=fs;
if(chg("vcl",(aim?"aim":vr?"rdy":vc?"cd":"")+(poor&&!vc&&live?" poor":"")))vxB.className="abb "+HC.vcl;if(chg("fcl",fr?"rdy":fc?"cd":""))fwB.className="abb "+HC.fcl;
if(chg("vr",vr)&&vr){FX.buzz(12);hint("vx","🦠 VIRUS ready — tap then aim")}if(chg("fr",fr)&&fr){FX.buzz(12);hint("fw","🛡️ FIREWALL ready — tap to overcharge")}
if(chg("aim",aim))vxX.className=aim?"on":"";
var pr=S.press(),pv=pr>1&&!S.winner?Math.round(pr*10)/10:0;if(chg("pz",pv)){pzE.textContent=pv?"⚡×"+pv.toFixed(1):"";pzE.style.display=pv?"":"none"}}
// first-time hints: once per device
function hint(k,t){var key="hm_hint_"+k;try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1")}catch(e){if(HC[key])return;HC[key]=1}toast(t,6000)}
var bar=$("bar"),pb=[];
function btn(label,fn){var b=document.createElement("button"),s=document.createElement("span"),f=document.createElement("b");s.textContent=label;b.appendChild(f);b.appendChild(s);
b.addEventListener("click",function(e){e.stopPropagation();fn()});bar.appendChild(b);b.f=f;return b}
[20,40,60,80].forEach(function(v){pb.push(btn(v+"%",function(){pct=v;hud()}))});
function ab(k){act({type:"ability",k:k});hud()}
// VIRUS: the button (or Q) toggles aim mode; the next tap on the map launches
function vxWhy(){var me=S.P[ME];return me.vxCd>S.tick?"🦠 virus recharging · "+Math.ceil((me.vxCd-S.tick)/10)+"s ⏳":me.agents<S.vxCost(me)?"🦠 need "+fmt(S.vxCost(me))+" agents":""}
function aimT(){if(!S||ended)return;var me=S.P[ME];if(aim){aimOff();return}if(!me.alive||S.tick<S.SPAWN)return;var w=vxWhy();if(w){toast(w);return}
aim=true;hidePop();if(!hv||lpt!=="mouse"){hx=cw/2;hy=ch/2;hv=true}hud()}
function aimOff(){if(!aim)return;aim=false;if(lpt!=="mouse")hv=false;hud()}
var abx=$("abx"),vxX=$("vxx");vxX.addEventListener("click",function(e){e.stopPropagation();aimOff()});
function abBtn(em,label,key,fn){var b=document.createElement("button"),r=document.createElement("i"),e=document.createElement("b"),s=document.createElement("span"),c=document.createElement("small"),k=document.createElement("kbd");
b.type="button";b.className="abb";b.setAttribute("aria-label",label);r.className="rg";e.className="em";e.textContent=em;s.textContent=label;k.textContent=key;
[r,e,s,c,k].forEach(function(x){b.appendChild(x)});b.addEventListener("click",function(ev){ev.stopPropagation();fn()});abx.appendChild(b);b.c=c;return b}
var fwB=abBtn("🛡️","FIREWALL","E",function(){if(S&&S.P[ME].fwCd>S.tick)toast("🛡️ firewall recharging · "+Math.ceil((S.P[ME].fwCd-S.tick)/10)+"s ⏳");else ab("fw")}),vxB=abBtn("🦠","VIRUS","Q",aimT);
addEventListener("keydown",function(e){var k=e.key.toLowerCase();if(k>="1"&&k<="4"){pct=[20,40,60,80][+k-1];hud()}else if(k==="q")aimT();else if(k==="e")ab("fw");else if(k==="escape"){hidePop();aimOff()}});
var pop=$("pop");
function hidePop(){pop.style.display="none"}
// SPECTATING chip, shown in place of the controls once your swarm is gone
var specE=document.createElement("div");specE.id="spec";specE.className="gl";specE.setAttribute("role","status");specE.textContent="👻 SPECTATING";specE.style.display="none";$("hud").appendChild(specE);
function setDead(d){if(!chg("dead",d))return;bar.style.display=abx.style.display=d?"none":"";specE.style.display=d?"":"none";if(d){aimOff();aim=false;hv=false;hidePop()}}
// one reset for rematch, quit and new match: timers, aim, banners, chips, popover, feed
function resetHud(){clearTimers();aim=false;hv=false;vxX.className="";hidePop();$("feed").textContent="";grE.style.display="none";grE.className="";grE.textContent="";
spE.textContent="";spE.className=agE.className="";pzE.style.display="none";pzE.textContent="";for(var k in HC)delete HC[k];bar.style.display=abx.style.display="";specE.style.display="none"}
function popBtn(t,fn){var b=document.createElement("button");b.textContent=t;b.addEventListener("click",function(e){e.stopPropagation();fn();hidePop()});pop.appendChild(b);return b}
function showPop(o,sx,sy){var me=S.P[ME],q=S.P[o];pop.textContent="";var h=document.createElement("p");h.textContent=names[o]+" · "+fmt(q.agents);h.style.color=hexs[o];pop.appendChild(h);
if(me.allies.has(o)){popBtn("send 20% 🎁",function(){donate(o)});popBtn("unally",function(){act({type:"unally",target:o})})}else{var ab0=popBtn("ally? 🤝",function(){act({type:"ally",target:o})});if(S.sd>1){ab0.disabled=true;ab0.title="alliances are over 💀"}}
var nb=S.neighbors(ME);if(nb[o]&&S.tick>=S.graceEnd)popBtn((me.allies.has(o)?"betray 🐍 ":"attack ⚔️ ")+pct+"%",function(){act({type:"attack",x:nb[o].x,y:nb[o].y,pct:pct})});
pop.style.display="flex";var w=pop.offsetWidth,hh=pop.offsetHeight;pop.style.left=Math.max(8,Math.min(cw-w-8,sx-w/2))+"px";pop.style.top=Math.max(8,Math.min(ch-hh-70,sy+12))+"px"}
function donate(o){if(act({type:"donate",target:o,pct:20})===false)toast("🎁 donate recharging ⏳")}
// ALLIES: tap the agents counter for your allies, each with donate and unally
function showAllies(){if(!S||ended)return;var me=S.P[ME],A=Array.from(me.allies);pop.textContent="";var h=document.createElement("p");h.textContent="allies "+A.length+"/3 🤝";pop.appendChild(h);
if(!A.length){var s=document.createElement("small");s.textContent=S.sd>1?"final showdown · alliances are over 💀":"no allies yet · tap a swarm to ask";pop.appendChild(s)}
A.forEach(function(o){var r=document.createElement("div"),n=document.createElement("span");r.className="al";n.textContent=names[o];n.style.color=hexs[o];r.appendChild(n);pop.appendChild(r);
[["send 20% 🎁",function(){donate(o)}],["unally",function(){act({type:"unally",target:o})}]].forEach(function(x){var b=document.createElement("button");b.type="button";b.textContent=x[0];
b.addEventListener("click",function(e){e.stopPropagation();x[1]();hidePop()});r.appendChild(b)})});
var t=$("top").getBoundingClientRect();pop.style.display="flex";pop.style.left=Math.max(8,t.left)+"px";pop.style.top=(t.bottom+8)+"px"}
$("top").addEventListener("click",function(e){e.stopPropagation();if(pop.style.display==="flex")hidePop();else showAllies()});
(function(t){t.setAttribute("role","button");t.tabIndex=0;t.setAttribute("aria-label","Your swarm · show allies");t.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();t.click()}})})($("top"));
pb.forEach(function(b,i){b.type="button";b.setAttribute("aria-label","Send "+PV[i]+"% of agents per attack")});
function tap(sx,sy){hidePop();if(ended||!S)return;var g=s2g(sx,sy),x=Math.floor(g.x),y=Math.floor(g.y);if(x<0||y<0||x>=W||y>=H)return;
if(S.tick<S.SPAWN){if(act({type:"spawn",x:x,y:y})){paintList(S.diff());centered=false;focusSpawn();FX.spawn()}return}
var me=S.P[ME];if(!me.alive)return;
if(aim){aimOff();var why=vxWhy()||(S.own[y*W+x]===255?"can't target a firewall 🧱":S.tick<S.graceEnd&&S.own[y*W+x]&&S.own[y*W+x]!==ME?"🕊️ grace period · virus neutral land only":"");
if(why)toast(why);else act({type:"ability",k:"vx",x:x,y:y});hud();return}var i=y*W+x,o=S.own[i];if(o===255||o===ME)return;
if(o&&S.tick<S.graceEnd){toast("🕊️ grace period · no attacks for "+Math.ceil((S.graceEnd-S.tick)/10)+"s");showPop(o,sx,sy);return}
if(S.adjacent(i,ME)){if(o&&me.allies.has(o)){showPop(o,sx,sy);return}act({type:"attack",x:x,y:y,pct:pct});return}
if(o){showPop(o,sx,sy);return}
var nb=S.neighbors(ME);if(nb[0])act({type:"attack",x:nb[0].x,y:nb[0].y,pct:pct})}
var ptrs=new Map(),down=null,drag=false,pinch=null;
function pd(){var a=Array.from(ptrs.values());return{d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)||1,cx:(a[0].x+a[1].x)/2,cy:(a[0].y+a[1].y)/2}}
// right-click: cancels VIRUS aim and never taps
cv.addEventListener("contextmenu",function(e){e.preventDefault();aimOff()});
cv.addEventListener("pointerdown",function(e){lpt=e.pointerType;if(e.button===2){aimOff();return}try{cv.setPointerCapture(e.pointerId)}catch(_){}ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
if(ptrs.size===1){down={x:e.clientX,y:e.clientY};drag=false;multi=false}else{drag=true;multi=true;if(ptrs.size===2)pinch=pd()}});
cv.addEventListener("pointermove",function(e){var q=ptrs.get(e.pointerId);if(!q)return;var dx=e.clientX-q.x,dy=e.clientY-q.y;q.x=e.clientX;q.y=e.clientY;
if(ptrs.size===1){if(!drag&&down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>6)drag=true;if(drag&&!aim){cam.x-=dx/cam.z;cam.y-=dy/cam.z;clampCam()}}
else if(ptrs.size===2&&pinch){var n=pd();zoomAt(n.cx,n.cy,n.d/pinch.d);cam.x-=(n.cx-pinch.cx)/cam.z;cam.y-=(n.cy-pinch.cy)/cam.z;clampCam();pinch=n}});
function up(e){if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;
// aiming: the reticle follows the finger, and lifting it fires (unless a pinch happened)
if(ptrs.size===0){if((aim?!multi:!drag)&&down&&e.type==="pointerup")tap(e.clientX,e.clientY);down=null}}
cv.addEventListener("pointerdown",function(e){hx=e.clientX;hy=e.clientY;hv=ptrs.size===1});
cv.addEventListener("pointermove",function(e){hx=e.clientX;hy=e.clientY;hv=e.pointerType==="mouse"||(ptrs.size===1&&(aim||!drag))});
function hoff(e){if(e.type==="pointerleave"||e.pointerType!=="mouse")hv=false}
cv.addEventListener("pointerup",hoff);cv.addEventListener("pointercancel",hoff);cv.addEventListener("pointerleave",hoff);
cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);
cv.addEventListener("wheel",function(e){e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015))},{passive:false});
function end(){if(ended)return;aimOff();aim=false;hv=false;vxX.className="";hidePop();ended=true;hud();var me=S.P[ME],P=S.P.slice(1),rank;
// one victor only: #1 is the last swarm standing (or the biggest single swarm at TIME'S UP)
var to=S.timeup||S.tick>=S.TMAX;
if(S.winner===ME)rank=1;else if(me.alive)rank=1+P.filter(function(p){return p.alive&&p.id!==ME&&(p.id===S.winner||p.cells>me.cells)}).length;
else rank=1+P.filter(function(p){return p.id!==ME&&(p.alive||p.diedAt>me.diedAt)}).length;
FX.endScreen({rank:rank,title:(to?"⏰ TIME'S UP · ":"")+(S.winner===ME?"YOUR SWARM WINS 🏆":me.alive?(names[S.winner]||"Someone")+(to?" is the biggest swarm":" took the network"):"YOUR SWARM WAS DELETED 💀"),
peak:fmt(me.peak),pct:me.cells/S.land*100,kills:me.kills,alive:((me.alive?S.tick:me.diedAt)-S.SPAWN)/10,
again:function(){if(window.Net)Net.leave();mode="solo";resetHud();$("end").style.display="none";$("ping").style.display="none";$("hud").style.display="none";Menu.show()}})}
})();
