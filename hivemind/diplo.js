// DIPLOMACY: per-bot opinion of every swarm (-100..100) plus a decaying grudge; drives accepts, bot proposals and betrayals. Deterministic: S.rand only.
var Diplo=(function(){
var BASE={turtle:15,opportunist:0,aggressive:-10},SNK={aggressive:.35,opportunist:.15,turtle:.05};
var PROP=["lowkey we should team up 🤝","no cap, ally with me? 🤝","you + me = unstoppable fr 🤝","bestie alliance? 👉👈","teamwork era? it's giving 🤝"];
var LINES=[["nah you're sus","keep the peace on their border"],["you're literally eating my land","stop attacking them"],["nah you're sus 🐍","wait out your 🐍 tag"],["we're both top 3, no shot","help vs their rival"],["squad's full fr","they already have 3 allies"],["almost… ask again later","help vs their rival"],["nah you're sus","help vs their rival"]];
var YES="bet, we ride 🤝";
var S=null,O,G,H,PD,CD,PC,LOS,NBC,NBT,BOT=[],ST,why=0,TT=[],TTt=-1;
function ix(a,b){return a*17+b}
function cl(v){return v<-100?-100:v>100?100:v}
function add(a,b,d){var k=ix(a,b);O[k]=cl(O[k]+d)}
function eff(a,b){var k=ix(a,b);return O[k]+G[k]}
function bot(id){for(var i=0;i<BOT.length;i++)if(BOT[i].id===id)return BOT[i];return null}
function nbOf(k){if(S.tick-NBT[k]>20){NBC[k]=S.neighbors(k);NBT[k]=S.tick}return NBC[k]}
function top3(){if(TTt===S.tick)return TT;TTt=S.tick;var a=[];for(var k=1;k<17;k++)if(S.P[k]&&S.P[k].alive)a.push(k);
a.sort(function(x,y){return S.P[y].cells-S.P[x].cells||x-y});TT=a.slice(0,3);return TT}
function rivals(a,b){var T=top3();return T.indexOf(a)>=0&&T.indexOf(b)>=0}
// biggest threat: whoever hit t most recently (30 s), else its largest non-allied neighbour that out-sizes it
function threat(t){var p=S.P[t],best=0,bt=-1e9,e;for(e=1;e<17;e++){if(e===t||!S.P[e].alive||p.allies.has(e))continue;var h=H[ix(t,e)];if(S.tick-h<300&&h>bt){bt=h;best=e}}
if(best)return best;var nb=nbOf(t),bc=p.cells;for(e in nb){e=+e;if(e&&!p.allies.has(e)&&S.P[e].alive&&S.P[e].cells>bc){bc=S.P[e].cells;best=e}}return best}
function hit(v,a){var k=ix(v,a);if(S.tick-H[k]>100)add(v,a,-15);G[k]=-40;H[k]=S.tick}
function init(s,list){S=s;BOT=list||[];O=new Float32Array(289);G=new Float32Array(289);H=new Int32Array(289).fill(-1e6);PD=new Int32Array(289);
CD=new Int32Array(17);PC=new Int32Array(17);LOS=new Uint8Array(17);NBC=[];NBT=new Int32Array(17).fill(-1e6);TTt=-1;ST={allies:0,betrayals:0,offers:0,proposals:0};
for(var a=1;a<17;a++){var b=bot(a),o=10+(b?BASE[b.pers]||0:0);for(var c=1;c<17;c++)O[ix(a,c)]=o}
s.acceptAlly=accept;var ap=s.apply;
s.apply=function(pid,it){var t=-1;why=0;
if(it&&(it.type==="attack"||(it.type==="ability"&&it.k==="vx"))&&it.x>=0&&it.y>=0&&it.x<S.W&&it.y<S.H)t=S.own[(it.y|0)*S.W+(it.x|0)];
var r=ap(pid,it);if(!it)return r;
if(r&&t>0&&t<17&&t!==pid)hit(t,pid);
if(it.type==="ally"){if(r)ST.allies++;for(var i=S.events.length-1;i>=0;i--){var e=S.events[i];if(e.k==="ally"&&e.a===pid&&e.b===it.target){if(e.r==null)e.r=why;break}}}
if(r&&it.type==="donate")add(it.target,pid,15);
return r}}
// t (a bot) decides on f's request
function accept(t,f){why=0;if(!bot(t)||!S.P[f]||S.sd>1)return false;var p=S.P[t],q=S.P[f],K=ix(t,f);
if(PD[K]&&PD[K]>=S.tick){PD[K]=0;return true}
if(p.allies.size>=3||q.allies.size>=3){why=4;return false}
var v=O[K]+G[K],bon=LOS[t]?20:0,th=threat(t);if(th&&th!==f&&nbOf(f)[th])bon+=15;
if(v+bon>=25)return true;
why=S.tick-H[K]<300||G[K]<-10?1:q.snakeUntil>S.tick?2:rivals(t,f)?3:v+bon>=12?5:th&&th!==f?6:0;return false}
function betray(b,k){var id=b.id,p=S.P[id],nb=S.neighbors(id),ok=false;
if(nb[k]&&S.tick>=S.graceEnd)ok=S.apply(id,{type:"attack",x:nb[k].x,y:nb[k].y,pct:b.pers==="aggressive"?50:40});
if(p.allies.has(k)){S.apply(id,{type:"unally",target:k});p.snakeUntil=S.tick+300;S.events.push({k:"snake",a:id,b:k})}
ST.betrayals++;add(k,id,-60);G[ix(k,id)]=-40;H[ix(k,id)]=S.tick}
function think(s,b){if(s!==S||!S)return;var id=b.id,p=S.P[id];if(!p||!p.alive||S.tick<S.SPAWN)return;
var now=S.tick,dt=Math.min(100,now-(b.dl||now))/10,k,e,K,q;b.dl=now;
LOS[id]=p.cells<PC[id]?1:0;PC[id]=p.cells;
// offers to humans that ran out count as a soft no
for(k=1;k<17;k++){K=ix(id,k);if(PD[K]&&(PD[K]<now||S.sd>1)){PD[K]=0;if(S.sd<2)add(id,k,-5)}}
var nb=nbOf(id),meTop=top3().indexOf(id)>=0,bestK=0,bestV=-1e9;
for(k=1;k<17;k++){if(k===id)continue;q=S.P[k];if(!q||!q.alive)continue;K=ix(id,k);var bd=!!nb[k],nk=null,sh=false;
for(e=1;e<17;e++){if(e===id||e===k)continue;var E=S.P[e];if(!E.alive)continue;
if(now-H[ix(id,e)]<300&&now-H[ix(k,e)]<300){sh=true;break}
if(nb[e]&&E.cells>p.cells*1.2&&!p.allies.has(e)&&!q.allies.has(e)){nk=nk||nbOf(k);if(nk[e]){sh=true;break}}}
var d=0;if(sh)d+=.8;
if(bd&&now-H[K]>100&&now-H[ix(k,id)]>100)d+=.15;
if(q.cells>=2*p.cells&&q.cells>S.land*.06)d+=1;
if(q.snakeUntil>now)d-=3;
if(meTop&&top3().indexOf(k)>=0)d-=1.2;
// a tiny ally you could swallow slowly starts to look like lunch
if(p.allies.has(k)&&p.cells>=4*q.cells)d-=b.pers==="aggressive"?1:.5;
// late game: the network is filling up and every alliance gets stale
if(p.allies.has(k)&&now>6000)d-=.6;
O[K]=cl(O[K]+d*dt);if(G[K]<0)G[K]=Math.min(0,G[K]+.25*dt);
var v=O[K]+G[K];if(!p.allies.has(k)&&(bd||sh)&&v>=30&&q.allies.size<3&&!PD[K]&&v>bestV){bestV=v;bestK=k}}
// betrayal: opinion went negative, or 3× bigger with nothing left to eat but allies
var A=Array.from(p.allies);for(var j=0;j<A.length;j++){k=A[j];q=S.P[k];var only=true,any=false;
for(var n in nb){n=+n;if(!n)continue;any=true;if(!p.allies.has(n)){only=false;break}}
var full=p.agents>=S.maxAgents(p)*.97&&now>S.graceEnd+1200;// boxed in by allies with a maxed-out swarm: restless
if(eff(id,k)<0||(any&&only&&(p.cells>=3*q.cells||full)&&S.rand()<SNK[b.pers])){betray(b,k);return}}
if(bestK&&S.sd<2&&CD[id]<=now&&p.allies.size<3&&S.rand()<.5){CD[id]=now+450;ST.proposals++;
if(bot(bestK))S.apply(id,{type:"ally",target:bestK});else{PD[ix(id,bestK)]=now+100;ST.offers++;S.events.push({k:"offer",a:id,b:bestK})}}}
function nah(a,h){if(!S||S.sd>1)return;var K=ix(a,h);if(PD[K]){PD[K]=0;add(a,h,-5)}}
function line(a,t){return PROP[(a*7+(t|0))%PROP.length]}
function reply(r){return LINES[r>=0&&r<LINES.length?r:0]}
return{init:init,think:think,nah:nah,line:line,reply:reply,YES:YES,
op:function(a,b){return eff(a,b)},stats:function(){return ST},accept:accept}})();
