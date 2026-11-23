var Menu=(function(){"use strict";
var COLS=["#3cf0ff","#ff3b6b","#ffb020","#9d5cff","#3dff8a","#ff5cf0","#ffe14d","#4d8bff"];
var A=["Feral","Quantum","Sleepy","Based","Unhinged","Turbo","Cursed","Tiny","Mega","Lowkey"],B=["Toaster","Swarm","Goblin","Gremlin","Neuron","Wizard","Raccoon","Blob","Daemon"];
function rnd(a){return a[Math.random()*a.length|0]}
function cleanName(s){s=String(s==null?"":s).replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,"").replace(/\s+/g," ").trim();return Array.from(s).slice(0,16).join("")}
var st=document.createElement("style");st.textContent=
"#mn{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;overflow:auto;padding:16px;background:radial-gradient(ellipse at 50% 30%,rgba(60,240,255,.12),rgba(7,9,15,.6) 70%);font:500 13px/1.35 Geist,system-ui,sans-serif;color:#e8ecf5}"+
"#mn .c{position:relative;width:100%;max-width:380px;padding:22px 20px;text-align:center;background:rgba(14,18,30,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.1);border-radius:18px;margin:auto}"+
"#mn h1{margin:4px 0 2px;font-size:44px;letter-spacing:.06em;font-weight:600;color:#fff;text-shadow:0 0 12px #3cf0ff,0 0 28px rgba(60,240,255,.6);animation:mnG 2.4s ease-in-out infinite}"+
"@keyframes mnG{50%{text-shadow:0 0 18px #ff5cf0,0 0 38px rgba(255,92,240,.55)}}@keyframes mnH{to{filter:hue-rotate(360deg)}}#mn h1{animation:mnG 2.4s ease-in-out infinite,mnH 14s linear infinite}@media(prefers-reduced-motion:reduce){#mn h1{animation:none}}"+
"#mnbg{position:fixed;inset:0;width:100%;height:100%;z-index:49;display:none;pointer-events:none}#mn .sb{color:#ffd84d;opacity:1}"+
"#mn .t{margin:0 0 16px;opacity:.75;font-size:12px}"+
"#mn input{box-sizing:border-box;width:100%;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#0d111c;color:#e8ecf5;font:600 15px Geist,system-ui,sans-serif;text-align:center}"+
"#mn .sw{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:10px 0 14px}"+
"#mn .sw button{width:44px;height:44px;min-width:44px;min-height:44px;padding:0;border-radius:50%;border:2px solid transparent;cursor:pointer}"+
"#mn .sw button.on{border-color:#fff;box-shadow:0 0 10px currentColor}"+
"#mn .b{display:block;width:100%;min-height:44px;margin:6px 0;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#161c2b;color:#e8ecf5;font:600 14px Geist,system-ui,sans-serif;cursor:pointer}"+
"#mn .b.p{background:#e8ecf5;color:#07090f}#mn .b:disabled{opacity:.5;cursor:default}"+
"#mn .r{display:flex;gap:6px}#mn .r input{flex:1;text-transform:uppercase;letter-spacing:.2em}#mn .r .b{flex:1}"+
"#mn .q{position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:#161c2b;color:#e8ecf5;font:600 16px Geist,system-ui,sans-serif;cursor:pointer}"+
"#mn .e{color:#ff6b8b;min-height:18px;margin:8px 0 0}"+
"#mn .h{display:grid;gap:8px;text-align:left;margin:10px 0}#mn .h div{padding:10px 12px;border-radius:12px;background:#161c2b}#mn .h b{display:block;margin-bottom:2px}"+
"#mn ul{list-style:none;margin:10px 0;padding:0;text-align:left}#mn li{display:flex;align-items:center;gap:8px;min-height:44px;border-bottom:1px solid rgba(255,255,255,.08)}#mn li i{width:12px;height:12px;border-radius:50%;flex:none}#mn li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#mn li button{min-width:44px;min-height:44px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:#161c2b;color:#e8ecf5;cursor:pointer}";
document.head.appendChild(st);
var root=document.createElement("div");root.id="mn";root.setAttribute("role","dialog");document.body.appendChild(root);
var bg=document.createElement("canvas"),bx=bg.getContext("2d"),bp=[],bRun=false,RMm=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches);bg.id="mnbg";document.body.appendChild(bg);
for(var q=0;q<90;q++)bp.push({x:Math.random(),y:Math.random(),vx:0,vy:0,c:COLS[q%8],g:q%8});
function bLoop(t){if(root.style.display!=="flex"){bRun=false;bg.style.display="none";return}requestAnimationFrame(bLoop);
var w=innerWidth,h=innerHeight;if(bg.width!==w||bg.height!==h){bg.width=w;bg.height=h}bx.fillStyle="rgba(7,9,15,.22)";bx.fillRect(0,0,w,h);
for(var k=0;k<bp.length;k++){var p=bp[k],a=t/4000+p.g*.785,tx=.5+.32*Math.cos(a*(1+p.g%3*.3)),ty=.5+.3*Math.sin(a*1.3);
p.vx=p.vx*.96+(tx-p.x)*.0004+(Math.random()-.5)*.0006;p.vy=p.vy*.96+(ty-p.y)*.0004+(Math.random()-.5)*.0006;p.x+=p.vx;p.y+=p.vy;
bx.fillStyle=p.c;bx.fillRect(p.x*w-2,p.y*h-2,4,4)}}
function bStart(){if(bRun||RMm)return;bRun=true;bg.style.display="block";requestAnimationFrame(bLoop)}
var seen=false;function gate(fn){if(seen)return fn();seen=true;help(fn)}
var LS={};try{LS=JSON.parse(localStorage.getItem("hm")||"{}")||{}}catch(e){}
var name=cleanName(LS.n)||rnd(A)+" "+rnd(B),color=COLS.indexOf(LS.c)>=0?LS.c:COLS[0];
function el(t,c,txt,p){var e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;if(p)p.appendChild(e);return e}
function save(){try{localStorage.setItem("hm",JSON.stringify({n:name,c:color}))}catch(e){}}
function panel(){var sk=document.getElementById("sk");if(sk)sk.remove();root.textContent="";root.style.display="flex";bStart();return el("div","c",null,root)}
function btn(p,t,cls,fn){var b=el("button","b"+(cls?" "+cls:""),t,p);b.type="button";b.addEventListener("click",fn);return b}
function daily(){var d=new Date();return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate()}
var errMsg="",nextSeed=(Math.random()*4294967296)>>>0,idleQ=false;
// net.js loads with the page (defer); just report whether it is there
function loadNet(cb){if(cb)cb(!!window.Net)}
function warm(){loadNet(function(k){if(k&&Net.warm)Net.warm()})}
function pw(b){b.addEventListener("pointerenter",warm,{once:true});b.addEventListener("touchstart",warm,{once:true,passive:true});b.addEventListener("focus",warm,{once:true})}
// while the menu idles, build the next bot match's map and first frame
function idle(){if(idleQ||!window.HM||!HM.prebuild)return;idleQ=true;var f=window.requestIdleCallback||function(cb){return setTimeout(cb,200)};
f(function(){idleQ=false;if(root.style.display==="flex")HM.prebuild(nextSeed)})}
function show(msg){errMsg=msg||"";var c=panel();idle();
var q=el("button","q","?",c);q.type="button";q.setAttribute("aria-label","How to play");q.addEventListener("click",help);
el("h1",null,"HIVEMIND",c);el("p","t","spawn your swarm. eat the map. touch grass never.",c);if(window.FX&&FX.best())el("p","t sb","🏅 "+FX.best(),c);
var inp=el("input",null,null,c);inp.maxLength=32;inp.value=name;inp.setAttribute("aria-label","Your name");inp.autocomplete="off";
inp.addEventListener("input",function(){name=cleanName(inp.value);save()});
var sw=el("div","sw",null,c);COLS.forEach(function(h){var b=el("button",h===color?"on":"",null,sw);b.type="button";b.style.background=h;b.style.color=h;b.setAttribute("aria-label","Color "+h);
b.addEventListener("click",function(){color=h;save();Array.prototype.forEach.call(sw.children,function(x){x.className=""});b.className="on"})});
var er=el("p","e",errMsg,c);
function ok(){name=cleanName(inp.value);if(!name){er.textContent="Pick a name (1–16 chars).";inp.focus();return false}save();return true}
function net(fn,msg){if(!ok())return;gate(function(){if(window.FX&&FX.unlock)FX.unlock();loadNet(function(k){if(!k)return show("Online mode didn't load 😵");
var w=panel();el("h1",null,"HIVEMIND",w);el("p","t",msg,w);btn(w,"CANCEL","",function(){if(Net.leave)Net.leave();show()});fn()})})}
btn(c,"PLAY VS BOTS","p",function(){if(!ok())return;gate(function(){var sd=nextSeed;nextSeed=(Math.random()*4294967296)>>>0;hide();HM.startSolo(sd,name,color)})});
btn(c,"DAILY MAP · "+daily(),"",function(){if(!ok())return;gate(function(){hide();HM.startSolo(daily(),name,color)})});
pw(btn(c,"QUICK MATCH 🌐","",function(){net(function(){Net.quick(name,color)},"finding a lobby…")}));
pw(btn(c,"CREATE ROOM","",function(){net(function(){Net.host(name,color)},"creating room…")}));
var r=el("div","r",null,c),ci=el("input",null,null,r);ci.maxLength=4;ci.placeholder="CODE";ci.setAttribute("aria-label","Room code");ci.autocomplete="off";
ci.addEventListener("input",function(){ci.value=ci.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,"").slice(0,4)});
btn(r,"JOIN ROOM","",function(){var code=ci.value;if(!/^[A-HJ-NP-Z2-9]{4}$/.test(code)){er.textContent="Room codes are 4 characters.";ci.focus();return}net(function(){Net.join(code,name,color)},"joining "+code+"…")});pw(r.lastChild);
}
function help(cb){if(typeof cb!=="function")cb=null;var c=panel();el("h1",null,cb?"FIRST TIME? 👀":"HOW TO",c);var h=el("div","h",null,c);
[["1 · Spawn","Tap an empty spot in the first 8 seconds to drop your swarm."],
["2 · Expand","Tap next to your land to send agents. 1–4 sets how many. Yellow datacenters boost your cap."],
["3 · Scheme","Tap a rival to ally 🤝 or betray 🐍. Q aims a VIRUS 🦠 missile anywhere, E FIREWALL 🛡️ overcharges your growth ⚡. The first 60s are a 🕊️ grace period: expand and build up, no attacks on swarms. Own half the map to win."]]
.forEach(function(x){var d=el("div",null,null,h);el("b",null,x[0],d);el("span",null,x[1],d)});
btn(c,cb?"LET'S GO 🐝":"GOT IT","p",function(){if(cb){seen=true;cb()}else show(errMsg)})}
function hide(){root.style.display="none";root.textContent=""}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){show()});else show();
return{show:show,hide:hide,panel:panel,el:el,btn:btn,err:function(m){show(m)},cleanName:cleanName,visible:function(){return root.style.display==="flex"}}})();
