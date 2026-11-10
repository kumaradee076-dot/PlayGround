(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const frame = document.querySelector('.game-frame');
  const overlay = document.querySelector('#overlay');
  const playButton = document.querySelector('#playButton');
  const roomLabel = document.querySelector('#roomLabel');
  const heightFill = document.querySelector('#heightFill');
  const dashStatus = document.querySelector('#dashStatus');
  const shardCount = document.querySelector('#shardCount');
  const toast = document.querySelector('#toast');
  const checkpointText = document.querySelector('#checkpointText');
  const W = 960, RH = 540, WORLD_H = 5 * RH;
  let viewH = 540, cameraY = WORLD_H - RH, lastTime = 0, running = false, paused = false;
  const keys = new Set(), pressed = new Set();
  let muted = true, audio, toastTimer = 0, elapsed = 0, totalShards = 0, completed = false;
  const rooms = [
    {name:'THE CROWN', sky:['#192640','#445274'], platforms:[[0,495,270,24],[420,470,180,22],[680,430,280,24],[255,365,250,22],[590,325,190,20],[100,260,220,22],[370,205,200,20],[650,155,240,22],[285,88,210,20]], spikes:[[700,430,95],[468,470,70]], shards:[[340,325],[540,165]], checkpoint:470},
    {name:'WIND SCAR', sky:['#202c42','#536074'], platforms:[[0,480,335,24],[565,480,395,24],[355,405,235,20],[650,340,220,22],[390,275,210,20],[85,210,240,22],[420,150,210,20],[680,85,220,22]], spikes:[[80,210,82],[780,340,65]], shards:[[690,435],[280,175]], checkpoint:465},
    {name:'THE BLUE HOLLOW', sky:['#182c43','#426176'], platforms:[[0,485,390,24],[575,485,385,24],[390,410,190,20],[120,340,205,22],[590,285,240,20],[350,220,220,20],[70,150,230,22],[480,85,230,20]], spikes:[[135,340,75],[690,285,76]], shards:[[475,380],[300,120]], checkpoint:470},
    {name:'EMBER RIDGE', sky:['#352739','#79545a'], platforms:[[0,480,400,24],[560,480,400,24],[400,400,180,20],[635,330,210,22],[320,270,205,20],[80,205,235,22],[420,140,200,20],[670,75,210,22]], spikes:[[75,205,72],[730,330,70]], shards:[[480,365],[610,115]], checkpoint:465},
    {name:'THE LOWLAND', sky:['#283349','#5b6277'], platforms:[[0,500,370,26],[590,500,370,26],[115,420,220,20],[395,350,180,20],[650,280,200,20],[365,210,190,20],[80,140,210,20],[535,75,230,20]], spikes:[[0,500,78],[805,500,82]], shards:[[475,315],[290,105]], checkpoint:480}
  ];
  const roomColors = ['#d7f0ff','#bde8ed','#c8ebf3','#ffd0a3','#e5d6b7'];
  let player = {x:150,y:WORLD_H-85,w:22,h:32,vx:0,vy:0,face:1,onGround:false,wall:0,dash:1,dashFrames:0,dashDirX:1,dashDirY:0,coyote:0,jumpBuffer:0,invuln:0};
  let cameraTarget = WORLD_H-RH, currentRoom = 4, checkpointRoom = 4, checkpointX = 150, checkpointY = WORLD_H-85;
  let particles = [], crystals = [], platforms = [], spikes = [], goal = {x:730,y:36,w:44,h:65};
  function rebuildWorld(){
    platforms=[];spikes=[];crystals=[];
    rooms.forEach((room,i)=>{
      const base=i*RH;
      room.platforms.forEach(([x,y,w,h])=>platforms.push({x,y:base+y,w,h,room:i}));
      room.spikes.forEach(([x,y,w])=>spikes.push({x,y:base+y,w,h:20,room:i}));
      room.shards.forEach(([x,y],j)=>crystals.push({x,y:base+y,r:8,room:i,id:`${i}-${j}`,taken:false,phase:Math.random()*6.28}));
    });
    // The bottom approach is safe to land on, while the top has a clear opening into the summit.
    platforms.push({x:0,y:WORLD_H-20,w:960,h:40,room:4,bottom:true});
  }
  rebuildWorld();
  function resize(){
    const rect=canvas.getBoundingClientRect();
    const ratio=rect.height/Math.max(1,rect.width);
    canvas.width=960; canvas.height=Math.round(960*ratio); viewH=canvas.height;
  }
  new ResizeObserver(resize).observe(frame); resize();
  function showToast(text){toast.textContent=text;toast.classList.add('show');toastTimer=1.8}
  function setRoom(index){
    if(index===currentRoom)return;
    currentRoom=index; roomLabel.innerHTML=`0${index+1} / 05 <span>·</span> ${rooms[index].name}`;
    if(index<checkpointRoom){checkpointRoom=index;checkpointX=Math.max(80,Math.min(880,player.x));checkpointY=(index+1)*RH-82;checkpointText.textContent=`CHECKPOINT 0${index+1}`;showToast(`CHECKPOINT ${String(index+1).padStart(2,'0')} · ${rooms[index].name}`);}
    else showToast(rooms[index].name);
  }
  function resetPlayer(){
    player={x:checkpointX,y:checkpointY,w:22,h:32,vx:0,vy:0,face:1,onGround:false,wall:0,dash:1,dashFrames:0,dashDirX:1,dashDirY:0,coyote:0,jumpBuffer:0,invuln:1.2};
    cameraY=Math.max(0,Math.min(WORLD_H-viewH,player.y+player.h/2-viewH*.56));
    emit(player.x+11,player.y+20,'#e7f2ce',15,3);
    showToast('BACK TO THE LAST CAMP');
  }
  function startGame(){
    if(completed){
      completed=false;totalShards=0;shardCount.textContent='✦ 0';rebuildWorld();
      checkpointRoom=currentRoom=4;checkpointX=150;checkpointY=WORLD_H-85;player.x=150;player.y=checkpointY;player.vx=player.vy=0;player.dash=1;
      cameraY=WORLD_H-RH;roomLabel.innerHTML=`05 / 05 <span>·</span> ${rooms[4].name}`;checkpointText.textContent='CHECKPOINT 01';
      document.querySelector('#eyebrow').textContent='A SMALL MOUNTAIN, A LONG WAY UP';document.querySelector('#overlayText').textContent='The wind is loud up here. Keep moving.';
    }
    running=true;paused=false;overlay.classList.add('hidden');frame.classList.add('playing');
    player.invuln=.8; if(!muted)beep(520,.08);
  }
  function endGame(){
    running=false;paused=false;completed=true;frame.classList.remove('playing');
    document.querySelector('#eyebrow').textContent='YOU FOUND THE LAST LIGHT';
    document.querySelector('#overlayTitle').innerHTML='SUMMIT<span>.</span>';
    document.querySelector('#overlayText').textContent=`A little farther than you thought. ${totalShards} moonstones found.`;
    playButton.innerHTML='<span>CLIMB AGAIN</span><b>↗</b>'; overlay.classList.remove('hidden');
  }
  function pauseGame(){
    if(!running)return;paused=!paused;
    if(paused){document.querySelector('#eyebrow').textContent='CATCH YOUR BREATH';document.querySelector('#overlayTitle').innerHTML='PAUSED<span>.</span>';document.querySelector('#overlayText').textContent='The mountain will wait.';playButton.innerHTML='<span>KEEP CLIMBING</span><b>↗</b>';overlay.classList.remove('hidden');}
    else overlay.classList.add('hidden');
  }
  playButton.addEventListener('click',()=>{if(!running)startGame();else if(paused){paused=false;overlay.classList.add('hidden')}});
  document.querySelector('#pauseButton').addEventListener('click',pauseGame);
  document.querySelector('#soundButton').addEventListener('click',e=>{muted=!muted;e.currentTarget.innerHTML=muted?'♫ <span> SOUND</span>':'♫ <span> ON</span>';if(!muted){audio=audio||new (window.AudioContext||window.webkitAudioContext)();audio.resume()}});
  function beep(freq=440,dur=.07){if(muted)return;try{audio=audio||new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.055,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch(e){}}
  function keyName(e){return e.key===' '||e.code==='Space'?'jump':e.key==='Shift'||e.key==='x'||e.key==='X'?'dash':e.key.toLowerCase()}
  window.addEventListener('keydown',e=>{
    const k=keyName(e);if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();
    if(!keys.has(k))pressed.add(k);keys.add(k);
    if(k==='escape'||k==='p'){pauseGame();}
    if(k==='r'&&running)resetPlayer();
    if((k==='enter'||k==='jump')&&!running&&!paused)startGame();
  });
  window.addEventListener('keyup',e=>keys.delete(keyName(e)));
  window.addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('.touch-controls button').forEach(button=>{
    const action=button.dataset.key;
    button.addEventListener('pointerdown',e=>{e.preventDefault();if(!keys.has(action))pressed.add(action);keys.add(action);button.setPointerCapture(e.pointerId)});
    const release=e=>{e.preventDefault();keys.delete(action)};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
  });
  function emit(x,y,color,n=8,speed=2){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=Math.random()*speed;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.35+Math.random()*.4,max:.75,size:1.5+Math.random()*2,color})}}
  function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
  function movePlayer(dt){
    const left=keys.has('arrowleft')||keys.has('a'),right=keys.has('arrowright')||keys.has('d');
    const jumpPressed=pressed.has('jump')||pressed.has('arrowup')||pressed.has('w');
    const dashPressed=pressed.has('dash');
    if(jumpPressed)player.jumpBuffer=.13;
    player.jumpBuffer=Math.max(0,player.jumpBuffer-dt);player.coyote=player.onGround?.11:Math.max(0,player.coyote-dt);
    if(left){player.vx-=.82;player.face=-1}if(right){player.vx+=.82;player.face=1}
    if(!left&&!right)player.vx*=player.onGround?.78:.92;
    player.vx=Math.max(-4.3,Math.min(4.3,player.vx));
    if(player.jumpBuffer>0){
      if(player.coyote>0){player.vy=-10.7;player.onGround=false;player.coyote=0;player.jumpBuffer=0;emit(player.x+11,player.y+31,'#d7f0ff',6,1.3);beep(420,.07)}
      else if(player.wall){player.vy=-10.2;player.vx=player.wall*6.8;player.face=player.wall;player.wall=0;player.jumpBuffer=0;emit(player.x+(player.face<0?22:0),player.y+18,'#d7f0ff',9,2);beep(360,.09)}
    }
    if(dashPressed&&player.dash&&!player.dashFrames){
      let dx=(right?1:0)-(left?1:0),dy=(keys.has('arrowup')||keys.has('w')? -1:0)+(keys.has('arrowdown')||keys.has('s')?1:0);
      if(dx===0&&dy===0)dx=player.face;if(dx&&dy){dx*=.707;dy*=.707}
      player.dashDirX=dx;player.dashDirY=dy;player.dash=0;player.dashFrames=.16;player.vx=dx*12.5;player.vy=dy*12.5;emit(player.x+11,player.y+16,'#e5f88d',14,3);beep(680,.1);
    }
    if(player.dashFrames>0){player.dashFrames-=dt;player.vx=player.dashDirX*12.5;player.vy=player.dashDirY*12.5}
    else player.vy=Math.min(10,player.vy+24*dt);
    player.onGround=false;player.wall=0;
    // Substeps keep dash and wall collisions crisp.
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(player.vx),Math.abs(player.vy))*dt*60/.38));
    for(let s=0;s<steps;s++){
      player.x+=player.vx*dt*60/steps;player.y+=player.vy*dt*60/steps;
      if(player.x<0){player.x=0;player.wall=1;if(player.vx<0)player.vx=0}
      if(player.x+player.w>W){player.x=W-player.w;player.wall=-1;if(player.vx>0)player.vx=0}
      for(const p of platforms){if(!hit(player,p))continue;
        const prevX=player.x-player.vx*dt*60/steps,prevY=player.y-player.vy*dt*60/steps;
        if(prevY+player.h<=p.y+5&&player.vy>=0){player.y=p.y-player.h;player.vy=0;player.onGround=true;player.dash=1;player.dashFrames=0}
        else if(prevY>=p.y+p.h-5&&player.vy<0){player.y=p.y+p.h;player.vy=0;player.dashFrames=0}
        else if(prevX+player.w<=p.x+4&&player.vx>0){player.x=p.x-player.w;player.vx=0;player.wall=-1}
        else if(prevX>=p.x+p.w-4&&player.vx<0){player.x=p.x+p.w;player.vx=0;player.wall=1}
      }
    }
    if(player.onGround&&player.vy>=0)player.dash=1;
    if(player.invuln>0)player.invuln-=dt;
    const room=Math.max(0,Math.min(4,Math.floor((player.y+player.h/2)/RH)));
    setRoom(room);
    crystals.forEach(c=>{if(c.taken) return;const dx=player.x+player.w/2-c.x,dy=player.y+player.h/2-c.y;if(dx*dx+dy*dy<24*24){c.taken=true;totalShards++;player.dash=1;shardCount.textContent=`✦ ${totalShards}`;emit(c.x,c.y,'#e9f58c',16,2.4);showToast('MOONSTONE · DASH REFILLED');beep(880,.16)}});
    for(const s of spikes){const box={x:s.x+5,y:s.y+8,w:s.w-10,h:s.h-8};if(hit(player,box)&&player.invuln<=0){resetPlayer();break}}
    if(player.y>WORLD_H+80)resetPlayer();
    if(player.y<105&&player.x>675&&player.x<835){emit(player.x+10,player.y,'#e8f687',24,3);beep(880,.2);endGame()}
    dashStatus.classList.toggle('spent',!player.dash);
    const progress=Math.max(0,Math.min(100,(WORLD_H-(player.y+RH*.1))/WORLD_H*100));heightFill.style.width=`${progress}%`;
  }
  function screenY(y){return y-cameraY}
  function drawBackground(){
    const room=rooms[currentRoom]||rooms[4], grad=ctx.createLinearGradient(0,0,0,viewH);
    grad.addColorStop(0,room.sky[0]);grad.addColorStop(1,room.sky[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,W,viewH);
    const phase=currentRoom*.8;
    for(let layer=0;layer<3;layer++){
      const parallax=.12+layer*.13, base=viewH*(.48+layer*.16)-((cameraY*parallax)%250);
      ctx.beginPath();ctx.moveTo(0,viewH);
      for(let x=-80;x<=W+80;x+=80){const h=60+((Math.sin(x*.012+phase+layer*2)*.5+.5)*120);ctx.lineTo(x,base-h)}
      ctx.lineTo(W+80,viewH);ctx.closePath();ctx.fillStyle=['#17253a88','#18263a99','#152239bb'][layer];ctx.fill();
    }
    for(let i=0;i<8;i++){
      const x=((i*173+elapsed*9*(i%2?1:-1)+1200)%1160)-100;
      const y=((i*97-cameraY*.08+elapsed*2)%Math.max(viewH,540));
      ctx.fillStyle=`rgba(231,241,245,${.035+(i%3)*.012})`;
      ctx.beginPath();ctx.ellipse(x,y,38+i%3*13,5+i%2*3,-.05,0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<32;i++){
      const x=(i*293+41)%W,y=(i*167-cameraY*.055+viewH*2)%(viewH*.65);
      ctx.fillStyle=`rgba(239,244,218,${.12+.1*Math.sin(elapsed*1.7+i)})`;ctx.fillRect(x,y,2,2);
    }
  }
  function drawPlatform(p){
    const y=screenY(p.y);if(y>viewH+50||y+p.h< -50)return;
    ctx.fillStyle='#19273a';ctx.fillRect(p.x,y,p.w,p.h);
    ctx.fillStyle='#3e5265';ctx.fillRect(p.x,y,p.w,4);
    ctx.fillStyle='#25364a';ctx.fillRect(p.x,y+4,p.w,Math.min(p.h-4,9));
    ctx.fillStyle='#718091';
    for(let x=p.x+12;x<p.x+p.w-8;x+=42){ctx.fillRect(x,y+5,Math.min(15,p.x+p.w-x-4),1);ctx.fillStyle='#26374b';ctx.fillRect(x+8,y+12,1,3);ctx.fillStyle='#718091'}
    ctx.fillStyle='#d7e4dc88';ctx.fillRect(p.x+5,y+1,Math.max(0,p.w-10),1);
  }
  function drawSpikes(s){
    const y=screenY(s.y);if(y>viewH+30||y< -30)return;
    const count=Math.floor(s.w/15),step=s.w/count;
    for(let i=0;i<count;i++){
      const x=s.x+i*step;ctx.beginPath();ctx.moveTo(x,y+s.h);ctx.lineTo(x+step*.5,y+3);ctx.lineTo(x+step,y+s.h);ctx.closePath();ctx.fillStyle='#a94f63';ctx.fill();
      ctx.beginPath();ctx.moveTo(x+step*.5,y+3);ctx.lineTo(x+step*.72,y+s.h);ctx.lineTo(x+step*.5,y+s.h);ctx.closePath();ctx.fillStyle='#e99a92';ctx.fill();
    }
  }
  function drawCrystal(c){
    if(c.taken)return;const y=screenY(c.y+Math.sin(elapsed*2.7+c.phase)*4),x=c.x;
    ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(elapsed*1.8+c.phase)*.18);ctx.shadowColor='#e9f58c';ctx.shadowBlur=15;
    ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(7,0);ctx.lineTo(0,10);ctx.lineTo(-7,0);ctx.closePath();ctx.fillStyle='#e9f58c';ctx.fill();ctx.shadowBlur=0;
    ctx.beginPath();ctx.moveTo(0,-6);ctx.lineTo(3,0);ctx.lineTo(0,5);ctx.closePath();ctx.fillStyle='#fff9ce';ctx.fill();ctx.restore();
  }
  function drawGoal(){
    const x=goal.x,y=screenY(goal.y);if(y>viewH+100||y< -100)return;
    ctx.fillStyle='#dfecdc';ctx.fillRect(x+20,y+4,3,goal.h);
    ctx.beginPath();ctx.moveTo(x+23,y+5);ctx.lineTo(x+47,y+14);ctx.lineTo(x+23,y+24);ctx.closePath();ctx.fillStyle='#d9f177';ctx.fill();
    ctx.save();ctx.translate(x+21,y+39);ctx.shadowBlur=22;ctx.shadowColor='#d9f177';ctx.fillStyle='#e7f79a';ctx.beginPath();ctx.arc(0,0,10+Math.sin(elapsed*3)*2,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#eff3d6';ctx.font='9px DM Mono, monospace';ctx.textAlign='center';ctx.fillText('THE TOP',x+23,y+goal.h+14);
  }
  function drawPlayer(){
    if(player.invuln>0&&Math.floor(elapsed*16)%2===0)return;
    const x=player.x,y=screenY(player.y),center=x+player.w/2;
    if(player.dashFrames>0){ctx.strokeStyle='#e9f58c88';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(center-player.dashDirX*28,y+player.h/2-player.dashDirY*28);ctx.lineTo(center-player.dashDirX*5,y+player.h/2-player.dashDirY*5);ctx.stroke()}
    ctx.fillStyle='#1c293c';ctx.fillRect(x+3,y+11,16,19);ctx.fillStyle='#dd6f75';ctx.fillRect(x+4,y+12,14,17);
    ctx.fillStyle='#f0c4a4';ctx.beginPath();ctx.arc(center,y+8,7.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#332f41';ctx.beginPath();ctx.arc(center+player.face*1,y+5,8,Math.PI,Math.PI*2);ctx.fill();ctx.fillRect(center-7,y+4,14,3);
    ctx.fillStyle='#20253a';ctx.fillRect(center+player.face*3,y+7,2,2);
    ctx.fillStyle='#f4dd89';ctx.fillRect(x+5,y+29,5,4);ctx.fillRect(x+13,y+29,5,4);
    const scarfX=player.face>0?x-12:x+16;ctx.fillStyle='#e66f79';ctx.beginPath();ctx.moveTo(player.face>0?x+5:x+17,y+14);ctx.lineTo(scarfX,y+12+Math.sin(elapsed*18)*2);ctx.lineTo(scarfX-player.face*4,y+17);ctx.lineTo(player.face>0?x+5:x+17,y+18);ctx.fill();
  }
  function draw(){
    ctx.save();ctx.scale(canvas.width/960,canvas.height/viewH);drawBackground();
    const gy=screenY(75);const glow=ctx.createRadialGradient(730,gy,5,730,gy,170);glow.addColorStop(0,'#e1f48a2c');glow.addColorStop(1,'#e1f48a00');ctx.fillStyle=glow;ctx.fillRect(550,gy-170,360,340);
    platforms.forEach(drawPlatform);spikes.forEach(drawSpikes);crystals.forEach(drawCrystal);drawGoal();
    for(const p of particles){const y=screenY(p.y);ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,y,p.size,p.size)}ctx.globalAlpha=1;
    drawPlayer();ctx.restore();
  }
  function tick(now){
    const dt=Math.min(.034,(now-lastTime)/1000||.016);lastTime=now;elapsed+=dt;
    if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.classList.remove('show')}
    if(running&&!paused){movePlayer(dt);const desired=Math.max(0,Math.min(WORLD_H-viewH,player.y+player.h*.5-viewH*.56));cameraY+=(desired-cameraY)*Math.min(1,dt*4.8);
      particles.forEach(p=>{p.x+=p.vx*dt*60;p.y+=p.vy*dt*60;p.vy+=.035*dt*60;p.life-=dt});particles=particles.filter(p=>p.life>0);
    }else{
      cameraY+=(Math.max(0,Math.min(WORLD_H-viewH,player.y+player.h*.5-viewH*.56))-cameraY)*.025;
      particles.forEach(p=>{p.life-=dt});particles=particles.filter(p=>p.life>0);
    }
    draw();pressed.clear();requestAnimationFrame(tick);
  }
  roomLabel.innerHTML=`05 / 05 <span>·</span> ${rooms[4].name}`;
  requestAnimationFrame(tick);
})();

