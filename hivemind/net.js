var Net=(function(){"use strict";
var SRC="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js",SRI="sha384-nlUQ8ZqCbvStErob+biJNzSgltf6urV3VGqhfIfzhmg9RXmpeRm76ELw0pYnKlTR";
var AL="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",MAXB=524288,MAXI=4096,MAXC=15,MAXH=16,PCT=[20,40,60,80],OPT={serialization:"raw",reliable:true};
var ERR="Couldn't reach the matchmaking server 😵",KC={hello:1,i:1,ping:1,resync:1},KH={welcome:1,lobby:1,start:1,t:1,snap:1,full:1,started:1,kick:1,pong:1},EV={kill:1,ally:1,unally:1,snake:1,ab:1,vxhit:1,win:1,offer:1,donate:1},VER=1;
var banned=new Set(),lastJoin=0,hbI=0,wdI=0,lastRx=0;
function safe(f){return function(){try{return f.apply(this,arguments)}catch(e){console.warn("HIVEMIND net",e)}}}
function uniq(n,self){n=String(n).replace(/[👑✓✔©🤖]/gu,"").replace(/\s+/g," ").trim()||"anon";var L=Bots.NAMES,b=n.toLowerCase(),i,j=2,s=n;
for(i=0;i<L.length;i++)if(L[i].toLowerCase()===b){s=n=Array.from(n).slice(0,15).join("")+"©";break}
function taken(x){x=x.toLowerCase();for(var k in slots)if(+k!==self&&slots[k]&&slots[k].name.toLowerCase()===x)return true;return false}
while(taken(s)&&j<99)s=Array.from(n).slice(0,13).join("")+" "+j++;return s}
var peer=null,role="",nm="",col="",code="",pub=0,conns=Object.create(null),nconn=0,slots=Object.create(null),started=false,autoAt=0,timer=0,hc=null,ms=0,hum=1,seq=0,W=400,H=260,lastT=0;
function now(){return Date.now()}
var cleanName=Menu.cleanName;
function hex(c){return typeof c==="string"&&/^#[0-9a-fA-F]{6}$/.test(c)}
function I(v,a,b){return typeof v==="number"&&Math.floor(v)===v&&v>=a&&v<=b}
function F(v){return typeof v==="number"&&isFinite(v)}
function genCode(){var a=new Uint32Array(4),s="";crypto.getRandomValues(a);for(var i=0;i<4;i++)s+=AL[a[i]%AL.length];return s}
var warmed=false;function warm(){if(window.Peer||warmed)return;warmed=true;var l=document.createElement("link");l.rel="preload";l.as="script";l.href=SRC;l.integrity=SRI;l.crossOrigin="anonymous";document.head.appendChild(l)}
function load(cb){if(window.Peer)return cb();var s=document.createElement("script");s.src=SRC;s.integrity=SRI;s.crossOrigin="anonymous";
s.onload=function(){window.Peer?cb():fail("Online mode couldn't start 😵 Try PLAY VS BOTS.")};
s.onerror=function(){s.remove();fail("Couldn't load online mode 😵 Check your connection, or PLAY VS BOTS.")};document.head.appendChild(s)}
function fail(m){leave();Menu.err(m)}
// host→client up to 512 KB (a fragmented 104k-cell RLE snapshot can pass 64 KB); client→host stays at 4 KB
function parse(d,cap){if(typeof d!=="string"||d.length>(cap||MAXB))return null;try{return JSON.parse(d)}catch(e){return null}}
function tx(c,m){try{if(c&&c.open)c.send(JSON.stringify(m))}catch(e){}}
function clean(m,dir){if(!m||typeof m!=="object"||Array.isArray(m))return null;var k=m.k,o={k:k},i;
if(dir==="c2h"){if(typeof k!=="string"||KC[k]!==1)return null;
if(k==="hello"){if(typeof m.name!=="string"||m.name.length>64||!hex(m.color))return null;o.name=cleanName(m.name)||"anon";o.color=m.color;o.v=m.v===VER?VER:0}
else if(k==="ping"){if(!F(m.t))return null;o.t=m.t}
else if(k==="i"){var it=m.it,t;if(!it||typeof it!=="object")return null;t=it.type;var c={type:t};
if(t==="spawn"||t==="attack"){if(!I(it.x,0,W-1)||!I(it.y,0,H-1))return null;c.x=it.x;c.y=it.y;if(t==="attack"){if(PCT.indexOf(it.pct)<0)return null;c.pct=it.pct}}
else if(t==="ability"){if(it.k==="vx"){if(!I(it.x,0,W-1)||!I(it.y,0,H-1))return null;c.x=it.x;c.y=it.y}else if(it.k!=="fw")return null;c.k=it.k}
else if(t==="ally"||t==="unally"){if(!I(it.target,1,16)||(t==="ally"&&sdOn()))return null;c.target=it.target}
else if(t==="donate"){if(!I(it.target,1,16)||sdOn()||it.pct!==20)return null;c.target=it.target;c.pct=20}else return null;o.it=c}
return o}
if(typeof k!=="string"||KH[k]!==1)return null;
if(k==="welcome"){if(!I(m.id,1,16))return null;o.id=m.id;o.v=m.v===VER?VER:0}
else if(k==="kick"){o.r=typeof m.r==="string"&&m.r.length<=200?Array.from(m.r.replace(/[^\p{L}\p{M}\p{N}\p{P}\p{S} ]/gu,"")).slice(0,48).join("").trim():""}
else if(k==="pong"){if(!F(m.t))return null;o.t=m.t}
else if(k==="lobby"||k==="start"){var L=m.slots;if(!Array.isArray(L)||L.length>MAXH)return null;o.slots=[];
for(i=0;i<L.length;i++){var s=L[i];if(!Array.isArray(s)||!I(s[0],1,16)||typeof s[1]!=="string"||!hex(s[2]))return null;o.slots.push([s[0],cleanName(s[1])||"anon",s[2]])}
o.pub=!!m.pub;o.code=typeof m.code==="string"&&/^[A-Z2-9]{0,4}$/.test(m.code)?m.code:"";o.at=F(m.at)?Math.max(0,Math.min(60,m.at)):0;
if(k==="start"){if(!I(m.seed,0,4294967295)||!I(m.w,40,512)||!I(m.h,40,512))return null;o.seed=m.seed;o.w=m.w;o.h=m.h}}
else if(k==="t"||k==="snap"){var N=W*H;if(!I(m.tick,0,1e7)||!okP(m.p))return null;o.tick=m.tick;o.p=m.p;o.sd=I(m.sd,0,2)?m.sd:0;o.sdt=I(m.sdt,0,1e7)?m.sdt:0;
if(k==="t"){var d=m.d,a=m.a,e=m.e;if(!Array.isArray(d)||d.length%2||d.length>24000||!Array.isArray(a)||a.length>512||!Array.isArray(e)||e.length>64)return null;
for(i=0;i<d.length;i+=2)if(!I(d[i],0,N-1)||!(I(d[i+1],0,16)||d[i+1]===255))return null;
for(i=0;i<a.length;i++){if(!Array.isArray(a[i])||!I(a[i][0],1,16)||!I(a[i][1],0,N-1)||!F(a[i][2]))return null;a[i]=[a[i][0],a[i][1],Math.max(0,Math.min(1e6,a[i][2]))]}
o.e=[];for(i=0;i<e.length;i++){var v=e[i];if(!v||EV[v.k]!==1||!I(v.a,-1,16)||(v.b!=null&&!I(v.b,0,16)))return null;var ev={k:v.k,a:v.a,b:v.b,ok:!!v.ok,ab:v.ab==="vx"?"vx":"fw"};
// offer (a bot or human proposing to b) and donate need two distinct real swarms; ally replies carry a reason code 0–6
if((v.k==="offer"||v.k==="donate")&&!(I(v.a,1,16)&&I(v.b,1,16)&&v.a!==v.b))return null;if(v.k==="ally")ev.r=I(v.r,0,6)?v.r:0;
if(v.k==="vxhit"||(v.k==="ab"&&ev.ab==="vx")){if(!I(v.x,0,W-1)||!I(v.y,0,H-1))return null;ev.x=v.x;ev.y=v.y}o.e.push(ev)}
var M=m.m==null?[]:m.m;if(!Array.isArray(M)||M.length>32)return null;o.m=[];
for(i=0;i<M.length;i++){var q=M[i];if(!Array.isArray(q)||q.length!==4||!I(q[0],1,16)||!I(q[1],0,W-1)||!I(q[2],0,H-1)||!I(q[3],0,1e7))return null;o.m.push([q[0],q[1],q[2],q[3]])}
o.d=d;o.a=a;o.h=I(m.h,1,16)?m.h:hum}
else{var r=m.own,tot=0;if(!Array.isArray(r)||r.length%2||r.length>2*N||!I(m.winner,-1,16))return null;
for(i=0;i<r.length;i+=2){if(!(I(r[i],0,16)||r[i]===255)||!I(r[i+1],1,N))return null;tot+=r[i+1]}if(tot!==N)return null;o.own=r;o.winner=m.winner}}
return o}
// FINAL SHOWDOWN on the host's sim: no more ally or donate intents
function sdOn(){var S=window.HM&&HM.S();return !!(S&&S.sd>1)}
function okP(p){if(!Array.isArray(p)||p.length!==16)return false;for(var i=0;i<16;i++){var q=p[i];if(!Array.isArray(q)||q.length!==5)return false;for(var j=0;j<5;j++)if(!F(q[j]))return false}return true}
function newPeer(id){return id?new Peer(id):new Peer()}
function wait(t){var c=Menu.panel();Menu.el("h1",null,"HIVEMIND",c);Menu.el("p","t",t,c);Menu.btn(c,"CANCEL","",function(){leave();Menu.show()})}
function host(n,c,id,isPub){nm=n;col=c;load(function(){var tries=0;(function go(){code=isPub?"":genCode();var pid=id||"hivemind-r-"+code;
wait(isPub?"opening public lobby…":"creating room…");peer=newPeer(pid);
peer.on("open",safe(function(){role="host";pub=isPub?id.slice(-1):0;slots=Object.create(null);banned=new Set();lastJoin=0;var d=HM.dims();W=d.w;H=d.h;
slots[1]={name:uniq(nm,1),color:col,st:null};hum=1;clearInterval(hbI);hbI=setInterval(safe(beat),3000);lobby()}));
peer.on("connection",safe(onConn));
peer.on("error",function(e){console.warn("HIVEMIND peer",e&&e.type);if(role)return;if(e.type==="unavailable-id"){peer.destroy();peer=null;if(isPub)return quickFrom(+id.slice(-1));if(++tries<5)return go()}fail(ERR)});
peer.on("disconnected",function(){if(peer&&!peer.destroyed)try{peer.reconnect()}catch(e){}})})()})}
function freeSlot(){for(var i=2;i<=MAXH;i++)if(!slots[i])return i;return 0}
function beat(){var t=now();for(var k in conns){var st=conns[k];if(t-st.seen>15000)drop(st,"")}}
function onConn(c){if(banned.has(c.peer)){try{c.close()}catch(e){}return}
if(!started&&nconn<MAXC&&now()-lastJoin<2000){c.on("open",function(){tx(c,{k:"full"});setTimeout(function(){c.close()},400)});return}
if(conns[c.peer]){try{c.close()}catch(e){}return}
if(nconn>=MAXC||started){c.on("open",function(){tx(c,{k:started?"started":"full"});setTimeout(function(){c.close()},400)});return}
lastJoin=now();var st={c:c,slot:0,strikes:0,tok:30,last:now(),seen:now(),hello:false,snapAt:0,aw:0,ac:0,alAt:0,abAt:0};nconn++;conns[c.peer]=st;
st.to=setTimeout(function(){if(!st.hello)drop(st,"")},5000);
c.on("data",safe(function(d){onData(st,d)}));c.on("close",function(){gone(st)});c.on("error",function(){gone(st)})}
function strike(st){if(++st.strikes>=3)drop(st,"kicked for spam 👢")}
function onData(st,raw){if(st.dead)return;var t=now();st.seen=t;st.tok=Math.min(30,st.tok+(t-st.last)*.015);st.last=t;if(st.tok<1)return strike(st);st.tok--;
var pm=parse(raw,MAXI),m=clean(pm,"c2h");if(!m){if(started&&sdOn()&&pm&&pm.k==="i"&&pm.it&&(pm.it.type==="ally"||pm.it.type==="donate"))return;return strike(st)}
if(!st.hello){if(m.k!=="hello")return strike(st);if(m.v!==VER)return drop(st,"update your game 🔄");var s=freeSlot();if(!s){tx(st.c,{k:"full"});return drop(st,"")}
st.hello=true;clearTimeout(st.to);st.slot=s;slots[s]={name:uniq(m.name,s),color:m.color,st:st};hum++;tx(st.c,{k:"welcome",id:s,v:VER});
if(pub&&hum>=2&&!autoAt)autoAt=now()+45000;return lobby()}
if(!started&&m.k!=="ping")return strike(st);
if(m.k==="ping")tx(st.c,{k:"pong",t:m.t});
else if(m.k==="i"){var y=m.it.type;
if(y==="attack"){if(t-st.aw>=1000){st.aw=t;st.ac=0}if(++st.ac>6)return}
else if(y==="ally"||y==="unally"||y==="donate"){if(t-st.alAt<3000)return;st.alAt=t}
else if(y==="ability"){if(t-st.abAt<1000)return;st.abAt=t}
HM.applyFor(st.slot,m.it)}
else if(m.k==="resync"){if(started&&t>st.snapAt){st.snapAt=t+2000;tx(st.c,snap())}}
else if(m.k==="hello")strike(st)}
function drop(st,r){if(r)tx(st.c,{k:"kick",r:r});setTimeout(function(){try{st.c.close()}catch(e){}},200);gone(st)}
function gone(st){if(st.dead)return;st.dead=true;clearTimeout(st.to);nconn--;delete conns[st.c.peer];
if(st.slot&&slots[st.slot]&&slots[st.slot].st===st){delete slots[st.slot];hum--;if(started)HM.botify(st.slot);else{if(hum<2)autoAt=0;lobby()}}}
function list(){var L=[];for(var i=1;i<=MAXH;i++)if(slots[i])L.push([i,slots[i].name,slots[i].color]);return L}
function bcast(m){var s=JSON.stringify(m);for(var k in conns){var st=conns[k];if(st.hello)try{st.c.open&&st.c.send(s)}catch(e){}}}
function lobby(){if(role!=="host"||started)return;var L=list(),at=autoAt?Math.ceil((autoAt-now())/1000):0;
bcast({k:"lobby",slots:L,pub:!!pub,code:code,at:at});drawLobby(L,true,at);
clearTimeout(timer);if(autoAt){if(at<=0)return begin();timer=setTimeout(lobby,1000)}}
function drawLobby(L,isHost,at){var c=Menu.panel(),E=Menu.el;E("h1",null,pub||!code?"LOBBY":code,c);
E("p","t",(code?"room code "+code+" · share it with your squad":"public lobby")+" · "+L.length+"/16",c);
var ul=E("ul",null,null,c);L.forEach(function(s){var li=E("li",null,null,ul),i=E("i",null,null,li);i.style.background=s[2];E("span",null,s[1]+" ✓"+(s[0]===1?" 👑":""),li);
if(isHost&&s[0]!==1){var b=E("button",null,"kick",li);b.type="button";b.addEventListener("click",function(){var x=slots[s[0]];if(x&&x.st){banned.add(x.st.c.peer);drop(x.st,"the host kicked you 👢")}})}});
E("p","t",(at>0?"auto-start in "+at+"s · ":"")+"empty slots get bots 🤖",c);
if(isHost)Menu.btn(c,"START","p",begin);else E("p","t","waiting for the host…",c);
Menu.btn(c,"LEAVE","",function(){leave();Menu.show()})}
function begin(){if(started||role!=="host")return;started=true;clearTimeout(timer);var d=HM.dims();W=d.w;H=d.h;
var seed=(Math.random()*4294967296)>>>0,L=list();bcast({k:"start",seed:seed,w:W,h:H,slots:L,pub:!!pub,code:code});
Menu.hide();HM.startOnline({mode:"host",seed:seed,w:W,h:H,me:1,slots:L});lastT=0}
function P(){var S=HM.S(),p=[];for(var i=1;i<=16;i++){var q=S.P[i];p.push([Math.round(q.agents),q.cells,q.alive?1:0,q.vxCd,q.fwCd])}return p}
var hostTick=safe(function(ch,ev){if(role!=="host")return;var S=HM.S(),d=[],i;for(i=0;i<ch.length;i++)d.push(ch[i],S.own[ch[i]]);
var a=S.attacks.slice(0,512).map(function(x){return[x.by,x.fy*W+x.fx,Math.round(x.n)]});
var e=ev.filter(function(x){return EV[x.k]}).slice(0,64).map(function(x){return{k:x.k,a:x.a,b:x.b,ok:x.ok,ab:x.ab,x:x.x,y:x.y,r:x.r}});
var mm=S.missiles.slice(0,32).map(function(x){return[x.by,x.x,x.y,x.landTick]});
// a diff past the client's 12,000-pair cap ships empty and is followed by a full snapshot the same tick
var big=d.length>24000;if(big)d=[];
bcast({k:"t",tick:S.tick,d:d,p:P(),a:a,e:e,m:mm,h:hum,sd:S.sd,sdt:S.sdT});if(big||S.tick===1||S.tick%300===0)bcast(snap())});
function snap(){var S=HM.S(),s=S.snapshot(),o=s.own,r=[],i=0;while(i<o.length){var v=o[i],n=1;while(i+n<o.length&&o[i+n]===v)n++;r.push(v,n);i+=n}
return{k:"snap",tick:s.tick,own:r,winner:s.winner,sd:s.sd,sdt:s.sdT,p:P()}}
function join(cd,n,c){nm=n;col=c;load(function(){wait("joining "+cd+"…");peer=newPeer();peer.on("open",function(){connect("hivemind-r-"+cd,null)});peerErr(null)})}
function peerErr(miss){peer.on("error",function(e){if(e.type==="peer-unavailable"){if(miss)return miss();return fail("Room not found 🤷")}if(!started)fail(ERR)})}
function connect(id,busy){var c=peer.connect(id,OPT),ok=false;hc=c;role="client";
if(!peer._hmc){peer._hmc=1;peer.on("connection",function(x){if(role!=="host")try{x.close()}catch(e){}})}
var to=setTimeout(safe(function(){if(!ok){hc=null;c.close();busy?busy():fail("Room didn't answer ⏳")}}),8000);
c.on("open",safe(function(){lastRx=now();tx(c,{k:"hello",v:VER,name:nm,color:col});clearInterval(wdI);wdI=setInterval(safe(watch),1000)}));
c.on("data",safe(function(raw){if(c!==hc)return;var m=clean(parse(raw),"h2c");if(!m)return;
if(m.k==="full"||m.k==="started"){clearTimeout(to);ok=true;hc=null;c.close();return busy?busy():fail(m.k==="full"?"Room is full 🫠":"That match already started ⏩")}
if(!ok){ok=true;clearTimeout(to)}onHost(m)}));
c.on("close",function(){if(hc===c){hc=null;fail("host rage-quit 💀")}})}
var myId=0,pingI=0;
function watch(){if(role!=="client"||!hc){clearInterval(wdI);return}if(now()-lastRx>(started?10000:20000)){var c=hc;hc=null;fail("connection lost 📡 · back to menu");try{c.close()}catch(e){}}}
function onHost(m){var k=m.k;if(started?(k==="t"||k==="snap"):(k==="lobby"||k==="welcome"||k==="pong"||k==="start"))lastRx=now();
if(k==="welcome"){if(started||myId)return;if(m.v!==VER){var c=hc;hc=null;fail("update your game 🔄");try{c.close()}catch(e){}return}myId=m.id;clearInterval(pingI);pingI=setInterval(function(){tx(hc,{k:"ping",t:performance.now()})},2000)}
else if(m.k==="pong")ms=Math.round(performance.now()-m.t);
else if(m.k==="lobby"){if(!started){pub=m.pub;code=m.code;drawLobby(m.slots,false,m.at)}}
else if(m.k==="start"){if(started||!myId)return;started=true;W=m.w;H=m.h;hum=m.slots.length;lastT=0;Menu.hide();HM.startOnline({mode:"client",seed:m.seed,w:W,h:H,me:myId,slots:m.slots})}
else if(m.k==="t"){if(!started||(lastT&&m.tick<=lastT))return;if(lastT&&m.tick!==lastT+1)tx(hc,{k:"resync"});lastT=m.tick;hum=m.h;HM.applyTick(m)}
else if(m.k==="snap"){if(started&&!(lastT&&m.tick<lastT)){lastT=m.tick;HM.applySnap(m)}}
else if(m.k==="kick"){var c=hc;hc=null;fail(m.r||"you got kicked 👢");try{c.close()}catch(e){}}}
function quickFrom(i){if(i>8){leave();return host(nm,col,null,false)}
wait("finding a lobby… ("+i+"/8)");var pid="hivemind-pub-"+i,done=false;
function next(){if(done)return;done=true;if(hc){var c=hc;hc=null;try{c.close()}catch(e){}}role="";quickFrom(i+1)}
function claim(){if(done)return;done=true;hc=null;role="";var p=peer;peer=null;try{p.destroy()}catch(e){}host(nm,col,pid,true)}
function go(){peer.removeAllListeners("error");peerErr(claim);connect(pid,next)}
if(peer&&peer.open)go();else{peer=newPeer();peer.on("open",go);peer.on("error",function(e){if(!peer.open)fail(ERR)})}}
function quick(n,c){nm=n;col=c;load(function(){quickFrom(1)})}
function send(m){if(role==="client"&&hc&&m&&m.k==="i")tx(hc,m)}
function leave(){clearTimeout(timer);clearInterval(pingI);clearInterval(hbI);clearInterval(wdI);var c=hc;hc=null;if(c)try{c.close()}catch(e){}
for(var k in conns)try{conns[k].c.close()}catch(e){}conns=Object.create(null);nconn=0;slots=Object.create(null);
if(peer)try{peer.destroy()}catch(e){}peer=null;if(started&&window.HM)HM.stop();role="";started=false;autoAt=0;myId=0;ms=0;hum=1;code="";pub=0}
var STo={ms:0,h:0};function status(){STo.ms=role==="host"?0:ms;STo.h=hum;return STo}
return{warm:warm,quick:quick,host:function(n,c){host(n,c,null,false)},join:function(cd,n,c){join(cd,n,c)},send:send,hostTick:hostTick,leave:leave,status:status,online:function(){return started}}})();
