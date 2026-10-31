import express from "express";import http from "http";import {Server} from "socket.io";import path from "path";import {fileURLToPath} from "url";import crypto from "crypto";
const dir=path.dirname(fileURLToPath(import.meta.url)),app=express(),server=http.createServer(app),io=new Server(server);app.use(express.static(path.join(dir,"public")));app.get("/health",(_,r)=>r.json({ok:true}));
const W=1000,H=650,rooms=new Map(),weapons={pulse:{damage:18,cd:280,speed:10,color:"#62e8ff"},scatter:{damage:7,cd:720,speed:7.5,color:"#ffd166"},rail:{damage:36,cd:1050,speed:15,color:"#b49aff"}};
const FALLBACK_MISSIONS=[
 {title:"ENERGY RUSH",text:"Collect energy orbs for extra bonus points.",type:"orbs"},
 {title:"COMBAT RUN",text:"Tag opponents to earn extra elimination points.",type:"combat"},
 {title:"HOT ZONE",text:"Stay inside the safe ring to earn survival points.",type:"survive"},
 {title:"POWER PLAY",text:"Collect a power-up to earn a score bonus.",type:"powerup"}
];
const VALID_MISSION_TYPES=new Set(["orbs","combat","survive","powerup"]);
function fallbackMission(){return {...FALLBACK_MISSIONS[Math.floor(Math.random()*FALLBACK_MISSIONS.length)]};}
async function generateMission(){
 const key=process.env.OPENAI_API_KEY;
 if(!key) return {mission:fallbackMission(),source:"Local fallback"};
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",signal:controller.signal,
   headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
   body:JSON.stringify({
    model:process.env.OPENAI_MODEL||"gpt-4o-mini",
    instructions:"You are a game mission designer for a family-friendly fictional sci-fi arena shooter. Return only a JSON object with title (2-18 uppercase characters), text (one short sentence, max 90 characters), and type. type must be exactly one of: orbs, combat, survive, powerup. The type must match the objective. No real-world weapons, gore, hate, or unsafe content.",
    input:"Create one fresh, fair, easy-to-understand objective for a 2-8 player, 150-second arena match. Avoid repeating generic wording. Types have real scoring effects: orbs = bonus points for collecting energy orbs; combat = bonus points for eliminations; survive = bonus points for staying inside the safe zone; powerup = bonus points for collecting a power-up.",
    text:{format:{type:"json_object"}},max_output_tokens:120
   })
  });
  if(!response.ok) throw new Error(`OpenAI API returned ${response.status}`);
  const data=await response.json();
  const raw=(data.output||[]).flatMap(item=>item.content||[]).find(c=>c.type==="output_text")?.text;
  if(!raw) throw new Error("No mission text returned");
  const parsed=JSON.parse(raw),title=String(parsed.title||"").trim().slice(0,24).toUpperCase(),text=String(parsed.text||"").trim().slice(0,100),type=String(parsed.type||"");
  if(!title||!text||!VALID_MISSION_TYPES.has(type)) throw new Error("Invalid AI mission format");
  return {mission:{title,text,type},source:"OpenAI AI Director"};
 }catch(err){
  console.warn("AI mission generation failed; using fallback:",err.message);
  return {mission:fallbackMission(),source:"Local fallback"};
 }finally{clearTimeout(timeout);}
}
async function refreshMission(room){
 if(room.status!=="playing"||room.missionPending||room.missionCalls>=3)return;
 room.missionPending=true;room.missionCalls++;
 const result=await generateMission();
 if(room.status==="playing"){
  room.mission=result.mission;room.missionSource=result.source;room.missionStartedAt=Date.now();
  say(room,(result.source==="OpenAI AI Director"?"AI DIRECTOR: ":"MISSION: ")+room.mission.title+" — "+room.mission.text);
  emit(room);
 }
 room.missionPending=false;
}
const rand=(a,b)=>Math.random()*(b-a)+a,id=()=>crypto.randomUUID(),code=()=>crypto.randomBytes(3).toString("hex").toUpperCase();
function orb(){return{id:id(),x:rand(30,W-30),y:rand(80,H-30),value:Math.random()<.2?5:2}}
function player(s,name){return{id:s.id,name:String(name||"Rookie").replace(/[<>]/g,"").trim().slice(0,16)||"Rookie",x:rand(60,W-60),y:rand(100,H-50),hp:100,shield:25,score:0,kills:0,deaths:0,alive:true,respawn:0,weapon:"pulse",lastMove:0,lastShot:0,boost:0,color:["#62e8ff","#ff5e91","#ffd166","#b49aff","#7af0b7","#ff9d57","#a3e635","#f0abfc"][Math.floor(Math.random()*8)]}}
function makeRoom(c){return{code:c,players:new Map(),bullets:[],orbs:Array.from({length:10},orb),obs:[{x:220,y:150,w:105,h:48},{x:650,y:130,w:75,h:105},{x:415,y:250,w:135,h:45},{x:150,y:410,w:65,h:90},{x:720,y:410,w:110,h:48},{x:435,y:485,w:95,h:45}],status:"lobby",ends:0,start:0,tick:null,zone:{x:W/2,y:H/2,r:310},mission:fallbackMission(),missionSource:"Local fallback",missionCalls:0,missionPending:false,missionStartedAt:0,lastSurvivalAward:0,power:null,lastPower:0}}
function pub(r){return{code:r.code,status:r.status,ends:r.ends,missionSource:r.missionSource,players:[...r.players.values()].map(({id,name,x,y,hp,shield,score,kills,deaths,alive,weapon,color})=>({id,name,x,y,hp,shield,score,kills,deaths,alive,weapon,color})),bullets:r.bullets.map(({id,x,y,color})=>({id,x,y,color})),orbs:r.orbs,obs:r.obs,zone:r.zone,mission:r.mission,power:r.power}}
function emit(r){io.to(r.code).emit("state",pub(r))}function say(r,t){io.to(r.code).emit("toast",t)}function stop(r){if(r.tick)clearInterval(r.tick);r.tick=null}
function blocked(r,x,y,rad=15){return r.obs.some(o=>{let nx=Math.max(o.x,Math.min(x,o.x+o.w)),ny=Math.max(o.y,Math.min(y,o.y+o.h));return(x-nx)**2+(y-ny)**2<rad*rad})}
function eliminate(r,p,att){if(!p.alive)return;p.alive=false;p.hp=0;p.deaths++;p.respawn=Date.now()+2000;let a=r.players.get(att);if(a&&a.id!==p.id){a.kills++;a.score+=10+(r.mission.type==="combat"?5:0);say(r,a.name+" tagged "+p.name+(r.mission.type==="combat"?" · mission bonus!":""))}}
function finish(r){stop(r);r.status="finished";r.ends=0;emit(r);let ranking=[...r.players.values()].sort((a,b)=>b.score-a.score);io.to(r.code).emit("match-end",{winner:ranking[0]?.name||"No one",ranking:ranking.map(p=>({name:p.name,score:p.score,kills:p.kills}))})}
function start(r){if(r.players.size<2)return false;stop(r);r.status="playing";r.start=Date.now();r.ends=r.start+150000;r.bullets=[];r.zone.r=310;r.orbs=Array.from({length:10},orb);r.mission=fallbackMission();r.missionSource="Local fallback";r.missionCalls=0;r.missionPending=false;r.missionStartedAt=Date.now();r.lastSurvivalAward=Date.now();for(let p of r.players.values()){p.x=rand(60,W-60);p.y=rand(100,H-50);p.hp=100;p.shield=25;p.score=0;p.kills=0;p.deaths=0;p.alive=true}say(r,"Match started. Mission briefing incoming.");void refreshMission(r);r.tick=setInterval(()=>tick(r),50);emit(r);return true}
function tick(r){if(r.status!=="playing")return;let now=Date.now();if(now>=r.ends)return finish(r);r.zone.r=Math.max(100,310-(now-r.start)/150000*210);if(now-r.missionStartedAt>45000&&r.missionCalls<3&&!r.missionPending){r.missionStartedAt=now;void refreshMission(r)}
if(now-r.lastSurvivalAward>=5000){r.lastSurvivalAward=now;if(r.mission.type==="survive"){for(const p of r.players.values()){if(p.alive&&Math.hypot(p.x-r.zone.x,p.y-r.zone.y)<=r.zone.r)p.score+=2}}}
if(now-r.lastPower>14000){r.power={id:id(),x:rand(40,W-40),y:rand(90,H-40),type:Math.random()<.5?"shield":"rapid"};r.lastPower=now}
for(let p of r.players.values()){if(!p.alive&&now>=p.respawn){p.alive=true;p.hp=100;p.shield=25;p.x=rand(50,W-50);p.y=rand(100,H-50)}if(!p.alive)continue;if(Math.hypot(p.x-r.zone.x,p.y-r.zone.y)>r.zone.r){if(p.shield>0)p.shield=Math.max(0,p.shield-1);else p.hp-=1;if(p.hp<=0)eliminate(r,p,null)}
let oi=r.orbs.findIndex(o=>Math.hypot(o.x-p.x,o.y-p.y)<24);if(oi>=0){p.score+=r.orbs[oi].value+(r.mission.type==="orbs"?3:0);r.orbs.splice(oi,1);r.orbs.push(orb())}if(r.power&&Math.hypot(r.power.x-p.x,r.power.y-p.y)<26){if(r.power.type==="shield")p.shield=Math.min(100,p.shield+60);else p.boost=now+7000;if(r.mission.type==="powerup")p.score+=5;say(r,p.name+" picked up "+r.power.type+" boost!");r.power=null}}
for(let b of r.bullets){b.x+=b.vx;b.y+=b.vy;b.life--;if(b.x<0||b.x>W||b.y<60||b.y>H||b.life<1||blocked(r,b.x,b.y,4)){b.dead=true;continue}for(let p of r.players.values()){if(!p.alive||p.id===b.owner)continue;if(Math.hypot(p.x-b.x,p.y-b.y)<18){let d=b.damage;if(p.shield>0){let a=Math.min(d,p.shield);p.shield-=a;d-=a}p.hp-=d;b.dead=true;if(p.hp<=0)eliminate(r,p,b.owner);break}}}r.bullets=r.bullets.filter(b=>!b.dead);emit(r)}
function leave(s){let r=s.data.room&&rooms.get(s.data.room);if(!r)return;r.players.delete(s.id);s.leave(r.code);delete s.data.room;if(!r.players.size){stop(r);rooms.delete(r.code)}else{if(r.status==="playing"&&r.players.size<2){r.status="lobby";r.ends=0;stop(r);say(r,"Match paused: need two players.")}emit(r)}}
io.on("connection",s=>{s.emit("connected",{id:s.id});s.on("create-room",({name}={})=>{leave(s);let c;do{c=code()}while(rooms.has(c));let r=makeRoom(c);rooms.set(c,r);s.data.room=c;s.join(c);r.players.set(s.id,player(s,name));emit(r);s.emit("joined",{code:c,id:s.id})});
s.on("join-room",({code:c,name}={})=>{c=String(c||"").trim().toUpperCase();let r=rooms.get(c);if(!r)return s.emit("error-message","Room not found.");if(r.status==="playing")return s.emit("error-message","Match already running.");if(r.players.size>=8)return s.emit("error-message","Room full (8 players max).");leave(s);s.data.room=c;s.join(c);r.players.set(s.id,player(s,name));emit(r);s.emit("joined",{code:c,id:s.id});say(r,(name||"Player")+" joined the arena.")});
s.on("start-match",()=>{let r=rooms.get(s.data.room);if(!r)return s.emit("error-message","Create or join a room first.");if(r.players.size<2)return s.emit("error-message","Invite at least one more player.");if(r.status!=="playing")start(r)});
s.on("move",({dx,dy}={})=>{let r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r||r.status!=="playing"||!p?.alive)return;let n=Date.now();if(n-p.lastMove<28)return;p.lastMove=n;dx=Math.max(-1,Math.min(1,Number(dx)||0));dy=Math.max(-1,Math.min(1,Number(dy)||0));if(dx&&dy){dx*=Math.SQRT1_2;dy*=Math.SQRT1_2}let speed=n<p.boost?5.3:4.2,x=Math.max(18,Math.min(W-18,p.x+dx*speed)),y=Math.max(75,Math.min(H-18,p.y+dy*speed));if(!blocked(r,x,p.y))p.x=x;if(!blocked(r,p.x,y))p.y=y});
s.on("shoot",({angle,weapon}={})=>{let r=rooms.get(s.data.room),p=r?.players.get(s.id);if(!r||r.status!=="playing"||!p?.alive)return;weapon=weapons[weapon]?weapon:"pulse";let w=weapons[weapon],n=Date.now(),cd=n<p.boost?w.cd*.7:w.cd;if(n-p.lastShot<cd)return;p.lastShot=n;angle=Number(angle)||0;const pellets=weapon==="scatter"?5:1;for(let i=0;i<pellets;i++){let spread=weapon==="scatter"?(i-2)*.12+(Math.random()-.5)*.035:(Math.random()-.5)*.012;let a=angle+spread;r.bullets.push({id:id(),owner:p.id,x:p.x+Math.cos(a)*20,y:p.y+Math.sin(a)*20,vx:Math.cos(a)*w.speed,vy:Math.sin(a)*w.speed,damage:w.damage,color:w.color,life:weapon==="rail"?95:80})}});
s.on("change-weapon",({weapon}={})=>{let p=rooms.get(s.data.room)?.players.get(s.id);if(p&&weapons[weapon])p.weapon=weapon});s.on("leave-room",()=>leave(s));s.on("disconnect",()=>leave(s))});
server.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("Neon Strike Arena on port "+(process.env.PORT||3000)));
