(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const home = $('#home');
  const table = $('#table');
  const COLORS = ['#51a994', '#ba88d1', '#d89572', '#76a5da', '#d3ad64', '#86b8a4'];
  const MAX_ROUNDS = 4;
  const GRID_SIZE = 5;
  const MAX_PLAYERS = 6;
  const NAMES = ['Moss', 'Lag Wizard', 'soup era'];
  let game = null;
  let peer = null;
  let localId = null;
  let hostMode = false;
  let hostConn = null;
  const connections = new Map();
  let botTimer = null;
  let toastTimer = null;

  const safeName = (value) => (String(value || '').trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, 14) || 'Diver');
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isRoomHost = () => !!game && game.mode === 'online' && hostMode;
  const isLocalMode = () => !!game && game.mode === 'solo';
  const myTurn = () => !!game && game.players[game.turnIndex]?.id === localId;
  const activePlayer = () => game?.players?.[game.turnIndex] || null;
  const fmt = (n) => new Intl.NumberFormat('en-US').format(n || 0);

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), 2500);
  }

  function setHomeNotice(message) { $('#homeNotice').textContent = message || ''; }
  function setLobbyNotice(message) { $('#lobbyStatus').textContent = message || ''; }

  function nameFromInput() {
    const name = safeName($('#nickname').value);
    $('#nickname').value = name;
    try { localStorage.setItem('deepend-name', name); } catch (_) {}
    return name;
  }

  function destroyNetwork() {
    clearTimeout(botTimer);
    botTimer = null;
    try { hostConn?.close(); } catch (_) {}
    hostConn = null;
    for (const conn of connections.values()) { try { conn.close(); } catch (_) {} }
    connections.clear();
    try { peer?.destroy(); } catch (_) {}
    peer = null;
    hostMode = false;
    localId = null;
  }

  function goHome() {
    destroyNetwork();
    game = null;
    table.hidden = true;
    home.hidden = false;
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState({}, '', url);
    setHomeNotice('');
  }

  function makeInviteLink() {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    if (game?.hostId) url.searchParams.set('room', game.hostId);
    return url.toString();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied. Send it to the group chat.');
      return true;
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = text;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand('copy');
      input.remove();
      toast(ok ? 'Copied. Send it to the group chat.' : 'Copy failed — select the invite text instead.');
      return ok;
    }
  }

  function makePlayer(id, name, index, extra = {}) {
    return { id, name: safeName(name), color: COLORS[index % COLORS.length], score: 0, roundStart: 0, busted: false, connected: true, isBot: false, ...extra };
  }

  function createBoard(round) {
    const countMines = Math.min(4 + round - 1, 7);
    const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({ index, mine: false, relic: false, value: 1 + Math.floor(Math.random() * 3), revealed: false, claimedBy: '', payout: 0, adjacent: 0 }));
    const order = cells.map((_, index) => index).sort(() => Math.random() - 0.5);
    for (const index of order.slice(0, countMines)) cells[index].mine = true;
    const safeIndices = order.slice(countMines);
    for (const index of safeIndices.slice(0, 3)) { cells[index].relic = true; cells[index].value = 5 + Math.floor(Math.random() * 3); }
    for (const cell of cells) {
      if (cell.mine) continue;
      cell.adjacent = neighbors(cell.index).filter((index) => cells[index].mine).length;
    }
    return { cells, mineCount: countMines };
  }

  function neighbors(index) {
    const row = Math.floor(index / GRID_SIZE);
    const col = index % GRID_SIZE;
    const result = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const y = row + dy, x = col + dx;
      if (y >= 0 && y < GRID_SIZE && x >= 0 && x < GRID_SIZE) result.push(y * GRID_SIZE + x);
    }
    return result;
  }

  function resetRound(round) {
    const field = createBoard(round);
    game.round = round;
    game.cells = field.cells;
    game.mineCount = field.mineCount;
    game.held = 0;
    game.turnDigs = 0;
    game.turnsDone = 0;
    game.turnIndex = 0;
    game.lastRoundGain = {};
    game.events = [];
    for (const player of game.players) { player.busted = false; player.roundStart = player.score; }
    game.phase = 'playing';
    game.message = `Depth ${String(round).padStart(2, '0')} is live. Find loot; don't get cocky.`;
  }

  function startSolo() {
    destroyNetwork();
    localId = 'solo-player';
    hostMode = true;
    const player = makePlayer(localId, nameFromInput(), 0);
    const bots = NAMES.map((name, index) => makePlayer(`bot-${index}`, name, index + 1, { isBot: true }));
    game = { mode: 'solo', phase: 'playing', hostId: localId, players: [player, ...bots], round: 1, cells: [], mineCount: 4, held: 0, turnDigs: 0, turnsDone: 0, turnIndex: 0, lastRoundGain: {}, events: [], message: '', maxDigs: 3 };
    resetRound(1);
    showTable();
    afterUpdate();
  }

  function showTable() {
    home.hidden = true;
    table.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function createRoom() {
    if (typeof window.Peer !== 'function') { setHomeNotice('Room play could not load. Solo still works — try refreshing for multiplayer.'); return; }
    destroyNetwork();
    setHomeNotice('Finding a signal…');
    try {
      peer = new window.Peer();
      peer.on('open', (id) => {
        localId = id;
        hostMode = true;
        const player = makePlayer(id, nameFromInput(), 0);
        game = { mode: 'online', phase: 'lobby', hostId: id, players: [player], round: 1, cells: [], mineCount: 4, held: 0, turnDigs: 0, turnsDone: 0, turnIndex: 0, lastRoundGain: {}, events: [], message: 'Waiting for the crew…', maxDigs: 3 };
        showTable();
        setHomeNotice('');
        setLobbyNotice('Room ready. Invite the group, then start whenever.');
        render();
      });
      peer.on('connection', (conn) => acceptGuest(conn));
      peer.on('error', (error) => {
        const message = error?.type === 'unavailable-id' ? 'Room code is already in use. Make a new room.' : 'Room signal lost. Try a fresh room or play solo.';
        if (!game) setHomeNotice(message); else { toast(message); if (game.phase === 'lobby') setLobbyNotice(message); }
      });
      peer.on('disconnected', () => { if (game?.phase === 'lobby') setLobbyNotice('Signal paused. Your invite may not connect until it comes back.'); });
    } catch (_) { setHomeNotice('Could not open a room. Solo still works.'); }
  }

  function acceptGuest(conn) {
    conn.on('data', (message) => onHostMessage(conn, message));
    conn.on('close', () => {
      const player = game?.players?.find((item) => item.id === conn.peer);
      connections.delete(conn.peer);
      if (player && game.phase === 'lobby') {
        game.players = game.players.filter((item) => item.id !== player.id);
        game.events.unshift({ text: `${player.name} left the room`, emoji: '◌' });
        game.events = game.events.slice(0, 4);
        afterUpdate();
        return;
      }
      if (player) {
        player.connected = false;
        game.events.unshift({ text: `${player.name} lost signal`, emoji: '◌' });
        game.events = game.events.slice(0, 4);
        if (game.phase === 'playing' && activePlayer()?.id === player.id) {
          game.held = 0;
          game.turnDigs = 0;
          game.message = `${player.name} lost signal. Their turn was skipped; their bank is safe.`;
          finishTurn(player.id, true);
        } else afterUpdate();
      }
    });
    conn.on('error', () => { /* disconnect event handles the visible state */ });
  }

  function joinRoom(code) {
    const roomId = String(code || '').trim();
    if (!roomId) { setHomeNotice('Paste a room link or room code first.'); return; }
    if (typeof window.Peer !== 'function') { setHomeNotice('Room play could not load. Solo still works — try refreshing for multiplayer.'); return; }
    destroyNetwork();
    setHomeNotice('Joining the room…');
    try {
      peer = new window.Peer();
      peer.on('open', (id) => {
        localId = id;
        hostMode = false;
        hostConn = peer.connect(roomId, { reliable: true });
        hostConn.on('open', () => {
          hostConn.send({ type: 'hello', name: nameFromInput() });
          setHomeNotice('Connected — syncing the field…');
        });
        hostConn.on('data', (message) => onGuestMessage(message));
        hostConn.on('close', () => toast('The room connection closed.'));
        hostConn.on('error', () => setHomeNotice('Could not reach that room. Check the invite and try again.'));
      });
      peer.on('error', (error) => setHomeNotice(error?.type === 'peer-unavailable' ? 'That room is offline or the code expired.' : 'Could not join the room. Try the invite link again.'));
    } catch (_) { setHomeNotice('Could not join the room. Try the invite link again.'); }
  }

  function onHostMessage(conn, message) {
    if (!message || !game || game.mode !== 'online' || !hostMode) return;
    const id = conn.peer;
    if (message.type === 'hello') {
      if (game.phase !== 'lobby') { conn.send({ type: 'reject', message: 'This dive already started.' }); return; }
      if (game.players.length >= MAX_PLAYERS) { conn.send({ type: 'reject', message: 'This room is full.' }); return; }
      if (!game.players.some((player) => player.id === id)) game.players.push(makePlayer(id, message.name, game.players.length));
      connections.set(id, conn);
      broadcast();
      setLobbyNotice('Room ready. Invite the group, then start whenever.');
      return;
    }
    if (message.type === 'react') {
      const player = game.players.find((item) => item.id === id);
      if (player && ['👀', '💀', '🫡', '🐸'].includes(message.emoji)) {
        game.events.unshift({ name: player.name, emoji: message.emoji, text: `${player.name} reacted` });
        game.events = game.events.slice(0, 4);
        broadcast();
      }
      return;
    }
    hostAction(message.type, id, message);
  }

  function onGuestMessage(message) {
    if (!message) return;
    if (message.type === 'state') {
      game = message.state;
      render();
      return;
    }
    if (message.type === 'reject') {
      setHomeNotice(message.message || 'The host could not add you.');
      toast(message.message || 'The host could not add you.');
      return;
    }
    if (message.type === 'toast') toast(message.message);
  }

  function broadcast() {
    render();
    if (!isRoomHost()) return;
    const snapshot = JSON.parse(JSON.stringify(game));
    for (const [id, conn] of connections) {
      if (conn.open) { try { conn.send({ type: 'state', state: snapshot }); } catch (_) {} }
      else if (!game.players.some((player) => player.id === id && player.connected)) connections.delete(id);
    }
  }

  function afterUpdate() {
    if (game?.mode === 'online' && hostMode) broadcast();
    else { render(); scheduleBot(); }
  }

  function emit(type, payload = {}) {
    if (!game) return;
    if (game.mode === 'online' && !hostMode) {
      if (type === 'react') hostConn?.send({ type, ...payload });
      else if (hostConn?.open) hostConn.send({ type, ...payload });
      return;
    }
    hostAction(type, localId, payload);
  }

  function hostAction(type, actorId, payload = {}) {
    if (!game) return;
    if (type === 'start') {
      if (!isRoomHost() || actorId !== game.hostId || game.phase !== 'lobby') return;
      if (!game.players.length) return;
      resetRound(1);
      broadcast();
      return;
    }
    if (type === 'next') {
      if (game.phase !== 'roundover' || actorId !== game.hostId) return;
      if (game.round >= MAX_ROUNDS) { game.phase = 'gameover'; game.message = 'That is the whole trench. Check the receipts.'; afterUpdate(); return; }
      resetRound(game.round + 1);
      afterUpdate();
      return;
    }
    if (type === 'react') {
      const player = game.players.find((item) => item.id === actorId);
      if (!player || !['👀', '💀', '🫡', '🐸'].includes(payload.emoji)) return;
      game.events.unshift({ name: player.name, emoji: payload.emoji, text: `${player.name} reacted` });
      game.events = game.events.slice(0, 4);
      afterUpdate();
      return;
    }
    if (game.phase !== 'playing' || game.players[game.turnIndex]?.id !== actorId) return;
    if (type === 'dig') revealCell(actorId, Number(payload.index));
    if (type === 'bank') bankTurn(actorId);
  }

  function revealCell(actorId, index) {
    if (!Number.isInteger(index) || index < 0 || index >= game.cells.length) return;
    const cell = game.cells[index];
    if (!cell || cell.revealed || game.turnDigs >= game.maxDigs) return;
    const player = game.players[game.turnIndex];
    if (player?.id !== actorId) return;
    cell.revealed = true;
    cell.claimedBy = actorId;
    if (cell.mine) {
      player.busted = true;
      game.held = 0;
      game.message = `${player.name} hit a charge. Their pocket is gone; their bank is safe.`;
      finishTurn(actorId, true);
      return;
    }
    const multiplier = [1, 1.5, 2][game.turnDigs] || 2;
    const payout = Math.round(cell.value * multiplier);
    cell.payout = payout;
    game.held += payout;
    game.turnDigs += 1;
    game.message = cell.relic ? `${player.name} found a relic: +${payout} shards. The room is staring.` : `${player.name} pulled +${payout} shards. Keep digging or bank it?`;
    if (game.turnDigs >= game.maxDigs) { finishTurn(actorId, false); return; }
    if (game.cells.every((item) => item.revealed)) { finishTurn(actorId, false); return; }
    afterUpdate();
  }

  function bankTurn(actorId) {
    if (!game || game.phase !== 'playing' || game.players[game.turnIndex]?.id !== actorId) return;
    if (!game.held) return;
    const player = game.players[game.turnIndex];
    game.message = `${player.name} banked ${game.held} shards and dipped.`;
    finishTurn(actorId, false);
  }

  function finishTurn(actorId, busted) {
    const player = game.players.find((item) => item.id === actorId);
    if (!player) return;
    if (!busted && game.held > 0) {
      player.score += game.held;
      game.lastRoundGain[player.id] = (game.lastRoundGain[player.id] || 0) + game.held;
    } else if (!Object.hasOwn(game.lastRoundGain, player.id)) game.lastRoundGain[player.id] = 0;
    game.held = 0;
    game.turnDigs = 0;
    game.turnsDone += 1;
    while (game.turnsDone < game.players.length && game.players[game.turnsDone] && !game.players[game.turnsDone].connected) game.turnsDone += 1;
    if (game.turnsDone >= game.players.length || game.cells.every((cell) => cell.revealed)) {
      game.phase = game.round >= MAX_ROUNDS ? 'gameover' : 'roundover';
      game.message = game.phase === 'gameover' ? 'The last dive is done. Who played it cool?' : `Depth ${String(game.round).padStart(2, '0')} is cleared.`;
    } else {
      game.turnIndex = game.turnsDone;
    }
    afterUpdate();
  }

  function estimateRisk(index) {
    const cell = game.cells[index];
    const hidden = game.cells.filter((item) => !item.revealed).length;
    const seenMines = game.cells.filter((item) => item.revealed && item.mine).length;
    let risk = Math.max(0.02, (game.mineCount - seenMines) / Math.max(1, hidden));
    for (const clueIndex of neighbors(index)) {
      const clue = game.cells[clueIndex];
      if (!clue.revealed || clue.mine) continue;
      const unknown = neighbors(clueIndex).map((i) => game.cells[i]).filter((item) => !item.revealed).length;
      const knownMines = neighbors(clueIndex).map((i) => game.cells[i]).filter((item) => item.revealed && item.mine).length;
      if (unknown > 0) risk = Math.max(risk, Math.max(0, clue.adjacent - knownMines) / unknown);
    }
    return Math.min(0.99, risk);
  }

  function chooseBotCell() {
    const candidates = game.cells.filter((cell) => !cell.revealed).map((cell) => ({ cell, risk: estimateRisk(cell.index) }));
    candidates.sort((a, b) => a.risk - b.risk || Math.random() - 0.5);
    return candidates[0]?.cell;
  }

  function scheduleBot() {
    clearTimeout(botTimer);
    if (!isLocalMode() || game.phase !== 'playing') return;
    const player = activePlayer();
    if (!player?.isBot) return;
    botTimer = setTimeout(() => {
      if (!game || game.phase !== 'playing' || !activePlayer()?.isBot) return;
      if (game.held > 0 && game.turnDigs > 0) {
        const best = chooseBotCell();
        const risk = best ? estimateRisk(best.index) : 1;
        const greed = [0.72, 0.9, 1.08][Number(player.id.slice(-1)) % 3];
        const target = greed * (4 + game.round * 2 + game.turnDigs * 2);
        if (game.held >= target || (game.turnDigs >= 2 && risk > 0.32 && Math.random() > 0.25)) {
          hostAction('bank', player.id);
          return;
        }
      }
      const next = chooseBotCell();
      if (!next) { bankTurn(player.id); return; }
      revealCell(player.id, next.index);
    }, 730 + Math.floor(Math.random() * 380));
  }

  function renderRoster(target, lobby = false) {
    const list = target;
    if (!game) { list.innerHTML = ''; return; }
    const html = game.players.map((player, index) => {
      const active = game.phase === 'playing' && index === game.turnIndex;
      const you = player.id === localId;
      const status = player.busted ? 'BUSTED THIS DEPTH' : !player.connected ? 'SIGNAL LOST' : '';
      if (lobby) return `<span class="lobby-player"><i></i>${esc(player.name)}${you ? ' · you' : ''}</span>`;
      return `<div class="roster-item ${active ? 'is-active' : ''} ${you ? 'is-you' : ''} ${player.busted ? 'is-out' : ''}"><span class="roster-avatar" style="--avatar:${player.color}">${esc(player.name.slice(0,1).toUpperCase())}</span><span class="roster-name" title="${esc(status || player.name)}">${esc(player.name)}</span><span class="roster-score">${fmt(player.score)} ✦</span></div>`;
    }).join('');
    list.innerHTML = html;
  }

  function renderFeed() {
    $('#feed').innerHTML = (game?.events || []).slice(0, 3).map((event) => `<div class="feed__item"><span>${esc(event.emoji || '✳')}</span><span><b>${esc(event.name || 'Crew')}</b> ${esc(event.emoji ? 'reacted' : event.text || '')}</span></div>`).join('');
  }

  function renderGrid() {
    const grid = $('#grid');
    const player = activePlayer();
    const canDig = game.phase === 'playing' && player?.id === localId && game.turnDigs < game.maxDigs;
    const colors = ['#79d6e2', '#8cf1c5', '#ffc875', '#ff9a77', '#b99bea', '#a2d071', '#ea8fa7', '#e5d37c'];
    grid.innerHTML = game.cells.map((cell) => {
      const disabled = !canDig || cell.revealed;
      let classes = 'tile';
      let inside = '<span class="tile-mark">〰</span><i class="tile-dots"></i>';
      let label = `Covered tile ${cell.index + 1}`;
      if (cell.revealed && cell.mine) {
        classes += ' tile--revealed tile--mine';
        inside = '<span class="tile-reward">✹</span>';
        label = `Mine at tile ${cell.index + 1}`;
      } else if (cell.revealed) {
        classes += ` tile--revealed ${cell.relic ? 'tile--relic' : 'tile--safe'} tile--taken`;
        const clue = cell.adjacent === 0 ? '·' : cell.adjacent;
        inside = `<span class="tile-clue" style="--clue:${colors[(cell.adjacent - 1 + 8) % 8]}">${clue}</span><span class="tile-reward">+${cell.payout}</span>`;
        label = `${cell.relic ? 'Relic' : 'Loot'} plus ${cell.payout} shards, ${cell.adjacent} nearby charges`;
      }
      return `<button class="${classes}" type="button" role="gridcell" data-index="${cell.index}" aria-label="${label}" ${disabled ? 'disabled' : ''}>${inside}</button>`;
    }).join('');
    grid.querySelectorAll('.tile:not(:disabled)').forEach((button) => button.addEventListener('click', () => emit('dig', { index: Number(button.dataset.index) })));
  }

  function renderRecap(container, final = false) {
    if (!game) return;
    const rows = [...game.players].sort((a, b) => b.score - a.score);
    const winner = rows[0];
    container.innerHTML = rows.map((player, index) => {
      const gain = player.score - player.roundStart;
      const earned = final ? player.score : (game.lastRoundGain[player.id] ?? gain);
      return `<div class="recap-row ${index === 0 ? 'is-winner' : ''}"><span>${index === 0 ? '✦ ' : ''}${esc(player.name)}${player.id === localId ? ' · you' : ''}</span><b>${final ? `${fmt(player.score)} total` : `+${fmt(earned)} this depth`}</b></div>`;
    }).join('');
  }

  function render() {
    if (!game) return;
    home.hidden = true;
    table.hidden = false;
    const lobby = game.phase === 'lobby';
    const playing = game.phase === 'playing';
    $('#lobbyPane').hidden = !lobby;
    $('#fieldPane').hidden = lobby;
    $('#roundModal').hidden = game.phase !== 'roundover';
    $('#gameOverModal').hidden = game.phase !== 'gameover';
    $('#depthTitle').textContent = `Depth ${String(game.round).padStart(2, '0')} / 0${MAX_ROUNDS}`;
    $('#potValue').textContent = fmt(game.held);
    $('#crewCount').textContent = `${game.players.length}`;
    $('#mineCount').textContent = `${game.mineCount} charges`;
    $('#multiplierLabel').textContent = game.turnDigs ? `Next clean dig pays ×${game.turnDigs === 1 ? '1.5' : '2'}` : 'Your turn starts at ×1';
    const active = activePlayer();
    const turnCard = $('#turnCard');
    if (playing) {
      turnCard.innerHTML = `<div class="turn-card__label">${active?.id === localId ? 'Your turn' : `${esc(active?.name || 'Crew')}'s turn`}</div><div class="turn-card__name">${active?.id === localId ? 'Make it count.' : 'Watch the field.'}</div><div class="turn-card__sub">${game.turnDigs ? `${game.turnDigs} safe dig${game.turnDigs === 1 ? '' : 's'} · ${fmt(game.held)} at risk` : 'First dig pays ×1'}</div>`;
    } else if (lobby) {
      turnCard.innerHTML = `<div class="turn-card__label">Room status</div><div class="turn-card__name">${game.players.length} / ${MAX_PLAYERS} divers</div><div class="turn-card__sub">Up to 6 people. One shared field.</div>`;
    } else {
      turnCard.innerHTML = `<div class="turn-card__label">${game.phase === 'gameover' ? 'Dive complete' : 'Depth complete'}</div><div class="turn-card__name">${esc(game.message || '')}</div><div class="turn-card__sub">Banked shards stay yours.</div>`;
    }
    renderRoster($('#roster'));
    renderRoster($('#lobbyRoster'), true);
    renderFeed();

    const invite = makeInviteLink();
    const inviteLabel = game.hostId ? `${location.host}${new URL(invite).pathname}?room=${game.hostId}` : 'room link will appear';
    $('#inviteCode').textContent = inviteLabel;
    $('#copyInvite').disabled = !game.hostId;
    $('#shareRoom').hidden = game.mode !== 'online';
    $('#startGame').hidden = !isRoomHost() || !lobby;
    $('#lobbyStatus').hidden = !lobby || isRoomHost();
    if (isRoomHost() && lobby) $('#lobbyStatus').hidden = true;
    const canAdvance = isRoomHost() || (game.mode === 'solo' && localId === game.hostId);
    $('#nextRound').hidden = !canAdvance;
    $('#roundWait').hidden = canAdvance || game.mode !== 'online';
    $('#startGame').disabled = !isRoomHost() || game.players.length < 1;
    $('#nextRound').disabled = !canAdvance;
    $('#fieldTitle').textContent = playing ? (active?.id === localId ? 'Your move. No pressure.' : `${active?.name || 'Crew'} is on the board.`) : 'Round complete.';
    $('#digsLeft').textContent = `${Math.max(0, game.maxDigs - game.turnDigs)} dig${game.maxDigs - game.turnDigs === 1 ? '' : 's'} left`;
    $('#statusMessage').textContent = game.message || 'Pick a covered tile to dig.';
    $('#bank').disabled = !playing || active?.id !== localId || game.held <= 0;
    $('#bank').innerHTML = `<span>${game.held > 0 ? `Bank ${fmt(game.held)} &amp; pass` : 'Cash out & pass'}</span><span class="button__arrow">→</span>`;
    if (!lobby) renderGrid();
    if (game.phase === 'roundover') {
      $('#roundTitle').textContent = `Depth ${String(game.round).padStart(2, '0')} cleared.`;
      $('#roundCopy').textContent = 'Everybody got one turn. The field resets — your bank does not.';
      $('#roundRecap').innerHTML = '';
      renderRecap($('#roundRecap'));
      $('#nextRound').textContent = game.round >= MAX_ROUNDS ? 'See final tally' : 'Drop deeper';
    }
    if (game.phase === 'gameover') {
      const winner = [...game.players].sort((a, b) => b.score - a.score)[0];
      $('#overTitle').textContent = winner?.id === localId ? 'You ran the trench.' : `${winner?.name || 'Somebody'} ran the trench.`;
      $('#overCopy').textContent = `Four depths. One shared field. ${winner?.name || 'The winner'} banked the most shards.`;
      renderRecap($('#finalRecap'), true);
      if (game.mode === 'solo') {
        try {
          const best = Number(localStorage.getItem('deepend-best') || 0);
          if ((game.players.find((p) => p.id === localId)?.score || 0) > best) localStorage.setItem('deepend-best', String(game.players.find((p) => p.id === localId)?.score || 0));
        } catch (_) {}
      }
    }
  }

  $('#playSolo').addEventListener('click', startSolo);
  $('#createRoom').addEventListener('click', createRoom);
  $('#joinRoom').addEventListener('click', () => {
    const input = $('#roomCode').value.trim();
    let code = input;
    try { if (input.includes('://')) code = new URL(input).searchParams.get('room') || input; } catch (_) {}
    joinRoom(code);
  });
  $('#roomCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') $('#joinRoom').click(); });
  $('#startGame').addEventListener('click', () => emit('start'));
  $('#bank').addEventListener('click', () => emit('bank'));
  $('#copyInvite').addEventListener('click', () => copyText(makeInviteLink()));
  $('#shareRoom').addEventListener('click', () => copyText(makeInviteLink()));
  $('#nextRound').addEventListener('click', () => emit('next'));
  $('#leaveGame').addEventListener('click', goHome);
  $('#playAgain').addEventListener('click', goHome);
  $('#shareScore').addEventListener('click', () => {
    const scores = [...(game?.players || [])].sort((a, b) => b.score - a.score).map((player, i) => `${i + 1}. ${player.name}: ${player.score}`).join('\n');
    copyText(`DEEP END — Harkade\n${scores}\nThink you can do better?`);
  });
  document.querySelectorAll('.reaction').forEach((button) => button.addEventListener('click', () => emit('react', { emoji: button.dataset.reaction })));

  try {
    const savedName = localStorage.getItem('deepend-name');
    if (savedName) $('#nickname').value = safeName(savedName);
  } catch (_) {}

  const roomFromLink = new URL(location.href).searchParams.get('room');
  if (roomFromLink) {
    $('#roomCode').value = roomFromLink;
    setTimeout(() => joinRoom(roomFromLink), 250);
  }
})();
