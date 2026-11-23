var FX=(function(){"use strict";
var RM=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);
var AC=null,master=null,nbuf=null,on=true,voices=0;
function dec(){voices--}
function unlock(){if(AC){if(AC.state==="suspended")AC.resume();return}var C=window.AudioContext||window.webkitAudioContext;if(!C)return;
try{AC=new C();master=AC.createGain();master.gain.value=.5;master.connect(AC.destination)}catch(e){AC=null}}
// the noise buffer is built the first time a sweep plays, not at unlock
function noise(){if(nbuf)return nbuf;try{var n=AC.sampleRate,b=AC.createBuffer(1,n,n),d=b.getChannelData(0);for(var i=0;i<n;i++)d[i]=Math.random()*2-1;nbuf=b}catch(e){}return nbuf}
addEventListener("pointerdown",unlock,true);addEventListener("keydown",unlock,true);
function can(){return on&&AC&&AC.state==="running"&&voices<12}
function tone(f,d,type,vol,at,f2){if(!can())return;var t=AC.currentTime+(at||0),o=AC.createOscillator(),g=AC.createGain();o.type=type||"sine";o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);
g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(master);voices++;o.onended=dec;o.start(t);o.stop(t+d+.05)}
function sweep(vol,d){if(!can()||!noise())return;var t=AC.currentTime,s=AC.createBufferSource(),f=AC.createBiquadFilter(),g=AC.createGain();s.buffer=nbuf;f.type="bandpass";f.Q.value=1.2;
f.frequency.setValueAtTime(3000,t);f.frequency.exponentialRampToValueAtTime(150,t+d);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s.connect(f);f.connect(g);g.connect(master);voices++;s.onended=dec;s.start(t);s.stop(t+d)}
function seq(fs,d,type,vol,gap){for(var i=0;i<fs.length;i++)tone(fs[i],d,type,vol,i*gap)}
var bT=0,bStep=0;
function blip(){var n=performance.now();if(n-bT<70)return;bStep=n-bT<500?Math.min(bStep+1,14):0;bT=n;tone(440*Math.pow(2,bStep/12),.07,"triangle",.07)}
function thud(loud){tone(110,.4,"sine",loud?.55:.22,0,38);sweep(loud?.22:.08,.5)}
function buzz(p){try{if(navigator.vibrate)navigator.vibrate(p)}catch(e){}}

/* pools */
var NP=20,rings=[],flo=[],i;
for(i=0;i<NP;i++){rings.push({x:0,y:0,t:-1e9,c:"#fff"});flo.push({x:0,y:0,t:-1e9,s:""})}
var ri=0,fi=0,FL=256,flC=new Int32Array(FL),flT=new Float64Array(FL),fh=0;
for(i=0;i<FL;i++)flT[i]=-1e9;
var shk=0,S=null,ME=1,W=1,tT=0,MK=Object.create(null),INF=[],INC=[];
for(i=0;i<8;i++)INF.push({x:0,y:0,a:0,t:-1e9});
// VIRUS missiles: tick-driven arc (same on host and client), launch point cached per missile at first sight
function mkey(m){return m.by+":"+m.landTick}
function near(x,y,o){var r=S.VXR||4;for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r*r)continue;var X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<W&&Y<S.H&&S.own[Y*W+X]===o)return true}return false}
function bez(a,p,o){var u=1-p,cx=(a.sx+a.tx)/2,cy=(a.sy+a.ty)/2-a.h;o.x=u*u*a.sx+2*u*p*cx+p*p*a.tx;o.y=u*u*a.sy+2*u*p*cy+p*p*a.ty;return o}
var BP={x:0,y:0};
function drawMis(ctx,ox,oy,z,t){var L=S.missiles;if(!L||!L.length)return;var T=S.VXT||15;
VW=innerWidth;VH=innerHeight;for(var k=0;k<L.length;k++){var m=L[k],key=mkey(m),a=MK[key];
if(!a){var c=FX.cent&&FX.cent[m.by],sx=c?c.x:m.x+.5,sy=c?c.y:m.y+.5,tx=m.x+.5,ty=m.y+.5;a=MK[key]={sx:sx,sy:sy,tx:tx,ty:ty,h:Math.max(6,Math.hypot(tx-sx,ty-sy)*.35),lt:m.landTick}}
var p=Math.max(0,Math.min(1,(T-(m.landTick-S.tick))/T+Math.min(100,t-tT)/1500));
var pr=.5+.5*Math.sin(t/90),R=Math.max(10,z*S.VXR*.9);bez(a,p,BP);var hv=vis(ox+BP.x*z,oy+BP.y*z,z*2+40)||(bez(a,Math.max(0,p-.252),BP),vis(ox+BP.x*z,oy+BP.y*z,z*2+40));
if(!vis(ox+a.tx*z,oy+a.ty*z,R+2)){if(!hv)continue}else{ctx.strokeStyle="#ff3b4d";ctx.lineWidth=1.5;ctx.globalAlpha=.35+.35*pr;ctx.beginPath();ctx.arc(ox+a.tx*z,oy+a.ty*z,R,0,6.2832);ctx.stroke()}
if(!hv)continue;if(!RM)for(var j=14;j>0;j--){var q=p-j*.018;if(q<0)continue;bez(a,q,BP);ctx.globalAlpha=(1-j/15)*.7;ctx.fillStyle=j%3?"#7dff5a":"#ff3b4d";var s=Math.max(2,z*.45)*(1-j/20);ctx.fillRect(ox+BP.x*z-s/2,oy+BP.y*z-s/2,s,s)}
bez(a,p,BP);var hx=ox+BP.x*z,hy=oy+BP.y*z,hs=Math.max(4,z*.8),hq=Math.round(hs*2)/2;ctx.globalAlpha=1;
spr(ctx,"m"+hq,hq/2,14,"#7dff5a",function(g){g.fillStyle="#e9ffd9";g.beginPath();g.arc(0,0,hq/2,0,6.2832);g.fill()},hx,hy,0)}
ctx.globalAlpha=1}
// glow sprites: a shape drawn once with shadowBlur into an offscreen canvas at the device scale (blur is in device px, as on the main canvas), then blitted 1:1
var SP=Object.create(null),SPn=0;
function spr(ctx,key,rad,blur,col,fn,x,y,rot){var d=FX.dpr||1,k=key+"|"+d,s=SP[k];
if(!s){if(++SPn>96){SP=Object.create(null);SPn=1}var pad=Math.ceil(blur*1.8)+2,D=Math.ceil(rad*2*d)+2*pad,c=document.createElement("canvas");c.width=c.height=D;
var g=c.getContext("2d");g.translate(D/2,D/2);g.scale(d,d);g.shadowColor=col;g.shadowBlur=blur;fn(g);s=SP[k]={c:c,h:D/2/d}}
if(rot){ctx.translate(x,y);ctx.rotate(rot);ctx.drawImage(s.c,-s.h,-s.h,2*s.h,2*s.h);ctx.rotate(-rot);ctx.translate(-x,-y)}else ctx.drawImage(s.c,x-s.h,y-s.h,2*s.h,2*s.h)}
function ring(x,y,c){var r=rings[ri];ri=(ri+1)%NP;r.x=x;r.y=y;r.c=c||"#fff";r.t=performance.now()}
function floater(s,x,y){var f=flo[fi];fi=(fi+1)%NP;f.x=x;f.y=y;f.s=s;f.t=performance.now()}

/* callouts */
var co=null,cq=[],cT=0;
function el(){if(!co){co=document.createElement("div");co.id="fxco";co.setAttribute("aria-live","polite");document.body.appendChild(co)}return co}
function callout(s){if(cq.length<3)cq.push(s)}
function pumpCo(n){if(!cq.length||n-cT<1100)return;cT=n;var e=el();e.textContent=cq.shift();e.classList.remove("go");void e.offsetWidth;e.classList.add("go")}

/* match state */
var gp=0,sdn=0,lastSec=0,mi=0,wasLead=false,hist=new Float64Array(7),hi=0,eatT=0,fb=false,streak=0,lastK=-1e9;
var MS=[.1,.25,.4],MSL=["10% OF THE MAP","25% OF THE MAP 🔥","40% OF THE MAP 😤"];
function set(s,me){S=s;ME=me;W=s.W;gp=0;sdn=0;MK=Object.create(null);INC.length=0;for(var q=0;q<INF.length;q++)INF[q].t=-1e9;lastSec=0;mi=0;wasLead=false;hi=0;eatT=0;fb=false;streak=0;lastK=-1e9;cq.length=0;shk=0;
for(var k=0;k<7;k++)hist[k]=0;for(k=0;k<FL;k++)flT[k]=-1e9;for(k=0;k<NP;k++){rings[k].t=-1e9;flo[k].t=-1e9}}
function step(){if(!S)return;var me=S.P[ME],tk=S.tick;tT=performance.now();
if(tk%10===0)for(var mk in MK)if(MK[mk].lt<tk-5)delete MK[mk];
if(tk<S.SPAWN){var s=Math.ceil((S.SPAWN-tk)/10);if(s!==lastSec){lastSec=s;tone(s<=3?1320:880,.05,"square",.05)}return}
// grace period: one callout as it opens, one as it ends (tick-driven, so host and clients match)
if(gp<1){gp=1;callout("🕊️ GRACE PERIOD · EXPAND");tone(660,.2,"sine",.06)}
if(gp<2&&S.graceEnd&&tk>=S.graceEnd){gp=2;callout("⚔️ GLOVES OFF");thud(true);tone(220,.3,"sawtooth",.07);tone(440,.4,"square",.05,.12);buzz([40,30,80])}
// OVERCLOCK: late-game pressure starts (tick-driven; a client joining well after it gets no callout)
if(gp===2&&S.OVT&&tk>=S.OVT){gp=3;if(tk<S.OVT+100){callout("⚡ OVERCLOCK — attacks getting cheaper");tone(330,.35,"sawtooth",.06,0,990);tone(660,.3,"square",.04,.2);tone(1320,.25,"triangle",.05,.4);buzz([30,30,30,30,90])}}
// FINAL SHOWDOWN: a warning tick as the countdown starts, then the callout and a horn when alliances dissolve
if(sdn<1&&S.sd>=1){sdn=1;tone(523,.2,"square",.05);tone(392,.3,"square",.05,.18)}
if(sdn<2&&S.sd>1){sdn=2;callout("🔥 FINAL SHOWDOWN — ONLY ONE SURVIVES");thud(true);tone(110,.9,"sawtooth",.08);tone(220,.7,"square",.05,.1);tone(330,.6,"triangle",.05,.3);buzz([80,40,80,40,160])}
if(tk%5||!me.alive)return;var pc=me.cells/S.land;while(mi<3&&pc>=MS[mi]){callout(MSL[mi]);mi++}
var lead=true;for(var k=1;k<S.P.length;k++){var p=S.P[k];if(k!==ME&&p.alive&&p.cells>=me.cells){lead=false;break}}
if(lead&&!wasLead&&tk>S.SPAWN+30){callout("YOU'RE #1 👑");tone(988,.15,"triangle",.08);tone(1319,.25,"triangle",.08,.1)}wasLead=lead;
hi=(hi+1)%7;hist[hi]=me.cells;var old=hist[(hi+1)%7],n=performance.now();
if(old>20&&old-me.cells>old*.05&&n-eatT>6000){eatT=n;callout("⚠️ YOU'RE BEING EATEN");buzz([60,40,60])}}
function cap(c){if(!S)return;flC[fh]=c;flT[fh]=performance.now();fh=(fh+1)%FL;blip();
if(S.dc&&S.dc[c]){floater("+15% ⚡ DATACENTER",c%W+.5,((c/W)|0)+.5);tone(784,.12,"triangle",.09);tone(1175,.2,"triangle",.09,.08)}}
function ev(e,c,col){if(!S)return;
if(e.k==="kill"){var mine=e.a===ME;if(c)ring(c.x,c.y,col);thud(mine);if(mine||e.b===ME)buzz(mine?[30,40,60]:250);
if(!fb&&e.a){fb=true;callout("FIRST BLOOD 🩸")}
if(mine){if(!RM)shk=12;streak=S.tick-lastK<200?streak+1:1;lastK=S.tick;if(streak>1)callout(streak===2?"DOUBLE DELETE":streak===3?"TRIPLE DELETE":"SWARM SZN 🐝")}}
else if(e.k==="ab"&&e.ab==="vx"){var inc=e.a!==ME&&near(e.x,e.y,ME);if(inc){INC.push(e.a+":"+e.x+":"+e.y);if(INC.length>16)INC.shift();callout("⚠️ INCOMING VIRUS");buzz([40,40,40])}
if(e.a===ME||inc){sweep(.14,.7);tone(500,1.4,"sine",.05,.1,2200);if(e.a===ME)buzz(35)}}
else if(e.k==="vxhit"){var key=e.a+":"+e.x+":"+e.y,ix=INC.indexOf(key),hitMe=ix>=0,mn=e.a===ME;if(hitMe)INC.splice(ix,1);
var n=performance.now();ring(e.x+.5,e.y+.5,"#7dff5a");ring(e.x+.5,e.y+.5,"#ff3b4d");rings[(ri+NP-1)%NP].t=n+180;
var f=INF.shift();f.x=e.x;f.y=e.y;f.a=e.a;f.t=n;INF.push(f);
if(mn||hitMe){thud(true);tone(55,.8,"sawtooth",.08,0,30);buzz(mn?[50,30,90]:200);if(!RM)shk=mn?14:18;if(mn)callout("VIRUS DEPLOYED 🦠")}}
else if(e.k==="ab"&&e.a===ME){tone(70,.9,"sawtooth",.07,0,150);tone(140,.9,"sine",.06,0,300);tone(280,.9,"triangle",.03,.3,600);buzz(40)}}
function spawn(){buzz(25);tone(660,.08,"triangle",.08)}

/* drawing */
var grad=null,gh=0,lt=0;
function bg(ctx,cw,ch,t){if(!grad||gh!==ch){gh=ch;grad=ctx.createLinearGradient(0,0,0,ch*.5);grad.addColorStop(0,"rgba(60,240,255,0)");grad.addColorStop(.5,"rgba(60,240,255,.07)");grad.addColorStop(1,"rgba(60,240,255,0)")}
var y=(t*.04)%(ch*1.5)-ch*.5;ctx.translate(0,y);ctx.fillStyle=grad;ctx.fillRect(0,0,cw,ch*.5);ctx.translate(0,-y)}
function frame(t){var dt=Math.min(100,t-lt);lt=t;pumpCo(t);
if(shk>.3){shk*=Math.pow(.9,dt/16);FX.sx=(Math.random()-.5)*shk;FX.sy=(Math.random()-.5)*shk}else{shk=0;FX.sx=0;FX.sy=0}}
// every effect is culled to the viewport (screen px, with margin m)
var VW=0,VH=0;function vis(X,Y,m){return X>-m&&Y>-m&&X<VW+m&&Y<VH+m}
function draw(ctx,ox,oy,z,t){var k,a;VW=innerWidth;VH=innerHeight;
if(!RM){ctx.fillStyle="#fff";for(k=0;k<FL;k++){a=t-flT[k];if(a>=300)continue;var c=flC[k];if(!vis(ox+(c%W)*z,oy+((c/W)|0)*z,z))continue;ctx.globalAlpha=(1-a/300)*.75;ctx.fillRect(ox+(c%W)*z,oy+((c/W)|0)*z,z,z)}}
for(k=0;k<INF.length;k++){var g=INF[k];a=t-g.t;if(a>=900||a<0||!vis(ox+g.x*z,oy+g.y*z,z*8))continue;var VR=S.VXR||4;ctx.globalAlpha=(1-a/900)*.8;ctx.fillStyle=((a/120)|0)%2?"#ff3b4d":"#7dff5a";ctx.beginPath();
for(var dy=-VR;dy<=VR;dy++)for(var dx=-VR;dx<=VR;dx++){if(dx*dx+dy*dy>VR*VR)continue;var X0=g.x+dx,Y0=g.y+dy;if(X0>=0&&Y0>=0&&X0<W&&Y0<S.H&&S.own[Y0*W+X0]===g.a)ctx.rect(ox+X0*z,oy+Y0*z,z,z)}ctx.fill()}
drawMis(ctx,ox,oy,z,t);
ctx.lineWidth=3;for(k=0;k<NP;k++){var r=rings[k];a=t-r.t;if(a>=800||a<0)continue;var p=a/800;if(!vis(ox+r.x*z,oy+r.y*z,8+p*Math.max(60,z*16)))continue;ctx.globalAlpha=1-p;ctx.strokeStyle=r.c;ctx.beginPath();ctx.arc(ox+r.x*z,oy+r.y*z,8+p*Math.max(60,z*16),0,6.2832);ctx.stroke()}
ctx.font="700 15px Geist,system-ui,sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";
for(k=0;k<NP;k++){var f=flo[k];a=t-f.t;if(a>=1400)continue;ctx.globalAlpha=a<1000?1:1-(a-1000)/400;var X=ox+f.x*z,Y=oy+f.y*z-a*.03;if(!vis(X,Y,120))continue;ctx.fillStyle="rgba(0,0,0,.6)";ctx.fillText(f.s,X+1,Y+1);ctx.fillStyle="#ffd84d";ctx.fillText(f.s,X,Y)}
ctx.globalAlpha=1}

/* sound toggle */
function mkToggle(){var top=document.getElementById("top");if(!top||document.getElementById("snd"))return;var b=document.createElement("button");b.id="snd";b.type="button";
function lab(){b.textContent=on?"🔊":"🔇";b.setAttribute("aria-label",on?"Mute sound":"Unmute sound")}lab();
b.addEventListener("click",function(e){e.stopPropagation();on=!on;lab()});top.appendChild(b)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mkToggle);else mkToggle();

/* end screen */
var best=0,wins=0,games=0;
function mmss(s){s=Math.max(0,s|0);return(s/60|0)+":"+(s%60<10?"0":"")+s%60}
function copy(t,done){function fb(){var a=document.createElement("textarea");a.value=t;a.setAttribute("readonly","");a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();var ok=false;try{ok=document.execCommand("copy")}catch(e){}document.body.removeChild(a);done(ok)}
if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){done(true)},fb);else fb()}
function endScreen(o){games++;var nb=!best||o.rank<best;if(nb)best=o.rank;wins=o.rank===1?wins+1:0;
if(o.rank===1){seq([523,659,784,1047],1.2,"triangle",.09,.04);buzz([50,50,120])}else{seq([392,370,349],.35,"sawtooth",.06,.4);tone(311,.9,"sawtooth",.06,1.2,240);buzz(150)}
var e=document.getElementById("end");e.textContent="";var g=document.createElement("div");g.className="gl fxend";
function L(tag,t,c){var n=document.createElement(tag);n.textContent=t;if(c)n.className=c;g.appendChild(n);return n}
L("p",o.title,"fxt");L("h1","#"+o.rank,"fxr"+(o.rank===1?" gold":""));L("p","of 16 swarms","fxs");
var st=document.createElement("div");st.className="fxst";g.appendChild(st);
[[o.peak,"peak agents"],[o.pct.toFixed(1)+"%","of map"],[o.kills,"deleted"],[mmss(o.alive),"alive"]].forEach(function(x){var d=document.createElement("div"),b=document.createElement("b"),s=document.createElement("span");b.textContent=x[0];s.textContent=x[1];d.appendChild(b);d.appendChild(s);st.appendChild(d)});
L("p",(nb&&games>1?"new session best 🔥 · ":"session best #"+best+" · ")+"win streak "+wins,"fxs");
var row=document.createElement("div");row.className="fxrow";g.appendChild(row);
var sh=document.createElement("button");sh.type="button";sh.textContent="SHARE RESULT";row.appendChild(sh);
var txt="HIVEMIND 🐝 #"+o.rank+"/16 · ate "+Math.round(o.pct)+"% · "+o.kills+" swarm"+(o.kills===1?"":"s")+" deleted · can you beat me?";
sh.addEventListener("click",function(){copy(txt,function(ok){sh.textContent=ok?"COPIED ✅":"COPY FAILED";setTimeout(function(){sh.textContent="SHARE RESULT"},1800)})});
var pa=document.createElement("button");pa.type="button";pa.className="p";pa.textContent="RUN IT BACK 🔁";pa.addEventListener("click",o.again);row.appendChild(pa);
e.appendChild(g);
if(o.rank===1&&!RM){var C=["#3cf0ff","#ff3b6b","#ffd84d","#9d5cff","#3dff8a","#ff5cf0"];for(var k=0;k<40;k++){var q=document.createElement("i");q.className="cf";q.style.left=Math.random()*100+"%";q.style.background=C[k%6];q.style.animationDelay=Math.random()*.8+"s";q.style.animationDuration=1.8+Math.random()*1.6+"s";e.appendChild(q)}}
e.style.display="flex"}
function bestTxt(){return best?"session best #"+best+"/16 · win streak "+wins:""}

return{sx:0,sy:0,dpr:1,spr:spr,RM:RM,unlock:unlock,set:set,step:step,cap:cap,ev:ev,spawn:spawn,bg:bg,frame:frame,draw:draw,endScreen:endScreen,best:bestTxt,callout:callout,buzz:buzz}})();
