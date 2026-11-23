var Bots=(function(){
var NAMES=["GPTeen","Clanker Co","Hallucinate Labs","VibeCoder9000","Skynet Jr","PromptGoblin","Token Burner","AGI Next Week","Mid Model","Rate Limited","404 Brain","Sigma Swarm","Overfit","Lowkey Sentient","Ctrl+Z"];
var COLORS=["#ff3b6b","#ffb020","#9d5cff","#3dff8a","#ff5cf0","#ff7a2f","#ffe14d","#4d8bff","#b6ff2e","#ff4d4d","#c77dff","#ff9ecb","#00d68f","#f5a3ff","#ffcf8a"];
var PERS=["aggressive","turtle","opportunist"];
var NEED={aggressive:1.15,opportunist:1.6,turtle:2.5},VXP={aggressive:.5,opportunist:.2,turtle:.05};
var list=[];
function init(S){list=[];
for(var i=0;i<15;i++)list.push({id:i+2,name:NAMES[i],color:COLORS[i],pers:PERS[(i*7+(S.rand()*3|0))%3],at:3+(S.rand()*45|0),next:S.rand()*10|0});
if(typeof Diplo!=="undefined")Diplo.init(S,list);else S.acceptAlly=function(t,f){if(t===1)return false;var a=S.P[t],b=S.P[f];return a.agents<b.agents&&b.snakeUntil<=S.tick&&S.rand()<.85}}
function spawn(S,b){var best=-1,bd=-1;
for(var t=0;t<40;t++){var i=(S.rand()*S.N)|0;if(S.own[i]!==0)continue;var x=i%S.W,y=(i/S.W)|0,md=1e9;
for(var k=1;k<S.P.length;k++){var q=S.P[k];if(!q.spawned||k===b.id)continue;var d=(q.sx-x)*(q.sx-x)+(q.sy-y)*(q.sy-y);if(d<md)md=d}
if(md>bd){bd=md;best=i}}
if(best>=0)S.apply(b.id,{type:"spawn",x:best%S.W,y:(best/S.W)|0})}
// multi-source BFS from all of pid's cells over land and water: the closest cell of an alive non-ally enemy, -1 if none
var BQ=null,BV=null;
function nearest(S,pid){var N=S.N,W=S.W,own=S.own,p=S.P[pid],h=0,t=0,i,o;if(!BQ||BQ.length!==N){BQ=new Int32Array(N);BV=new Uint8Array(N)}else BV.fill(0);
for(i=0;i<N;i++)if(own[i]===pid){BV[i]=1;BQ[t++]=i}
while(h<t){i=BQ[h++];o=own[i];if(o&&o!==255&&o!==pid&&!p.allies.has(o)&&S.P[o].alive)return i;var x=i%W;
if(i>=W&&!BV[i-W]){BV[i-W]=1;BQ[t++]=i-W}if(i+W<N&&!BV[i+W]){BV[i+W]=1;BQ[t++]=i+W}if(x>0&&!BV[i-1]){BV[i-1]=1;BQ[t++]=i-1}if(x<W-1&&!BV[i+1]){BV[i+1]=1;BQ[t++]=i+1}}
return -1}
function think(S,b){var p=S.P[b.id];if(!p.alive)return;
if(S.tick<S.SPAWN){if(!p.spawned&&S.tick>=b.at)spawn(S,b);return}
var max=S.maxAgents(p),mine=0,hit=0;
for(var i=0;i<S.attacks.length;i++){var a=S.attacks[i];if(a.by===b.id)mine++;if(a.t===b.id&&a.n>p.agents*.2)hit++}
// overcharge early, while well below the cap
if(p.fwCd<=S.tick&&p.agents<max*.4&&S.rand()<(b.pers==="turtle"?.6:.35))S.apply(b.id,{type:"ability",k:"fw"});
var nb=S.neighbors(b.id),gr=S.tick<S.graceEnd;
// grace period: only expand into neutral land (overcharge above still runs)
if(gr){if(mine<2&&nb[0]&&p.agents>max*.15)S.apply(b.id,{type:"attack",x:nb[0].x,y:nb[0].y,pct:40});return}
// virus the densest non-allied neighbour
if(p.vxCd<=S.tick&&p.agents>400&&S.rand()<VXP[b.pers]*S.press()){var vt=0,vd=-1;for(var q in nb){q=+q;if(!q)continue;var E=S.P[q];if(!E.alive||p.allies.has(q))continue;var dn=E.agents/Math.max(1,E.cells);if(dn>vd){vd=dn;vt=q}}
if(vt)S.apply(b.id,{type:"ability",k:"vx",x:nb[vt].x,y:nb[vt].y})}
// marooned: no land neighbour but allies, so virus across the water at the nearest non-ally enemy for a beachhead
var lone=true;for(var q2 in nb){if(!p.allies.has(+q2)){lone=false;break}}
if(lone&&p.vxCd<=S.tick&&p.agents>=S.vxCost(p)){var tc=nearest(S,b.id);if(tc>=0)S.apply(b.id,{type:"ability",k:"vx",x:tc%S.W,y:(tc/S.W)|0})}
if(mine>=2)return;
var r=p.agents/max,early=S.tick<S.graceEnd+600,best=0,bv=Infinity,pr=S.press(),ld=0;
// OVERCLOCK: from LEADT every bot gangs up on the leader (most cells) when it borders them
if(S.tick>=S.LEADT)for(var l=1;l<S.P.length;l++)if(S.P[l].alive&&(!ld||S.P[l].cells>S.P[ld].cells))ld=l;
for(var k in nb){k=+k;if(!k)continue;var e=S.P[k];if(!e.alive||p.allies.has(k))continue;
var v=e.agents;if(b.pers==="opportunist")for(var j=0;j<S.attacks.length;j++)if(S.attacks[j].t===k)v*=.7;
if(k===ld)v*=.25;if(v<bv){bv=v;best=k}}
if(best===ld)bv/=.25;
// more pressure: attack with less of an edge, from a lower fill, and send more
var need=1+(NEED[b.pers]-1)/pr,rq=(b.pers==="turtle"?.75:.45)/pr;
var ok=best&&((p.agents>bv*need/pr&&r>rq)||(r>.97/pr&&p.agents>bv*1.05/pr)||(best===ld&&pr>1.5&&r>rq));
var pct=Math.min(80,Math.round((b.pers==="aggressive"?50:b.pers==="turtle"?30:40)*pr));
function go(t,pc){var c=nb[t];S.apply(b.id,{type:"attack",x:c.x,y:c.y,pct:pc})}
if(ok&&!(early&&nb[0]&&b.pers!=="aggressive")){go(best,pct);return}
if(nb[0]&&r>(early?.2:.5)){go(0,early?35:25);return}
if(ok){go(best,pct);return}
if(typeof Diplo==="undefined"&&S.sd<2&&S.rand()<.03){for(k in nb){k=+k;if(k>1&&!p.allies.has(k)&&S.P[k].agents>p.agents&&S.P[k].alive){S.apply(b.id,{type:"ally",target:k});break}}}}
function tick(S){for(var i=0;i<list.length;i++){var b=list[i];if(S.tick>=b.next){b.next=S.tick+Bots.WAIT+(S.rand()*Bots.WAIT|0);think(S,b);if(typeof Diplo!=="undefined")Diplo.think(S,b)}}}
return{WAIT:25,init:init,tick:tick,think:think,NAMES:NAMES,COLORS:COLORS,list:function(){return list}}})();
