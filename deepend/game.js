(() => {
  'use strict';
  const $ = (q) => document.querySelector(q);
  const home = $('#home'), gameScreen = $('#gameScreen'), lobby = $('#roomLobby'), arena = $('#arenaWrap');
  const previewCanvas = $('#previewCanvas'), previewCtx = previewCanvas.getContext('2d');
  const canvas = $('#gameCanvas'), ctx = canvas.getContext('2d');
  const COLORS = ['#89f5c1','#d6ff75','#65dfec','#ffd27d','#ff836f','#bda7ff'];
  const ZONES = ['THE SUNLIT DROP','KELP FOREST','THE BLUE HOUR','BLACKWATER','THE ABYSS'];
  const UPGRADE_COST = { tank: [35,60,95], hull: [45,75,110], magnet: [40,65,100] };
  const UPGRADE_CAP = { tank: 3, hull: 3, magnet: 3 };
  const defaultProfile = { banked: 0, best: 0, bestHaul: 0, upgrades: { tank: 0, hull: 0, magnet: 0 } };
  let profile = loadProfile();
  let game = null, run = null, peer = null, localId = null, hostMode = false, hostConn = null;
  const connections = new Map();
  let lastFrame = 0, lastHud = 0, lastNetwork = 0, toastTimer = 0, popTimer = 0, previewTime = 0;
  const keys = new Set();
  let pointer = null, audio = null;

  function loadProfile() {
    try {
      const raw = JSON.parse(localStorage.getItem('deepend-save') || '{}');
      return { ...defaultProfile, ...raw, upgrades: { ...defaultProfile.upgrades, ...(raw.upgrades || {}) } };
    } catch (_) { return { ...defaultProfile, upgrades: { ...defaultProfile.upgrades } }; }
  }
  function saveProfile() { try { localStorage.setItem('deepend-save', JSON.stringify(profile)); } catch (_) {} }
  function fmt(n) { return new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(n || 0))); }
  function safeName(s) { return String(s || '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0,14) || 'Diver'; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toast(message) {
    const el = $('#toast'); el.textContent = message; el.classList.add('is-on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('is-on'), 2300);
  }
  function notice(message) { $('#homeNotice').textContent = message || ''; }
  function setRoomNotice(message) { $('#lobbyStatus').textContent = message || ''; }
  function updateProfileUI() {
    $('#homeBank').textContent = fmt(profile.banked);
    $('#homeBest').textContent = `${fmt(profile.best)} m`;
    $('#bankedHud').textContent = fmt(profile.banked);
    const costs = {};
    for (const key of Object.keys(UPGRADE_COST)) {
      const level = profile.upgrades[key] || 0;
      const price = UPGRADE_COST[key][level];
      costs[key] = price;
      $(`#${key}Price`).textContent = price == null ? 'MAXED' : `✦ ${price}`;
      $(`#${key}Level`).textContent = `LV ${level}${price == null ? ' / MAX' : ''}`;
      const button = $(`[data-upgrade="${key}"]`);
      button.disabled = price == null || profile.banked < price;
    }
  }
  function currentName() {
    const name = safeName($('#nickname').value); $('#nickname').value = name;
    try { localStorage.setItem('deepend-name', name); } catch (_) {}
    return name;
  }
  function getName() { try { return safeName(localStorage.getItem('deepend-name') || $('#nickname').value); } catch (_) { return safeName($('#nickname').value); } }
  function buyUpgrade(key) {
    const level = profile.upgrades[key] || 0, price = UPGRADE_COST[key]?.[level];
    if (price == null || profile.banked < price) return;
    profile.banked -= price; profile.upgrades[key] = level + 1; saveProfile(); updateProfileUI();
    const label = { tank: 'O₂ tank', hull: 'reinforced suit', magnet: 'pearl magnet' }[key];
    toast(`${label} upgraded to LV ${level + 1}. It sticks.`); playBlip(660, .08, 'sine');
  }

  function setView(view) {
    home.hidden = view !== 'home'; gameScreen.hidden = view === 'home';
    lobby.hidden = view !== 'lobby'; arena.hidden = view !== 'arena';
    if (view !== 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (view === 'arena') { resizeGameCanvas(); }
  }
  function makeInviteLink() {
    if (!game?.hostId) return location.href;
    const url = new URL(location.href); url.searchParams.set('room', game.hostId); return url.toString();
  }
  function copyText(text) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast('Copied. Send it to the group chat.')).catch(() => fallbackCopy(text));
    else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const el = document.createElement('textarea'); el.value = text; el.style.cssText = 'position:fixed;opacity:0;left:-9999px'; document.body.appendChild(el); el.select();
    const ok = document.execCommand('copy'); el.remove(); toast(ok ? 'Copied. Send it to the group chat.' : 'Could not copy — long-press the invite link.');
  }
  function cleanupNetwork() {
    for (const conn of connections.values()) { try { conn.close(); } catch (_) {} }
    connections.clear(); try { hostConn?.close(); } catch (_) {} hostConn = null;
    try { peer?.destroy(); } catch (_) {} peer = null; hostMode = false; localId = null;
  }
  function goHome() {
    cleanupNetwork(); run = null; game = null; pointer = null; keys.clear(); $('#resultModal').hidden = true;
    const url = new URL(location.href); url.searchParams.delete('room'); history.replaceState({}, '', url); setView('home'); notice(''); updateProfileUI();
  }
  function makePlayer(id, name, index) {
    return { id, name: safeName(name), color: COLORS[index % COLORS.length], connected: true, finished: false, alive: true, score: 0, loot: 0, depth: 0, streak: 0 };
  }
  function localPlayer() { return game?.players?.find(p => p.id === localId) || null; }

  function startSolo() {
    cleanupNetwork(); currentName(); notice('');
    localId = 'solo-diver'; hostMode = true;
    game = { mode: 'solo', phase: 'playing', players: [makePlayer(localId, getName(), 0)], events: [], seed: Math.floor(Math.random() * 0xffffffff) };
    $('#modeLabel').textContent = 'SOLO DIVE'; $('#connectionPill').className = 'connection-pill'; $('#connectionPill').innerHTML = '<i></i><span>LOCAL RUN</span>';
    $('#shareRoom').hidden = true; $('#resultModal').hidden = true; setView('arena'); beginDive(game.seed); renderRoom();
  }
  function showPeerError(message) { if (!game) notice(message); else { toast(message); if (game.phase === 'lobby') setRoomNotice(message); } }
  function createRoom() {
    if (typeof window.Peer !== 'function') { notice('Room signal did not load. Solo still works — refresh to retry multiplayer.'); return; }
    cleanupNetwork(); currentName(); notice('Finding a signal…');
    try {
      peer = new window.Peer(undefined, { debug: 0 });
      peer.on('open', id => {
        localId = id; hostMode = true;
        game = { mode: 'online', phase: 'lobby', hostId: id, players: [makePlayer(id, getName(), 0)], events: [], seed: null };
        $('#modeLabel').textContent = 'ROOM / LOBBY'; $('#connectionPill').className = 'connection-pill is-live'; $('#connectionPill').innerHTML = '<i></i><span>ROOM SIGNAL</span>';
        $('#shareRoom').hidden = false; notice(''); setView('lobby'); renderRoom(); setRoomNotice('Room ready. Send the invite, then start when you’re set.');
      });
      peer.on('connection', acceptGuest);
      peer.on('error', error => {
        const msg = error?.type === 'unavailable-id' ? 'That room code is already in use. Open a fresh room.' : 'Room signal lost. Try another room or play solo.';
        showPeerError(msg);
      });
      peer.on('disconnected', () => { if (game?.phase === 'lobby') setRoomNotice('Signal paused. Reopen the room if invites stop connecting.'); });
    } catch (_) { notice('Could not open a room. Solo still works.'); }
  }
  function acceptGuest(conn) {
    conn.on('data', message => onHostMessage(conn, message));
    conn.on('close', () => {
      const p = game?.players?.find(item => item.id === conn.peer); connections.delete(conn.peer);
      if (!p) return;
      p.connected = false;
      if (game.phase === 'lobby') game.players = game.players.filter(item => item.id !== conn.peer);
      else { p.finished = true; p.alive = false; }
      game.events.unshift({ name: p.name, text: 'lost signal', emoji: '◌' }); game.events = game.events.slice(0, 4);
      checkRoomFinished(); broadcast();
    });
    conn.on('error', () => {});
  }
  function joinRoom(raw) {
    let roomId = String(raw || '').trim();
    if (!roomId) { notice('Paste an invite link or room code first.'); return; }
    try { if (roomId.includes('://')) roomId = new URL(roomId).searchParams.get('room') || roomId; } catch (_) {}
    roomId = roomId.trim(); if (!roomId || roomId.length > 120) { notice('That room code doesn’t look right.'); return; }
    if (typeof window.Peer !== 'function') { notice('Room signal did not load. Solo still works — refresh to retry multiplayer.'); return; }
    cleanupNetwork(); currentName(); notice('Joining the room…');
    try {
      peer = new window.Peer(undefined, { debug: 0 });
      peer.on('open', id => {
        localId = id; hostMode = false; hostConn = peer.connect(roomId, { reliable: true });
        hostConn.on('open', () => { hostConn.send({ type: 'hello', name: getName() }); notice('Connected — syncing the dive…'); });
        hostConn.on('data', onGuestMessage);
        hostConn.on('close', () => { $('#connectionPill').className = 'connection-pill is-offline'; toast('Room connection closed.'); });
        hostConn.on('error', () => notice('Could not reach that room. Check the invite and try again.'));
      });
      peer.on('error', error => notice(error?.type === 'peer-unavailable' ? 'That room is offline or the invite expired.' : 'Could not join the room. Try the invite again.'));
    } catch (_) { notice('Could not join the room. Try the invite again.'); }
  }
  function onHostMessage(conn, message) {
    if (!message || !game || !hostMode || game.mode !== 'online') return;
    const id = conn.peer;
    if (message.type === 'hello') {
      if (game.phase !== 'lobby') { conn.send({ type: 'reject', message: 'This dive already started.' }); return; }
      if (game.players.length >= 6) { conn.send({ type: 'reject', message: 'This room is full (6 divers max).' }); return; }
      if (!game.players.some(p => p.id === id)) game.players.push(makePlayer(id, message.name, game.players.length));
      connections.set(id, conn); broadcast(); setRoomNotice('Crew in. Start whenever the group chat is ready.'); return;
    }
    if (message.type === 'progress') {
      const p = game.players.find(item => item.id === id); if (!p) return;
      p.depth = Math.max(0, Math.floor(message.depth || 0)); p.loot = Math.max(0, Math.floor(message.loot || 0)); p.streak = Math.max(0, Math.floor(message.streak || 0));
      p.finished = !!message.finished; p.alive = !!message.alive;
      if (p.finished) p.score = Math.max(0, Math.floor(message.score || 0));
      checkRoomFinished(); broadcast(); return;
    }
    if (message.type === 'react') {
      const p = game.players.find(item => item.id === id);
      if (p && ['👀','💀','🫡','🪼'].includes(message.emoji)) { game.events.unshift({ name: p.name, emoji: message.emoji, text: 'reacted' }); game.events = game.events.slice(0,4); broadcast(); }
      return;
    }
    if (message.type === 'again') { const p = game.players.find(item => item.id === id); if (p) { game.events.unshift({ name:p.name, emoji:'↻', text:'wants one more dive' }); game.events = game.events.slice(0,4); broadcast(); toast(`${p.name} wants another run.`); } }
  }
  function onGuestMessage(message) {
    if (!message) return;
    if (message.type === 'reject') { notice(message.message || 'The host could not add you.'); toast(message.message || 'Room is unavailable.'); return; }
    if (message.type === 'state') {
      const existingMode = game?.mode; game = message.state; if (existingMode === 'online') game.mode = 'online';
      $('#modeLabel').textContent = game.phase === 'lobby' ? 'ROOM / LOBBY' : 'LIVE ROOM RACE';
      $('#connectionPill').className = 'connection-pill is-live'; $('#connectionPill').innerHTML = '<i></i><span>CREW SIGNAL</span>';
      $('#shareRoom').hidden = false; notice(''); renderRoom();
      if (game.phase === 'result') { setView('arena'); showResults(); }
      else if (game.phase === 'lobby') setView('lobby');
      return;
    }
    if (message.type === 'start') { if (game) { game.phase = 'playing'; game.seed = message.seed; } $('#resultModal').hidden = true; $('#modeLabel').textContent = 'LIVE ROOM RACE'; setView('arena'); beginDive(message.seed); renderRoom(); }
    if (message.type === 'toast') toast(message.message);
  }
  function hostStartRoom() {
    if (!game || !hostMode || game.phase !== 'lobby') return;
    startRoomRun();
  }
  function startRoomRun() {
    if (!game || !hostMode || game.mode !== 'online') return;
    const seed = Math.floor(Math.random() * 0xffffffff);
    game.phase = 'playing'; game.seed = seed; game.events = [];
    for (const p of game.players) { p.finished = false; p.alive = true; p.score = 0; p.loot = 0; p.depth = 0; p.streak = 0; }
    $('#resultModal').hidden = true; $('#modeLabel').textContent = 'LIVE ROOM RACE'; setView('arena');
    broadcast(); for (const conn of connections.values()) { if (conn.open) { try { conn.send({ type:'start', seed }); } catch (_) {} } }
    beginDive(seed); renderRoom();
  }
  function broadcast() {
    if (!game || !hostMode || game.mode !== 'online') return;
    renderRoom(); const state = JSON.parse(JSON.stringify(game));
    for (const [id,conn] of connections) { if (conn.open) { try { conn.send({ type:'state', state }); } catch (_) {} } else if (!game.players.some(p => p.id === id && p.connected)) connections.delete(id); }
  }
  function sendReaction(emoji) {
    if (!game) return;
    if (game.mode === 'online' && !hostMode) { if (hostConn?.open) hostConn.send({ type:'react', emoji }); return; }
    game.events.unshift({ name: getName(), emoji, text: 'reacted' }); game.events = game.events.slice(0,4); if (hostMode && game.mode === 'online') broadcast(); else renderRoom();
  }
  function checkRoomFinished() {
    if (!game || game.mode !== 'online' || !hostMode || game.phase !== 'playing') return;
    if (game.players.every(p => p.finished || !p.connected)) { game.phase = 'result'; game.message = 'The crew surfaced. The trench keeps the rest.'; broadcast(); showResults(); }
  }
  function renderRoom() {
    if (!game) return;
    const online = game.mode === 'online';
    $('#shareRoom').hidden = !online;
    if (online) {
      $('#inviteText').textContent = makeInviteLink(); $('#lobbyCount').textContent = `${game.players.length} / 6`;
      $('#startRoom').hidden = !hostMode || game.phase !== 'lobby';
      $('#lobbyStatus').hidden = hostMode || game.phase !== 'lobby';
      $('#crewCount').textContent = `${game.players.length} DIVER${game.players.length === 1 ? '' : 'S'}`;
      renderRoster($('#lobbyRoster'), true); renderRoster($('#crewBoard'), false); renderFeed();
    } else {
      $('#crewCount').textContent = 'SOLO DIVE';
      $('#crewBoard').innerHTML = `<div class="crew-chip is-you"><i></i><b>${esc(getName())}</b><span>${run ? `${fmt(run.depth/5)}m` : 'READY'}</span><small>YOU</small></div>`;
    }
  }
  function renderRoster(target, compact) {
    if (!target || !game) return;
    target.innerHTML = game.players.map((p, i) => {
      const isYou = p.id === localId, color = COLORS[i % COLORS.length];
      if (compact) return `<span class="lobby-player"><i style="background:${color}"></i>${esc(p.name)}${isYou ? '<small> · YOU</small>' : ''}</span>`;
      const status = p.finished ? (p.alive ? 'SURFACED' : 'BUST') : (game.phase === 'lobby' ? 'READY' : `${fmt(p.depth)}m`);
      return `<span class="crew-chip ${isYou ? 'is-you' : ''} ${p.finished && !p.alive ? 'is-out' : ''}"><i style="background:${color}"></i><b>${esc(p.name)}</b><span>${p.finished ? `${fmt(p.score)} ✦` : `${status}${p.loot ? ` · ${fmt(p.loot)}` : ''}`}</span></span>`;
    }).join('');
  }
  function renderFeed() {
    const events = game?.events || [];
    $('#feed').textContent = events.length ? `${events[0].emoji || '✳'} ${events[0].name || 'Crew'} ${events[0].text || 'reacted'}` : 'Waiting for the chaos…';
  }
  function sendProgress(finished = false) {
    if (!game || game.mode !== 'online' || !run) return;
    const data = { type:'progress', depth: Math.floor(run.depth/5), loot: Math.floor(run.loot), streak:run.streak, finished, alive:run.outcome === 'cashed', score:run.payout || 0 };
    if (hostMode) {
      const p = localPlayer(); if (!p) return;
      p.depth = data.depth; p.loot = data.loot; p.streak = data.streak; p.finished = finished; p.alive = data.alive; if (finished) p.score = data.score;
      if (finished) checkRoomFinished(); else broadcast();
    } else if (hostConn?.open) { try { hostConn.send(data); } catch (_) {} }
  }

  function beginDive(seed) {
    const w = Math.max(320, canvas.clientWidth || 800), h = Math.max(300, canvas.clientHeight || 480);
    run = {
      seed: (Number(seed) >>> 0) || 1234567, randomSeed: (Number(seed) >>> 0) || 1234567,
      x: w * .5, yOff: 0, depth: 0, elapsed: 0, loot: 0, payout: 0, streak: 0, lastLootAt: -99,
      oxygen: 100 + (profile.upgrades.tank || 0) * 22, maxOxygen: 100 + (profile.upgrades.tank || 0) * 22,
      hull: 2 + (profile.upgrades.hull || 0), maxHull: 2 + (profile.upgrades.hull || 0),
      dash: 0, dashCooldown: 0, shield: 1, generatedTo: 0, hazards: [], items: [], particles: [], bubbles: [],
      finished: false, outcome: '', clock: 0, nearPass: 0, comboDrop: 0,
    };
    for (let i=0;i<42;i++) run.bubbles.push({x:Math.random()*w,y:Math.random()*h,r:1+Math.random()*3,s:.15+Math.random()*.55,a:.08+Math.random()*.25});
    setView('arena'); $('#resultModal').hidden = true; updateProfileUI(); renderRoom();
  }
  function seeded() {
    run.randomSeed = (Math.imul(run.randomSeed, 1664525) + 1013904223) >>> 0;
    return run.randomSeed / 4294967296;
  }
  function zone() { return Math.floor(run.depth / 760) + 1; }
  function multiplier() { return 1 + Math.min(4.5, (zone() - 1) * .35); }
  function worldTarget(w,h) {
    while (run.generatedTo < run.depth + h * 1.7) {
      const z = Math.floor(run.generatedTo / 760) + 1;
      const row = run.generatedTo + 170 + seeded() * 45;
      const count = Math.min(3, 1 + Math.floor(z / 3));
      for (let i=0;i<count;i++) {
        const kindRoll = seeded(), type = kindRoll < .34 ? 'jelly' : kindRoll < .68 ? 'eel' : 'mine';
        run.hazards.push({ type, depth: row + (i-count/2)*28, baseX: 38 + seeded() * Math.max(1,w-76), amp: Math.min(w*.24,28+seeded()*74), phase: seeded()*7, freq: .45+seeded()*1.1, dir: seeded()<.5?-1:1, r: type==='eel'?19: type==='jelly'?17:15, passed:false, hit:false, color: type==='eel'?'#ff876f':type==='jelly'?'#d67bfa':'#ffd27d' });
      }
      const itemDepth = row + 75 + seeded() * 105;
      const itemRoll = seeded();
      let type = itemRoll < .16 ? 'air' : itemRoll > .965 ? 'jackpot' : itemRoll > .83 ? 'relic' : 'pearl';
      run.items.push({ type, depth:itemDepth, x:45+seeded()*Math.max(1,w-90), phase:seeded()*7, r:type==='jackpot'?13:type==='relic'?11:9, taken:false, value: type==='jackpot'?70+z*8:type==='relic'?22+z*4:7+z*2 });
      run.generatedTo += 224 + seeded()*32;
    }
  }
  function hazardX(h,w) { return Math.max(22,Math.min(w-22,h.baseX + Math.sin(run.elapsed*h.freq+h.phase)*h.amp*h.dir)); }
  function screenY(worldDepth,h) { return h * .64 + worldDepth - run.depth - run.yOff; }
  function pop(text) {
    const el = $('#lootPop'); el.textContent = text; el.classList.remove('is-show'); void el.offsetWidth; el.classList.add('is-show');
    clearTimeout(popTimer); popTimer = setTimeout(() => el.classList.remove('is-show'), 850);
  }
  function burst(x,y,color,count=12) {
    for (let i=0;i<count;i++) { const a=Math.random()*Math.PI*2,s=30+Math.random()*140; run.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.45+Math.random()*.6,max:.8,r:1+Math.random()*3,color}); }
  }
  function playBlip(freq=510, duration=.08, type='triangle') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext; if (!AudioContext) return;
      if (!audio) audio = new AudioContext(); if (audio.state === 'suspended') audio.resume();
      const o=audio.createOscillator(), g=audio.createGain(); o.type=type; o.frequency.setValueAtTime(freq,audio.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(100,freq*.68),audio.currentTime+duration);
      g.gain.setValueAtTime(.04,audio.currentTime); g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration); o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime+duration);
    } catch (_) {}
  }
  function finishDive(outcome) {
    if (!run || run.finished) return;
    if (outcome !== 'cashed') run.lostLoot = run.loot;
    run.finished = true; run.outcome = outcome; run.payout = outcome === 'cashed' ? Math.floor(run.loot * multiplier()) : 0;
    if (outcome === 'cashed') {
      profile.banked += run.payout; profile.best = Math.max(profile.best, Math.floor(run.depth/5)); profile.bestHaul = Math.max(profile.bestHaul, run.payout); saveProfile(); playBlip(740,.23,'sine');
      pop(`+${fmt(run.payout)} SHELLS BANKED`);
    } else { playBlip(160,.3,'sawtooth'); }
    updateProfileUI();
    if (game?.mode === 'solo') { game.phase='result'; if (game.players[0]) { game.players[0].score=run.payout; game.players[0].finished=true; game.players[0].alive=outcome==='cashed'; } showResults(); }
    else if (game?.mode === 'online') {
      sendProgress(true);
      if (game.phase !== 'result') showWaiting();
    }
  }
  function showWaiting() {
    $('#resultModal').hidden = false; $('#resultBadge').className='result-badge'; $('#resultBadge').textContent = 'YOU SURFACED';
    $('#resultTitle').textContent = run?.outcome === 'cashed' ? 'You’re safe. The crew?' : 'The trench got you.';
    $('#resultCopy').textContent = run?.outcome === 'cashed' ? `You banked ${fmt(run.payout)} shells. Your run is done — watch the rest of the crew finish.` : `Your loose shells are gone. Your stash is safe. See who makes it out.`;
    $('#resultRows').innerHTML=''; $('#againButton').textContent='ASK FOR ONE MORE'; $('#waitingCopy').hidden=false; $('#waitingCopy').textContent='Waiting for the rest of the crew to surface…';
  }
  function showResults() {
    if (!game) return;
    const online = game.mode === 'online';
    if (online && game.phase !== 'result') { if (run?.finished) showWaiting(); return; }
    $('#resultModal').hidden = false; $('#waitingCopy').hidden = true;
    const rows = [...(game.players||[])].sort((a,b) => (b.score||0)-(a.score||0)); const winner=rows[0];
    const busted = !online && run?.outcome === 'busted';
    $('#resultBadge').className = `result-badge${busted?' is-bust':''}`;
    $('#resultBadge').textContent = online ? 'CREW RESULTS' : (busted ? 'POCKET BUSTED' : 'CLEAN SURFACE');
    $('#resultTitle').textContent = online ? (winner?.id === localId ? 'Deep End legend.' : `${winner?.name || 'Somebody'} made it out.`) : (busted ? 'The trench said nope.' : 'That’s a clean exit.');
    $('#resultCopy').textContent = online ? 'Same trench. Different nerve. Your bank stays yours; race score is just for the receipts.' : busted ? `You reached ${fmt(run.depth/5)}m and lost ${fmt(run.lostLoot || 0)} loose shells. Your banked stash is untouched.` : `You surfaced at ${fmt(run.depth/5)}m and banked ${fmt(run.payout)} shells. ${run.depth>760?'Deep greed, solid exit.':'The deep is still calling.'}`;
    $('#againButton').textContent = online ? (hostMode ? 'ONE MORE DIVE' : 'ASK FOR ONE MORE') : 'ONE MORE DIVE';
    $('#resultRows').innerHTML = rows.map((p,i) => `<div class="result-row ${i===0?'is-winner':''}"><span>${i===0?'✦ ':''}${esc(p.name)}${p.id===localId?' · YOU':''}${p.alive?'':' · BUST'}</span><b>${fmt(p.score||0)} shells</b></div>`).join('');
  }

  function updateRun(dt,w,h) {
    if (!run || run.finished) return;
    run.elapsed += dt; run.clock += dt;
    const z=zone(), forward=61 + Math.min(74,(z-1)*13);
    run.depth += forward*dt;
    run.dash = Math.max(0,run.dash-dt); run.dashCooldown = Math.max(0,run.dashCooldown-dt); run.shield = Math.max(0,run.shield-dt);
    run.oxygen = Math.max(0,run.oxygen - (2.05 + (z-1)*.11)*dt);
    if (run.oxygen <= 0) { run.lostLoot=run.loot; run.loot=0; pop('OUT OF AIR'); finishDive('busted'); return; }
    worldTarget(w,h);
    let dx=(keys.has('ArrowRight')||keys.has('d')||keys.has('touch-right')?1:0)-(keys.has('ArrowLeft')||keys.has('a')||keys.has('touch-left')?1:0);
    let dy=(keys.has('ArrowDown')||keys.has('s')||keys.has('touch-down')?1:0)-(keys.has('ArrowUp')||keys.has('w')||keys.has('touch-up')?1:0);
    const speed=(run.dash>0?520:245);
    if (pointer?.active) { const diffX=pointer.x-run.x,diffY=pointer.y-(h*.64+run.yOff); dx=Math.abs(diffX)>10?Math.sign(diffX):0;dy=Math.abs(diffY)>10?Math.sign(diffY):0; }
    run.x = Math.max(25,Math.min(w-25,run.x + dx*speed*dt));
    run.yOff = Math.max(-h*.47,Math.min(h*.31,run.yOff + dy*speed*.75*dt));
    const py=h*.64+run.yOff;
    const magnet=18 + (profile.upgrades.magnet||0)*13;
    for (const item of run.items) {
      if (item.taken) continue;
      const iy=screenY(item.depth,h); if (iy < -50 || iy > h+50) continue;
      const bob=Math.sin(run.elapsed*2.5+item.phase)*4, ix=item.x;
      if (Math.hypot(ix-run.x,iy+bob-py) < 19+item.r+magnet) {
        item.taken=true; burst(ix,iy+bob,item.type==='air'?'#65dfec':item.type==='jackpot'?'#ffd27d':'#d6ff75',item.type==='jackpot'?22:12);
        if (item.type==='air') { run.oxygen=Math.min(run.maxOxygen,run.oxygen+31); pop('AIR POCKET +31 O₂'); playBlip(420,.1,'sine'); }
        else {
          const chain = run.elapsed-run.lastLootAt < 3.4 ? Math.min(6,run.streak+1) : 1; run.streak=chain; run.lastLootAt=run.elapsed;
          const base=item.value*(1+(chain-1)*.17); run.loot+=base; run.comboDrop=0;
          if (item.type==='jackpot') { pop(`ABYSS JACKPOT +${fmt(base)} ✦`); playBlip(900,.22,'sawtooth'); }
          else if (item.type==='relic') { pop(`RELIC +${fmt(base)} ✦`); playBlip(700,.13,'triangle'); }
          else { pop(`+${fmt(base)} · STREAK ×${chain}`); playBlip(560+chain*25,.075,'sine'); }
        }
      }
    }
    for (const hazard of run.hazards) {
      if (hazard.hit || hazard.passed) continue;
      const hx=hazardX(hazard,w), hy=screenY(hazard.depth,h), dy=hazard.depth-run.depth-run.yOff, dist=Math.hypot(hx-run.x,dy);
      if (hy < -70) {
        hazard.passed=true;
        if (!hazard.hit && Math.abs(hx-run.x)<hazard.r+51) { run.nearPass++; run.loot+=2+z; run.streak=Math.max(1,run.streak); run.lastLootAt=run.elapsed; burst(run.x,py,'#89f5c1',4); pop(`CLEAN PASS +${2+z} ✦`); }
        continue;
      }
      if (dist < hazard.r+13 && run.shield<=0) {
        hazard.hit=true; run.hull--; run.shield=1.35; run.streak=0;
        run.loot=Math.floor(run.loot*.72); run.comboDrop=1.0; burst(run.x,py,'#ff836f',19); playBlip(210,.18,'square');
        if (run.hull<=0) { run.lostLoot=run.loot; run.loot=0; pop('SUIT BREACHED · POCKET LOST'); finishDive('busted'); return; }
        pop(`SUIT HIT · ${run.hull} AIRLOCK${run.hull===1?'':'S'} LEFT`);
      }
    }
    for (const p of run.particles) { p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.98; p.vy*=.98; p.life-=dt; }
    run.particles=run.particles.filter(p=>p.life>0);
    for (const b of run.bubbles) { b.y-=b.s*48*dt; b.x+=Math.sin(run.elapsed*.7+b.y*.01)*.15; if(b.y<-8){b.y=h+8;b.x=Math.random()*w;} }
    run.hazards=run.hazards.filter(a=>!a.passed || a.depth>run.depth-h*1.4);
    run.items=run.items.filter(a=>!a.taken && a.depth>run.depth-h*1.4);
    if (game?.mode==='online' && run.clock>=.34) { run.clock=0; sendProgress(false); }
  }

  function resizeCanvas(el, c) {
    if (!el || !c) return {w:0,h:0}; const r=el.getBoundingClientRect(); if(!r.width||!r.height)return{w:0,h:0};
    const dpr=Math.min(2,window.devicePixelRatio||1), W=Math.round(r.width*dpr), H=Math.round(r.height*dpr);
    if(el.width!==W||el.height!==H){el.width=W;el.height=H;}
    c.setTransform(dpr,0,0,dpr,0,0); return {w:r.width,h:r.height};
  }
  function resizeGameCanvas(){ resizeCanvas(canvas,ctx); if(run && run.x===0) run.x=canvas.clientWidth*.5; }
  function drawBackground(c,w,h,t,deep=0) {
    const g=c.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#0d313b');g.addColorStop(.46,'#0a2832');g.addColorStop(1,'#071921');c.fillStyle=g;c.fillRect(0,0,w,h);
    const glow=c.createRadialGradient(w*.62,h*.12,4,w*.62,h*.12,w*.76);glow.addColorStop(0,'#45ddb01b');glow.addColorStop(.58,'#1a88951a');glow.addColorStop(1,'transparent');c.fillStyle=glow;c.fillRect(0,0,w,h);
    for(let i=0;i<4;i++){const x=(.12+i*.24)*w, sway=Math.sin(t*.22+i*3)*w*.045;c.save();c.translate(x+sway,0);c.rotate((i-1.5)*.045);const beam=c.createLinearGradient(0,0,0,h*.9);beam.addColorStop(0,i%2?'#73f3cd10':'#63deed14');beam.addColorStop(1,'transparent');c.fillStyle=beam;c.beginPath();c.moveTo(-12,0);c.lineTo(24,0);c.lineTo(150,h);c.lineTo(-130,h);c.closePath();c.fill();c.restore();}
    c.save();c.globalAlpha=.10;c.strokeStyle='#a6fff3';c.lineWidth=1;
    for(let i=0;i<9;i++){const yy=((i*97+deep*.31)%(h+80))-30;c.beginPath();for(let x=0;x<=w;x+=30){const y=yy+Math.sin(x*.013+t*.7+i)*6;if(x===0)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}c.restore();
    return g;
  }
  function drawPearl(c,x,y,r,color='#d6ff75',t=0) {
    c.save();c.translate(x,y);c.rotate(Math.sin(t)*.12);c.shadowColor=color;c.shadowBlur=20;c.fillStyle=color;c.beginPath();c.moveTo(0,-r);c.bezierCurveTo(r*.35,-r*.55,r,r*.14,0,r);c.bezierCurveTo(-r,r*.14,-r*.35,-r*.55,0,-r);c.fill();c.shadowBlur=0;c.fillStyle='#fffbd0';c.beginPath();c.arc(-r*.2,-r*.25,r*.18,0,Math.PI*2);c.fill();c.restore();
  }
  function drawDiver(c,x,y,t,shield=0,scale=1) {
    c.save();c.translate(x,y);c.scale(scale,scale);if(shield>0){c.beginPath();c.arc(0,0,24+Math.sin(t*18)*2,0,Math.PI*2);c.strokeStyle=`rgba(137,245,193,${.32+Math.sin(t*15)*.14})`;c.lineWidth=2;c.stroke();}
    c.shadowColor='#65dfec';c.shadowBlur=18;c.fillStyle='#89f5c1';c.beginPath();c.ellipse(0,5,13,16,0,0,Math.PI*2);c.fill();c.shadowBlur=0;
    c.fillStyle='#d9f9e7';c.beginPath();c.arc(0,-11,11,0,Math.PI*2);c.fill();
    c.fillStyle='#173946';c.beginPath();c.ellipse(0,-11,8,7,0,0,Math.PI*2);c.fill();c.fillStyle='#80f1ec';c.beginPath();c.ellipse(2,-12,4.8,3.4,-.12,0,Math.PI*2);c.fill();
    c.fillStyle='#ffc875';c.beginPath();c.ellipse(0,17,11,4,Math.sin(t*7)*.35,0,Math.PI*2);c.fill();
    c.strokeStyle='#b9ffdf';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(-11,2);c.lineTo(-17,9+Math.sin(t*8)*3);c.moveTo(11,2);c.lineTo(17,8+Math.sin(t*8+1)*3);c.stroke();
    c.fillStyle='#d6ff75';c.beginPath();c.moveTo(9,-2);c.lineTo(32,-8+Math.sin(t*4)*4);c.lineTo(32,4+Math.sin(t*4)*4);c.closePath();c.fill();c.restore();
  }
  function drawJelly(c,x,y,r,t) {
    c.save();c.translate(x,y);c.shadowColor='#dd8bff';c.shadowBlur=17;c.fillStyle='#d78cf2';c.beginPath();c.arc(0,0,r,Math.PI,0);c.quadraticCurveTo(r,r*.65,0,r*.45);c.quadraticCurveTo(-r,r*.65,-r,0);c.fill();c.shadowBlur=0;
    c.strokeStyle='#eebcff';c.lineWidth=2;for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(i*r*.45,r*.35);c.quadraticCurveTo(i*r*.7+Math.sin(t*4+i)*4,r+8,i*r*.4+Math.sin(t*4+i*2)*6,r*1.45);c.stroke();}c.fillStyle='#fff';c.beginPath();c.arc(-r*.3,-r*.08,1.4,0,Math.PI*2);c.arc(r*.27,-r*.08,1.4,0,Math.PI*2);c.fill();c.restore();
  }
  function drawEel(c,x,y,r,t,color='#ff836f') {
    c.save();c.translate(x,y);c.rotate(Math.sin(t*2)*.18);c.shadowColor=color;c.shadowBlur=15;c.fillStyle=color;c.beginPath();c.moveTo(-r*1.7,-r*.1);c.quadraticCurveTo(-r*.3,-r*.9,r*.8,-r*.34);c.quadraticCurveTo(r*1.4,0,r*.8,r*.34);c.quadraticCurveTo(-r*.3,r*.9,-r*1.7,r*.1);c.closePath();c.fill();c.shadowBlur=0;c.fillStyle='#371d26';c.beginPath();c.arc(r*.55,-r*.12,2.3,0,Math.PI*2);c.fill();c.strokeStyle='#ffb09a';c.lineWidth=1.5;c.beginPath();c.moveTo(-r*1.45,0);c.quadraticCurveTo(-r*2,Math.sin(t*5)*6,-r*2.6,Math.sin(t*5+1)*8);c.stroke();c.restore();
  }
  function drawMine(c,x,y,r,t) {
    c.save();c.translate(x,y);c.rotate(t*.2);c.shadowColor='#ffd27d';c.shadowBlur=12;c.fillStyle='#ffbb6f';c.beginPath();c.arc(0,0,r*.7,0,Math.PI*2);c.fill();c.shadowBlur=0;c.strokeStyle='#ffe0a0';c.lineWidth=2;for(let i=0;i<8;i++){c.rotate(Math.PI/4);c.beginPath();c.moveTo(r*.65,0);c.lineTo(r*1.15,0);c.stroke();}c.fillStyle='#523629';c.beginPath();c.arc(0,0,r*.25,0,Math.PI*2);c.fill();c.restore();
  }
  function drawGame() {
    const {w,h}=resizeCanvas(canvas,ctx); if(!w||!h)return;
    const t=run?.elapsed||0, depth=run?.depth||0;drawBackground(ctx,w,h,t,depth);
    if(!run){drawDiver(ctx,w/2,h*.64,t,0,1.2);return;}
    for(const b of run.bubbles){ctx.globalAlpha=b.a;ctx.strokeStyle='#c9fff3';ctx.lineWidth=1;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    // dim reef silhouettes add a sense of speed and scale
    ctx.save();ctx.globalAlpha=.23;ctx.fillStyle='#04151a';for(let side of [0,1]){const x=side? w-9:9;ctx.beginPath();ctx.moveTo(x,h);for(let i=0;i<8;i++){const yy=h-i*(h/8);const reach=(8+Math.sin(t*.6+i*2+side)*9)*(i/8+.4);ctx.lineTo(x+(side?-reach:reach),yy);}ctx.lineTo(x,h);ctx.fill();}ctx.restore();
    for(const item of run.items){if(item.taken)continue;const y=screenY(item.depth,h);if(y<-35||y>h+35)continue;const x=item.x+Math.sin(t*2+item.phase)*4, bob=Math.sin(t*3+item.phase)*4;
      if(item.type==='air'){ctx.save();ctx.shadowColor='#65dfec';ctx.shadowBlur=15;ctx.strokeStyle='#8ceefa';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y+bob,9+Math.sin(t*4+item.phase)*1.2,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#dbffff';ctx.beginPath();ctx.arc(x-3,y+bob-4,2,0,Math.PI*2);ctx.fill();ctx.restore();}
      else {drawPearl(ctx,x,y+bob,item.type==='jackpot'?13:item.type==='relic'?11:9,item.type==='jackpot'?'#ffd27d':item.type==='relic'?'#ffdd8c':'#d6ff75',t+item.phase);if(item.type==='jackpot'){ctx.save();ctx.fillStyle='#fff0ae';ctx.font='900 8px system-ui';ctx.textAlign='center';ctx.fillText('JACKPOT',x,y-19);ctx.restore();}}
    }
    for(const hz of run.hazards){if(hz.passed||hz.hit)continue;const y=screenY(hz.depth,h);if(y<-70||y>h+70)continue;const x=hazardX(hz,w);if(hz.type==='jelly')drawJelly(ctx,x,y,hz.r,t+hz.phase);else if(hz.type==='eel')drawEel(ctx,x,y,hz.r,t+hz.phase);else drawMine(ctx,x,y,hz.r,t);}
    for(const p of run.particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    const px=run.x,py=h*.64+run.yOff;
    // diver's visibility beam
    const beam=ctx.createRadialGradient(px+19,py-9,3,px+25,py,78);beam.addColorStop(0,'#d6ff752b');beam.addColorStop(1,'transparent');ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(px+7,py-4);ctx.lineTo(px+103,py-62);ctx.lineTo(px+107,py+55);ctx.closePath();ctx.fill();
    if(run.shield>0&&Math.floor(t*18)%2===0)ctx.globalAlpha=.47;drawDiver(ctx,px,py,t,run.shield,1);ctx.globalAlpha=1;
    // subtle depth grid ticks
    ctx.save();ctx.globalAlpha=.26;ctx.fillStyle='#b9e8dc';ctx.font='700 7px ui-monospace,monospace';for(let i=0;i<6;i++){const y=((i*112+depth*.55)%(h+30))-10;ctx.fillRect(w-21,y,9,1);if(i%2===0)ctx.fillText(`${Math.max(0,Math.floor((depth+y-h*.64)/5))}m`,w-42,y-4);}ctx.restore();
  }
  function drawPreview() {
    const {w,h}=resizeCanvas(previewCanvas,previewCtx);if(!w||!h)return;previewTime+=.016;const c=previewCtx,t=previewTime;drawBackground(c,w,h,t,1000+t*30);
    for(let i=0;i<28;i++){const x=(i*83+Math.sin(t*.6+i)*20)%w,y=(i*59-t*(13+i%4)*5)%(h+20);c.globalAlpha=.09+(i%4)*.025;c.fillStyle='#b4fff2';c.beginPath();c.arc((x+w)%w,(y+h)%h,1+i%3,0,Math.PI*2);c.fill();}c.globalAlpha=1;
    // glowing trench gate
    const gy=h*.54+Math.sin(t*.9)*11;c.save();c.globalAlpha=.55;c.strokeStyle='#48e2ba';c.lineWidth=2;c.shadowColor='#48e2ba';c.shadowBlur=14;c.beginPath();c.moveTo(w*.18,gy-35);c.bezierCurveTo(w*.36,gy-10,w*.62,gy-61,w*.82,gy-20);c.stroke();c.restore();
    drawEel(c,w*.74,gy+70,18,t,'#ff836f');drawJelly(c,w*.28,gy+125,17,t+1);drawMine(c,w*.54,gy+22,14,t);
    drawPearl(c,w*.48,gy+105,12,'#d6ff75',t);drawPearl(c,w*.82,gy+178,9,'#ffd27d',t+2);
    const dx=w*.48+Math.sin(t*.95)*w*.15,dy=h*.59+Math.cos(t*1.4)*h*.08;drawDiver(c,dx,dy,t,0,1.25);
    // surface shafts
    c.save();c.globalAlpha=.25;c.fillStyle='#8df2c6';for(let i=0;i<5;i++){const bx=(i+1)*w/6+Math.sin(t*.4+i)*20;c.beginPath();c.ellipse(bx,h*.15,2+Math.sin(t+i)*.8,5+Math.cos(t*2+i)*2,0,0,Math.PI*2);c.fill();}c.restore();
  }
  function updateHud() {
    if(!run)return;
    const z=zone(), m=multiplier(), meters=Math.floor(run.depth/5), left=(run.depth%760)/760;
    $('#bankedHud').textContent=fmt(profile.banked);$('#lootHud').textContent=fmt(run.loot);$('#streakHud').textContent=`STREAK ×${Math.max(1,run.streak)}`;
    $('#multiplierHud').textContent=m.toFixed(1);$('#depthHud').textContent=`${meters} m · ${ZONES[Math.min(ZONES.length-1,z-1)]}`;
    $('#oxygenFill').style.width=`${Math.max(0,run.oxygen/run.maxOxygen*100)}%`;
    $('#oxygenFill').style.background=run.oxygen<25?'linear-gradient(90deg,#ff836f,#ffd27d)':'linear-gradient(90deg,#57dfcc,#d2ff75)';
    $('#hullHud').textContent='♥ '.repeat(Math.max(0,run.hull)).trim()||'♡';
    $('#depthTicker b').textContent=String(meters).padStart(3,'0');$('#zoneLabel').textContent=`ZONE ${String(z).padStart(2,'0')} / ${ZONES[Math.min(ZONES.length-1,z-1)]}`;
    $('#runStatus').innerHTML=run.finished?'<i class="rec-dot"></i> RUN COMPLETE':'<i class="rec-dot"></i> DIVE LIVE';
    $('#dashCooldown').textContent=run.dashCooldown>0?`${run.dashCooldown.toFixed(1)}s`:'READY';$('#dashButton').disabled=run.dashCooldown>0||run.finished;
    $('#cashoutButton').disabled=run.finished;
    $('#actionCopy').textContent=run.oxygen<25?'O₂ CRITICAL. Find an air pocket or surface now.':`Depth ${z} · x${m.toFixed(1)} payout · don't get greedy.`;
    if(game?.mode==='online')renderRoom();
  }
  function dash() { if(!run||run.finished||run.dashCooldown>0)return;run.dash=.48;run.dashCooldown=3.25;run.shield=Math.max(run.shield,.52);playBlip(350,.11,'sawtooth');burst(run.x,canvas.clientHeight*.64+run.yOff,'#65dfec',7); }
  function collectKey(e,down) {
    const tag=document.activeElement?.tagName;if(tag==='INPUT'||tag==='TEXTAREA')return;
    const k=e.key.length===1?e.key.toLowerCase():e.key;
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Spacebar'].includes(e.key))e.preventDefault();
    if(down){if(k===' '||k==='Spacebar'){dash();return;}if(k==='c'){if(run&&!run.finished)finishDive('cashed');return;}keys.add(k);}
    else keys.delete(k);
  }

  $('#playSolo').addEventListener('click',startSolo);
  $('#createRoom').addEventListener('click',createRoom);
  $('#joinRoom').addEventListener('click',()=>joinRoom($('#roomCode').value));
  $('#roomCode').addEventListener('keydown',e=>{if(e.key==='Enter')joinRoom($('#roomCode').value)});
  $('#nickname').addEventListener('change',currentName);
  $('#leaveGame').addEventListener('click',goHome);$('#brandHome').addEventListener('click',e=>{if(!gameScreen.hidden){e.preventDefault();goHome();}});
  $('#startRoom').addEventListener('click',hostStartRoom);
  $('#copyInvite').addEventListener('click',()=>copyText(makeInviteLink()));$('#shareRoom').addEventListener('click',()=>copyText(makeInviteLink()));
  $('#dashButton').addEventListener('click',dash);$('#cashoutButton').addEventListener('click',()=>{if(run&&!run.finished)finishDive('cashed');});
  $('#homeButton').addEventListener('click',goHome);
  $('#againButton').addEventListener('click',()=>{
    if(game?.mode==='online'){
      if(hostMode)startRoomRun();else{hostConn?.send({type:'again'});$('#againButton').disabled=true;$('#waitingCopy').hidden=false;$('#waitingCopy').textContent='Replay request sent. The room host can restart the crew.';}
    }else startSolo();
  });
  document.querySelectorAll('[data-upgrade]').forEach(b=>b.addEventListener('click',()=>buyUpgrade(b.dataset.upgrade)));
  document.querySelectorAll('.reaction').forEach(b=>b.addEventListener('click',()=>sendReaction(b.dataset.reaction)));
  document.querySelectorAll('.touch-controls [data-dir]').forEach(b=>{
    const k=`touch-${b.dataset.dir}`;const start=e=>{e.preventDefault();keys.add(k);b.setPointerCapture?.(e.pointerId);};const end=e=>{e.preventDefault();keys.delete(k);};
    b.addEventListener('pointerdown',start);b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);b.addEventListener('lostpointercapture',end);
  });
  canvas.addEventListener('pointerdown',e=>{if(!run||run.finished)return;canvas.setPointerCapture?.(e.pointerId);const r=canvas.getBoundingClientRect();pointer={active:true,x:e.clientX-r.left,y:e.clientY-r.top};});
  canvas.addEventListener('pointermove',e=>{if(!pointer?.active)return;const r=canvas.getBoundingClientRect();pointer.x=e.clientX-r.left;pointer.y=e.clientY-r.top;});
  canvas.addEventListener('pointerup',()=>{if(pointer)pointer.active=false;});canvas.addEventListener('pointercancel',()=>{if(pointer)pointer.active=false;});
  window.addEventListener('keydown',e=>collectKey(e,true));window.addEventListener('keyup',e=>collectKey(e,false));window.addEventListener('blur',()=>{keys.clear();if(pointer)pointer.active=false;});window.addEventListener('resize',resizeGameCanvas);

  function frame(ts) {
    const dt=lastFrame?Math.min(.05,(ts-lastFrame)/1000):0;lastFrame=ts;
    if(!home.hidden)drawPreview();
    if(!gameScreen.hidden&&!arena.hidden){if(game?.phase==='playing'&&run&&!run.finished){const r=canvas.getBoundingClientRect();updateRun(dt,r.width,r.height);if(!run.finished)drawGame();}else drawGame();if(ts-lastHud>100){updateHud();lastHud=ts;}}
    requestAnimationFrame(frame);
  }
  try { const saved=localStorage.getItem('deepend-name');if(saved)$('#nickname').value=safeName(saved); } catch (_) {}
  updateProfileUI();
  const roomParam=new URL(location.href).searchParams.get('room');
  if(roomParam){$('#roomCode').value=roomParam;setTimeout(()=>joinRoom(roomParam),350);}
  requestAnimationFrame(frame);
})();
