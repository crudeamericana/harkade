var Sim=(function(){
function mb(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function create(seed,W,H,n){
var R=mb(seed),N=W*H,own=new Uint8Array(N),dc=new Uint8Array(N);
var S={W:W,H:H,N:N,own:own,dc:dc,rand:R,tick:0,SPAWN:80,P:[null],attacks:[],missiles:[],GRACE:600,VXR:6,VXCOST:.15,VXMIN:40,VXCD:300,VXT:15,FWT:80,FWCD:400,OVT:6000,OVE:10800,LEADT:8400,events:[],changed:[],winner:0,land:0,dcs:[],acceptAlly:null,GROW:.008,CAP:3,ECOST:3.5,MAXATK:4,WORK:4096,work:0,TMAX:12000,TWARN:10800,timeup:false,sd:0,sdT:0,SDCD:100};
function layer(s){var gw=Math.ceil(W/s)+2,gh=Math.ceil(H/s)+2,g=new Float32Array(gw*gh);for(var i=0;i<g.length;i++)g[i]=R();
return function(x,y){var fx=x/s,fy=y/s,ix=fx|0,iy=fy|0,tx=fx-ix,ty=fy-iy;tx=tx*tx*(3-2*tx);ty=ty*ty*(3-2*ty);var k=iy*gw+ix,a=g[k],b=g[k+1],c=g[k+gw],d=g[k+gw+1];a+=(b-a)*tx;c+=(d-c)*tx;return a+(c-a)*ty}}
// noise cell sizes scale with the map width (tuned at 200), so continents keep their shape at 400×260 and 320×208
var sc=W/200,L1=layer(26*sc),L2=layer(11*sc),L3=layer(5*sc),x,y,i,DSP=Math.round(14*Math.sqrt(sc)),DS2=DSP*DSP;S.graceEnd=S.SPAWN+S.GRACE;if(W<400)S.CAP=2;// phone map has 36% less land: slower capture keeps matches 10–15 min
S.grace=function(){return S.tick>=S.SPAWN&&S.tick<S.graceEnd};
// LATE-GAME PRESSURE (OVERCLOCK): p ramps 1→2 from OVT to OVE, derived from the tick alone so clients need no new net fields
S.press=function(){var t=S.tick;return t<=S.OVT?1:t>=S.OVE?2:1+(t-S.OVT)/(S.OVE-S.OVT)};
// VIRUS cost: 15% of your agents, at least VXMIN
S.vxCost=function(p){return Math.max(S.VXMIN,Math.floor(p.agents*S.VXCOST))};
for(y=0;y<H;y++)for(x=0;x<W;x++){var v=L1(x,y)*.55+L2(x,y)*.3+L3(x,y)*.15,e=Math.max(Math.abs(x/W-.5),Math.abs(y/H-.5))*2;if(e>.8)v-=(e-.8)*2.5;i=y*W+x;if(v<.41)own[i]=255;else S.land++}
for(var t=0;t<8000&&S.dcs.length<24;t++){i=(R()*N)|0;if(own[i]===255)continue;var cx=i%W,cy=(i/W)|0,ok=true;
for(var j=0;j<S.dcs.length;j++){var q=S.dcs[j],dx=q%W-cx,dy=((q/W)|0)-cy;if(dx*dx+dy*dy<DS2){ok=false;break}}
if(ok){dc[i]=1;S.dcs.push(i)}}
for(var id=1;id<=n;id++)S.P.push({id:id,agents:0,alive:true,cells:0,dcs:0,fwUntil:0,vxCd:0,fwCd:0,allies:new Set(),snakeUntil:0,spawned:false,sx:0,sy:0,kills:0,peak:0,diedAt:0});
// BS[p]: cells owned by p with at least one 4-neighbour that is neither p nor void; kept in step with every ownership change
var BS=[];for(var b0=0;b0<=n;b0++)BS.push(new Set());
function bord(c){var o=own[c];if(!o||o===255)return;var x=c%W,q;
var b=(c>=W&&(q=own[c-W])!==o&&q!==255)||(c+W<N&&(q=own[c+W])!==o&&q!==255)||(x>0&&(q=own[c-1])!==o&&q!==255)||(x<W-1&&(q=own[c+1])!==o&&q!==255);
if(b)BS[o].add(c);else BS[o].delete(c)}
function touch(i,p){if(p&&p<255)BS[p].delete(i);var x=i%W;bord(i);if(i>=W)bord(i-W);if(i+W<N)bord(i+W);if(x>0)bord(i-1);if(x<W-1)bord(i+1)}
function setCell(i,o){var p=own[i];if(p===o)return;if(p&&p<255){S.P[p].cells--;if(dc[i])S.P[p].dcs--}own[i]=o;if(o&&o<255){S.P[o].cells++;if(dc[i])S.P[o].dcs++}touch(i,p);S.changed.push(i)}
// clients write ownership straight from the host: keep the border sets right without touching counters
S.put=function(i,o){var p=own[i];if(p===o)return;own[i]=o;touch(i,p)};
S.rebuild=function(){for(var k=0;k<BS.length;k++)BS[k].clear();for(var c=0;c<N;c++)bord(c)};
function adj(i,pid){var x=i%W;return(i>=W&&own[i-W]===pid)||(i+W<N&&own[i+W]===pid)||(x>0&&own[i-1]===pid)||(x<W-1&&own[i+1]===pid)}
S.adjacent=adj;
S.maxAgents=function(p){return Math.max(10,p.cells*10*(1+.15*p.dcs))};
function spawn(pid,x,y){if(S.tick>=S.SPAWN)return false;var p=S.P[pid];x|=0;y|=0;if(x<0||y<0||x>=W||y>=H)return false;var i=y*W+x;if(own[i]!==0)return false;
if(p.spawned){if((p.re|0)>=3)return false;p.re=(p.re|0)+1;disc(p.sx,p.sy,pid,0)}
disc(x,y,0,pid);p.spawned=true;p.sx=x;p.sy=y;p.agents=150;return true}
// before SPAWN no attacks run, so a player's land is exactly the disc around its spawn: wipe only that, not all N cells
function disc(x,y,from,to){for(var dy=-4;dy<=4;dy++)for(var dx=-4;dx<=4;dx++){if(dx*dx+dy*dy>18)continue;var X=x+dx,Y=y+dy;if(X<0||Y<0||X>=W||Y>=H)continue;var c=Y*W+X;if(own[c]===from)setCell(c,to)}}
S.spawnRandom=function(pid){for(var t=0;t<400;t++){var i=(R()*N)|0;if(own[i]===0&&spawn(pid,i%W,(i/W)|0))return true}return false};
function breakAlly(a,b){S.P[a].allies.delete(b);S.P[b].allies.delete(a)}
function attack(pid,it){if(S.tick<S.SPAWN)return false;var x=it.x|0,y=it.y|0;if(x<0||y<0||x>=W||y>=H)return false;var i=y*W+x,t=own[i],p=S.P[pid];
if(!p.alive||t===255||t===pid)return false;if(t&&!S.P[t].alive)return false;if(t&&S.tick<S.graceEnd)return false;if(!adj(i,pid))return false;
if(t&&p.allies.has(t)){breakAlly(pid,t);p.snakeUntil=S.tick+300;S.events.push({k:"snake",a:pid,b:t})}
var pct=Math.max(1,Math.min(100,it.pct||40)),send=Math.floor(p.agents*pct/100);if(send<1)return false;
var m=null,cnt=0;for(var k=0;k<S.attacks.length;k++){var a=S.attacks[k];if(a.by!==pid)continue;cnt++;if(a.t===t)m=a}
if(!m&&cnt>=S.MAXATK)return false;p.agents-=send;
if(m){m.n+=send;m.fx=x;m.fy=y;return true}
S.attacks.push({by:pid,t:t,n:send,fx:x,fy:y});return true}
// VIRUS: a missile that lands VXT ticks later; FIREWALL: OVERCHARGE (×3 growth, cap ×1.5 for FWT ticks)
function ability(pid,it){var p=S.P[pid],k=it.k;if(!p.alive||S.tick<S.SPAWN)return false;
if(k==="vx"){var vc=S.vxCost(p);if(p.vxCd>S.tick||p.agents<vc)return false;var x=it.x,y=it.y;
if(typeof x!=="number"||typeof y!=="number"||x!==(x|0)||y!==(y|0)||x<0||y<0||x>=W||y>=H||own[y*W+x]===255)return false;var to=own[y*W+x];if(to&&to!==pid&&S.tick<S.graceEnd)return false;
p.agents-=vc;p.vxCd=S.tick+S.VXCD;S.missiles.push({by:pid,x:x,y:y,landTick:S.tick+S.VXT});
S.events.push({k:"ab",a:pid,ab:k,x:x,y:y});return true}
if(k==="fw"){if(p.fwCd>S.tick)return false;p.fwUntil=S.tick+S.FWT;p.fwCd=S.tick+S.FWCD}else return false;
S.events.push({k:"ab",a:pid,ab:k});return true}
function land(m){var p=S.P[m.by];if(!p.alive)return;var r=S.VXR,r2=r*r,gr=S.tick<S.graceEnd;
for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r2)continue;var X=m.x+dx,Y=m.y+dy;if(X<0||Y<0||X>=W||Y>=H)continue;
var c=Y*W+X,o=own[c];if(o===255||o===m.by||(o&&(p.allies.has(o)||gr)))continue;var d=o?S.P[o]:null;if(d&&!d.alive)continue;
if(d)d.agents=Math.max(0,d.agents-d.agents/Math.max(1,d.cells));setCell(c,m.by);if(d&&d.cells===0)kill(o,m.by)}
S.events.push({k:"vxhit",a:m.by,x:m.x,y:m.y})}
function ally(pid,t){var p=S.P[pid],q=S.P[t];if(S.sd>1)return false;if(!q||t===pid||!q.alive||!p.alive||p.allies.has(t))return false;
if(p.allies.size>=3||q.allies.size>=3){S.events.push({k:"ally",a:pid,b:t,ok:false,r:4});return false}
var ok=S.acceptAlly?S.acceptAlly(t,pid):true;if(typeof ok==="string"){if(ok)S.events.push({k:"offer",a:pid,b:t});return false}if(ok){p.allies.add(t);q.allies.add(pid)}S.events.push({k:"ally",a:pid,b:t,ok:ok});return ok}
// DONATE: 20% of your agents to an ally, once per 10 s
function donate(pid,it){var p=S.P[pid],t=it.target,q=S.P[t];if(S.sd>1||!q||!p||!p.alive||!q.alive||!p.allies.has(t)||it.pct!==20||(p.donCd|0)>S.tick)return false;
var n=Math.floor(p.agents*.2);if(n<1)return false;p.agents-=n;q.agents+=n;p.donCd=S.tick+100;S.events.push({k:"donate",a:pid,b:t});return true}
// JOINT ATTACK: an ally already attacking the same swarm makes each cell 20% cheaper for you
function joint(a){var p=S.P[a.by];for(var k=0;k<S.attacks.length;k++){var b=S.attacks[k];if(b.t===a.t&&b.by!==a.by&&b.n>0&&p.allies.has(b.by))return true}return false}
S.apply=function(pid,it){switch(it.type){
case"spawn":return spawn(pid,it.x,it.y);
case"attack":return attack(pid,it);
case"ability":return ability(pid,it);
case"ally":return ally(pid,it.target);
case"donate":return donate(pid,it);
case"unally":if(S.P[pid].allies.has(it.target)){breakAlly(pid,it.target);S.events.push({k:"unally",a:pid,b:it.target});return true}return false}
return false};
function kill(v,k){var p=S.P[v];p.alive=false;p.diedAt=S.tick;p.agents=0;S.P[k].kills++;p.allies.forEach(function(o){S.P[o].allies.delete(v)});p.allies.clear();S.events.push({k:"kill",a:k,b:v})}
// per attack, walk only the attacker's border cells to find target cells next to it; sorted, so buckets match a full ascending scan
var AI=new Int16Array(17*17),CB=[],ST=new Int32Array(N),stamp=0,CI=[];
function cand(j,t){if(own[j]===t&&ST[j]!==stamp){ST[j]=stamp;CI.push(j)}}
function frontier(A){AI.fill(-1);for(var k=0;k<A.length;k++){AI[A[k].by*17+A[k].t]=k;var B=CB[k]||(CB[k]=[[],[],[],[],[]]);for(var b=1;b<5;b++)B[b].length=0}
for(k=0;k<A.length;k++){var p=A[k].by,t=A[k].t;if(AI[p*17+t]!==k||!BS[p]||!BS[p].size)continue;
if(++stamp>2e9){ST.fill(0);stamp=1}CI.length=0;
for(var i of BS[p]){var x=i%W;if(i>=W)cand(i-W,t);if(i+W<N)cand(i+W,t);if(x>0)cand(i-1,t);if(x<W-1)cand(i+1,t)}
if(!CI.length)continue;CI.sort(function(a,b){return a-b});var Bk=CB[k];
for(var n=0;n<CI.length;n++){i=CI[n];x=i%W;var c=(i>=W&&own[i-W]===p)+(i+W<N&&own[i+W]===p)+(x>0&&own[i-1]===p)+(x<W-1&&own[i+1]===p);Bk[c].push(i)}}}
function resolve(a,bk){var p=S.P[a.by],t=a.t;if(!p.alive){a.n=0;return}if(t&&!S.P[t].alive){p.agents+=a.n;a.n=0;return}
var taken=0,d=t?S.P[t]:null,base=d?1+S.ECOST*d.agents/Math.max(1,d.cells):1,pr=S.press(),cost=base*(d&&joint(a)?.8:1)/pr,CAP=Math.round(S.CAP*pr*pr);// the front also moves faster under pressure, up to 4× cells per tick
for(var b=4;b>0&&taken<CAP;b--){var L=bk[b];while(L.length&&taken<CAP){if(a.n<cost){p.agents+=a.n;a.n=0;return}if(S.work++>S.WORK)break;
var r=(R()*L.length)|0,ci=L[r];L[r]=L[L.length-1];L.pop();if(own[ci]!==t||!adj(ci,a.by))continue;a.n-=cost;
if(d)d.agents=Math.max(0,d.agents-(base-1));setCell(ci,a.by);a.fx=ci%W;a.fy=(ci/W)|0;taken++;
if(d&&d.cells===0){kill(t,a.by);p.agents+=a.n;a.n=0;return}}}
if(!taken){p.agents+=a.n;a.n=0}}
S.step=function(){S.tick++;var P=S.P,k,p;
if(S.tick===S.SPAWN)for(k=1;k<P.length;k++){if(!P[k].spawned)S.spawnRandom(k);
// failed to spawn: out at once, no kill credit, no feed line
if(!P[k].spawned||P[k].cells===0){P[k].alive=false;P[k].diedAt=S.tick;P[k].agents=0}}
if(S.tick<S.SPAWN||S.winner)return;
var gm=1+(S.press()-1)*.5;for(k=1;k<P.length;k++){p=P[k];if(!p.alive)continue;
if(p.spawned&&p.cells===0){p.alive=false;p.diedAt=S.tick;S.events.push({k:"kill",a:0,b:k});continue}
var oc=p.fwUntil>S.tick,m=S.maxAgents(p)*(oc?1.5:1);if(p.agents<m)p.agents=Math.min(m,p.agents+Math.max(.15,p.agents*S.GROW*(1-p.agents/m))*(oc?3:1)*gm);else p.agents-=(p.agents-m)*.02;
if(p.agents>p.peak)p.peak=p.agents}
if(S.missiles.length){var ML=S.missiles;S.missiles=[];for(k=0;k<ML.length;k++){if(ML[k].landTick<=S.tick)land(ML[k]);else S.missiles.push(ML[k])}}
var A=S.attacks,i,j;
for(i=0;i<A.length;i++)for(j=i+1;j<A.length;j++){var a=A[i],b=A[j];if(a.by===b.t&&a.t===b.by&&a.n>0&&b.n>0){var c=Math.min(a.n,b.n);a.n-=c;b.n-=c}}
if(A.length>16*S.MAXATK)A.length=16*S.MAXATK;frontier(A);S.work=0;
for(i=0;i<A.length;i++)if(A[i].n>0)resolve(A[i],CB[i]);
for(i=0,j=0;i<A.length;i++)if(A[i].n>0)A[j++]=A[i];A.length=j;S.attacks=A;
var alive=0,last=0;for(k=1;k<P.length;k++){p=P[k];if(!p.alive)continue;alive++;last=k;if(p.cells>=S.land*.8&&!S.winner)S.winner=k}
if(!S.winner&&alive<=1)S.winner=last||-1;
// FINAL SHOWDOWN: only when one connected bloc holds every alive swarm → 10 s countdown (sd 1), then every alliance dissolves for good (sd 2)
if(!S.winner&&!S.sd&&alive>1){for(k=1;k<P.length;k++){if(!P[k].alive)continue;if(P[k].allies.size&&S.blocOf(k).length===alive){S.sd=1;S.sdT=S.tick}break}}
// no snake tag, no opinion hit: the alliances simply end
if(!S.winner&&S.sd===1&&S.tick>=S.sdT+S.SDCD){S.sd=2;S.sdT=S.tick;for(k=1;k<P.length;k++)P[k].allies.clear()}
// TIME'S UP: the biggest single swarm wins
if(!S.winner&&S.tick>=S.TMAX){var big=0;for(k=1;k<P.length;k++)if(P[k].alive&&(!big||P[k].cells>P[big].cells))big=k;
S.timeup=true;S.winner=big||-1}
if(S.winner)S.events.push({k:"win",a:S.winner})};
// every alive swarm reachable from k through alliances, k first
S.blocOf=function(k){var P=S.P,out=[k],seen={};seen[k]=1;for(var n=0;n<out.length;n++)P[out[n]].allies.forEach(function(o){if(!seen[o]&&P[o]&&P[o].alive){seen[o]=1;out.push(o)}});return out};
S.diff=function(){var c=S.changed;S.changed=[];return c};
S.snapshot=function(){return{tick:S.tick,own:own.slice(),winner:S.winner,sd:S.sd,sdT:S.sdT,players:S.P.slice(1).map(function(p){return{id:p.id,agents:p.agents,cells:p.cells,alive:p.alive}})}};
// same result as a full scan (edge count per neighbour owner, one random edge cell each), but only over pid's border cells
function nbE(m,pid,j){var o=own[j];if(o===pid||o===255)return;var r=m[o]||(m[o]={c:0,x:0,y:0});r.c++;if(R()*r.c<1){r.x=j%W;r.y=(j/W)|0}}
S.neighbors=function(pid){var m={},B=BS[pid];if(!B)return m;for(var i of B){var x=i%W;
if(i>=W)nbE(m,pid,i-W);if(i+W<N)nbE(m,pid,i+W);if(x>0)nbE(m,pid,i-1);if(x<W-1)nbE(m,pid,i+1)}
return m};
return S}
return{create:create,rng:mb}})();
