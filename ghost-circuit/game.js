(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const els = {
    home: $("#homeScreen"),
    lobby: $("#lobbyScreen"),
    game: $("#gameScreen"),
    nickname: $("#nickname"),
    roomCode: $("#roomCode"),
    homeNotice: $("#homeNotice"),
    lobbyNotice: $("#lobbyNotice"),
    invite: $("#inviteLink"),
    roster: $("#roster"),
    rosterCount: $("#rosterCount"),
    lobbyCopy: $("#lobbyCopy"),
    startRoom: $("#startRoom"),
    guestWaiting: $("#guestWaiting"),
    homeBank: $("#homeBank"),
    homeBest: $("#homeBest"),
    preview: $("#previewCanvas"),
    canvas: $("#gameCanvas"),
    steer: $("#steer"),
    lap: $("#lapReadout"),
    pot: $("#potReadout"),
    multi: $("#multiReadout"),
    shield: $("#shieldReadout"),
    ghostCount: $("#ghostReadout"),
    sector: $("#sectorReadout"),
    sparks: $("#sparkReadout"),
    mode: $("#modeLabel"),
    gameNotice: $("#gameNotice"),
    decision: $("#lapDecision"),
    decisionTitle: $("#decisionTitle"),
    decisionCopy: $("#decisionCopy"),
    routeStamp: $("#routeStamp"),
    bankQuote: $("#bankQuote"),
    pushQuote: $("#pushQuote"),
    pauseOverlay: $("#pauseOverlay"),
    resultOverlay: $("#resultOverlay"),
    resultKicker: $("#resultKicker"),
    resultTitle: $("#resultTitle"),
    resultCopy: $("#resultCopy"),
    resultBank: $("#resultBank"),
    sound: $("#soundToggle"),
  };

  const STORAGE = {
    bank: "ghost-circuit-v1-bank",
    best: "ghost-circuit-v1-best",
    name: "ghost-circuit-v1-name",
  };
  const LAP_SECONDS = 13.5;
  const MAX_LAPS = 5;
  const MAX_PLAYERS = 6;
  const ROUTE_POINTS = 88;
  const MAX_ROOM_ROUTES = 18;
  const MAX_SAMPLES = 1800;
  const SCORE_LIMIT = 1_000_000_000;
  const COLORS = [
    "#ff6b9a",
    "#b89bff",
    "#62d8ff",
    "#ffd778",
    "#ff9870",
    "#9dff8b",
  ];
  const CANVAS_FONT = '"DM Mono", ui-monospace, monospace';
  const trackCache = new WeakMap();
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const safeStorage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (_) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (_) {}
    },
  };

  function safeName(value) {
    const clean = String(value ?? "")
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f<>"'`]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 14);
    return clean || "Racer";
  }
  function boundedInt(value, max = SCORE_LIMIT) {
    return Number.isFinite(value) && value >= 0
      ? Math.min(Math.floor(value), max)
      : 0;
  }
  function readBank() {
    return boundedInt(Number(safeStorage.get(STORAGE.bank) || 0));
  }
  function readBest() {
    try {
      const data = JSON.parse(safeStorage.get(STORAGE.best) || "null");
      if (
        !data ||
        boundedInt(data.score, 1_000_000) === 0 ||
        !validSamples(data.samples)
      )
        return null;
      return {
        score: boundedInt(data.score, 1_000_000),
        samples: data.samples.map((x) => clamp(Number(x), -1, 1)),
      };
    } catch (_) {
      return null;
    }
  }
  function validSamples(value) {
    return (
      Array.isArray(value) &&
      value.length === ROUTE_POINTS &&
      value.every((x) => Number.isFinite(x) && x >= -1 && x <= 1)
    );
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function setView(view) {
    els.home.hidden = view !== "home";
    els.lobby.hidden = view !== "lobby";
    els.game.hidden = view !== "game";
  }

  let banked = readBank();
  let best = readBest();
  let network = null;
  let run = null;
  let soundOn = false;
  let audioContext = null;
  let lastFrame = 0;
  let lastHud = 0;
  let previewTime = 0;
  let noticeTimer = 0;
  let sessionRoutes = [];
  let visibilityPaused = false;

  const savedName = safeStorage.get(STORAGE.name);
  if (savedName) els.nickname.value = safeName(savedName);
  updateGarageStats();
  const initialRoom = new URL(location.href).searchParams.get("room");
  if (initialRoom) {
    els.roomCode.value = initialRoom;
    els.homeNotice.textContent =
      "Room invite ready. Confirm your racer tag, then tap Join.";
  }

  function updateGarageStats() {
    els.homeBank.textContent = banked.toLocaleString();
    els.homeBest.textContent = best ? `${best.score.toLocaleString()} ✦` : "—";
  }
  function currentName() {
    const name = safeName(els.nickname.value);
    els.nickname.value = name;
    safeStorage.set(STORAGE.name, name);
    return name;
  }
  function showHomeNotice(message) {
    els.homeNotice.textContent = message;
  }
  function showLobbyNotice(message) {
    els.lobbyNotice.textContent = message;
  }
  function showGameNotice(message, duration = 1700) {
    els.gameNotice.textContent = message;
    els.gameNotice.classList.add("is-visible");
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(
      () => els.gameNotice.classList.remove("is-visible"),
      duration,
    );
  }
  function setSound(on) {
    soundOn = !!on;
    els.sound.setAttribute("aria-pressed", String(soundOn));
    els.sound.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
    els.sound.setAttribute(
      "aria-label",
      soundOn ? "Turn sound off" : "Turn sound on",
    );
  }
  function ping(type) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      osc.type = type === "hit" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(
        type === "hit" ? 180 : type === "bank" ? 680 : 880,
        now,
      );
      osc.frequency.exponentialRampToValueAtTime(
        type === "hit" ? 90 : 440,
        now + 0.12,
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      osc.connect(gain).connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (_) {}
  }

  function makeSparks() {
    return Array.from({ length: 12 }, (_, index) => ({
      p: (index + 0.55) / 12,
      lane: [-0.82, 0, 0.82][Math.floor(Math.random() * 3)],
      value: 1 + Math.floor(Math.random() * 3),
      taken: false,
      wobble: Math.random() * Math.PI * 2,
    }));
  }
  function startRun(mode) {
    currentName();
    sessionRoutes = [];
    const startGhosts =
      mode === "solo"
        ? best
          ? [
              {
                id: "solo-best",
                owner: "YOUR BEST",
                color: COLORS[1],
                samples: best.samples.slice(),
                age: 0,
              },
            ]
          : []
        : sessionRoutes;
    run = {
      mode,
      lap: 1,
      progress: 0,
      seconds: 0,
      lane: 0,
      targetLane: 0,
      pot: 0,
      lapShells: 0,
      multiplier: 1,
      combo: 0,
      sparksCollected: 0,
      shields: 2,
      lapSparks: makeSparks(),
      history: [],
      ghosts: startGhosts,
      invulnerable: 1.5,
      hitAt: -10,
      done: false,
      paused: false,
      choice: false,
      scoreAtLapStart: 0,
      colorSeed: network?.id || "solo",
    };
    els.steer.value = "0";
    const racerCount =
      mode === "room"
        ? network?.host
          ? roomPlayers().length
          : network?.players?.length || 1
        : 1;
    els.mode.textContent =
      mode === "solo" ? "SOLO / RUN" : `ROOM / ${racerCount} RACERS`;
    els.resultOverlay.hidden = true;
    els.pauseOverlay.hidden = true;
    els.decision.hidden = true;
    setView("game");
    updateHud();
    showGameNotice(
      best && mode === "solo"
        ? "YOUR BEST LINE IS BACK ON TRACK."
        : "ROUTE RECORDING STARTED.",
      2100,
    );
    lastFrame = 0;
  }

  function makeRoute(samples, owner, name, lap, id, color) {
    return {
      id,
      owner,
      name: safeName(name),
      lap,
      samples,
      age: 0,
      color: color || COLORS[Math.abs(hash(owner)) % COLORS.length],
    };
  }
  function hash(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return h;
  }
  function routeSamples() {
    const source = run.history;
    if (!source.length) return Array(ROUTE_POINTS).fill(run.lane);
    const points = [];
    let cursor = 0;
    for (let i = 0; i < ROUTE_POINTS; i++) {
      const p = i / ROUTE_POINTS;
      while (cursor + 1 < source.length && source[cursor + 1].p < p) cursor++;
      const a = source[cursor];
      const b = source[Math.min(cursor + 1, source.length - 1)];
      const span = b.p - a.p;
      const t = span > 0 ? clamp((p - a.p) / span, 0, 1) : 0;
      points.push(clamp(a.l + (b.l - a.l) * t, -1, 1));
    }
    return points;
  }
  function laneAt(samples, p) {
    const scaled = (((p % 1) + 1) % 1) * samples.length;
    const i = Math.floor(scaled);
    const t = scaled - i;
    return samples[i] + (samples[(i + 1) % samples.length] - samples[i]) * t;
  }
  function liveGhosts() {
    return run?.ghosts || [];
  }

  function addLocalRoute(route) {
    if (run.mode === "solo") {
      const score = run.lapShells;
      const isNewBest = !best || score >= best.score;
      if (isNewBest) {
        best = { score, samples: route.samples.slice() };
        safeStorage.set(STORAGE.best, JSON.stringify(best));
        updateGarageStats();
        run.ghosts = [
          makeRoute(
            route.samples,
            "solo-best",
            "YOUR BEST",
            route.lap,
            "solo-best",
            COLORS[1],
          ),
        ];
      } else {
        run.ghosts = [
          makeRoute(
            route.samples,
            "solo-last",
            "LAST LAP",
            route.lap,
            `solo-last:${route.lap}`,
            COLORS[0],
          ),
          makeRoute(
            best.samples,
            "solo-best",
            "YOUR BEST",
            route.lap,
            "solo-best",
            COLORS[1],
          ),
        ];
      }
      return;
    }
    addRoomRoute(route);
    if (network?.host) broadcast({ type: "route", route: stripRoute(route) });
    else if (network?.hostConn?.open)
      send(network.hostConn, { type: "route", route: stripRoute(route) });
  }
  function stripRoute(route) {
    return {
      id: route.id,
      owner: route.owner,
      name: route.name,
      lap: route.lap,
      samples: route.samples.slice(),
      color: route.color,
    };
  }
  function addRoomRoute(data) {
    if (
      !data ||
      typeof data.id !== "string" ||
      data.id.length > 140 ||
      !validSamples(data.samples)
    )
      return;
    if (sessionRoutes.some((item) => item.id === data.id)) return;
    const route = makeRoute(
      data.samples.map((x) => clamp(x, -1, 1)),
      String(data.owner || "").slice(0, 80),
      data.name,
      boundedInt(data.lap, MAX_LAPS) || 1,
      data.id,
      data.color,
    );
    sessionRoutes.push(route);
    while (sessionRoutes.length > MAX_ROOM_ROUTES) sessionRoutes.shift();
    if (run?.mode === "room") {
      run.ghosts = sessionRoutes;
      showGameNotice(
        `${route.name.toUpperCase()}'S ROUTE JOINED THE CIRCUIT.`,
        1500,
      );
    }
  }
  function completeLap() {
    if (!run || run.done || run.choice) return;
    run.progress = 1;
    run.pot = Math.min(SCORE_LIMIT, run.pot + run.lapShells);
    run.history.push({ p: 0.999, l: run.lane });
    const samples = routeSamples();
    const route = makeRoute(
      samples,
      network?.id || "you",
      currentName(),
      run.lap,
      `${network?.id || "solo"}:${run.lap}:${Date.now()}`,
      COLORS[0],
    );
    addLocalRoute(route);
    run.choice = true;
    run.paused = true;
    els.routeStamp.textContent = `/ ${String(run.lap).padStart(2, "0")}`;
    els.decisionTitle.textContent = `LAP ${String(run.lap).padStart(2, "0")} LOCKED.`;
    els.bankQuote.textContent = Math.floor(
      run.pot * run.multiplier,
    ).toLocaleString();
    els.pushQuote.textContent = `×${(run.multiplier * 1.5).toFixed(1)}`;
    const roomGhosts =
      run.mode === "room"
        ? `${sessionRoutes.length} crew route${sessionRoutes.length === 1 ? "" : "s"}`
        : run.ghosts.length > 1
          ? "your last lap and best ghost"
          : "your best ghost";
    const subject =
      run.mode === "room" && sessionRoutes.length === 1 ? "is" : "are";
    els.decisionCopy.textContent = `Your line is recorded. ${roomGhosts} ${run.mode === "room" ? subject : "will be"} moving through the next lap.`;
    const maxed = run.lap >= MAX_LAPS;
    $("#pushButton").hidden = maxed;
    if (maxed) {
      els.decisionCopy.textContent =
        "Five laps complete. Bank your safe haul and end the run.";
      $("#bankButton").textContent = "BANK & FINISH";
    } else {
      $("#bankButton").innerHTML = 'BANK & FINISH <b aria-hidden="true">✓</b>';
    }
    els.decision.hidden = false;
    $("#bankButton").focus({ preventScroll: true });
    updateHud();
    ping("bank");
  }
  function pushLap() {
    if (!run || run.done) return;
    run.multiplier = Math.min(12, run.multiplier * 1.5);
    run.lap++;
    run.progress = 0;
    run.seconds = 0;
    run.lane = 0;
    run.targetLane = 0;
    run.lapShells = 0;
    run.combo = 0;
    run.sparksCollected = 0;
    run.shields = 2;
    run.lapSparks = makeSparks();
    run.history = [{ p: 0, l: 0 }];
    run.choice = false;
    run.paused = false;
    run.invulnerable = 1.6;
    run.ghosts.forEach((ghost) => {
      ghost.age = 0;
    });
    els.decision.hidden = true;
    els.steer.value = "0";
    showGameNotice("NEW LAP. YOUR PAST LINE IS A HAZARD.", 2200);
    updateHud();
    lastFrame = 0;
  }
  function bankAndFinish(reason = "bank") {
    if (!run || run.done) return;
    const finalPot = Math.min(
      SCORE_LIMIT,
      run.pot + (run.choice ? 0 : run.lapShells),
    );
    if (reason === "bank") {
      banked = Math.min(
        SCORE_LIMIT,
        banked + Math.floor(finalPot * run.multiplier),
      );
      safeStorage.set(STORAGE.bank, String(banked));
      ping("bank");
    }
    const lost =
      reason === "wipeout" ? Math.floor(finalPot * run.multiplier) : 0;
    run.pot = finalPot;
    run.lapShells = 0;
    run.done = true;
    run.choice = false;
    run.paused = true;
    els.decision.hidden = true;
    els.pauseOverlay.hidden = true;
    els.resultKicker.textContent =
      reason === "wipeout"
        ? "SIGNAL LOST / RUN OVER"
        : "RUN COMPLETE / SHELLS SECURED";
    els.resultTitle.textContent = reason === "wipeout" ? "WIPEOUT." : "BANKED.";
    els.resultCopy.textContent =
      reason === "wipeout"
        ? `The unbanked run haul of ${lost.toLocaleString()} fictional shells is gone. Your banked shells are still safe.`
        : `You secured ${Math.floor(finalPot * run.multiplier).toLocaleString()} fictional shells. The track remembers your best line.`;
    els.resultBank.textContent = banked.toLocaleString();
    els.resultOverlay.hidden = false;
    $("#againButton").focus({ preventScroll: true });
    updateGarageStats();
    updateHud();
  }
  function showPause() {
    if (!run || run.done || run.choice) return;
    run.paused = true;
    els.pauseOverlay.hidden = false;
    $("#resumeButton").focus({ preventScroll: true });
  }
  function resume() {
    if (!run || run.done) return;
    run.paused = false;
    els.pauseOverlay.hidden = true;
    lastFrame = 0;
    els.steer.focus({ preventScroll: true });
  }
  function updateHud() {
    if (!run) return;
    els.lap.innerHTML = `${String(run.lap).padStart(2, "0")} <i>/ ${String(MAX_LAPS).padStart(2, "0")}</i>`;
    els.pot.innerHTML = `<i>✦</i> ${Math.floor((run.pot + (run.choice ? 0 : run.lapShells)) * run.multiplier).toLocaleString()}`;
    els.multi.textContent = `×${run.multiplier.toFixed(1)}`;
    els.shield.textContent =
      "◆ ".repeat(run.shields) + "◇ ".repeat(2 - run.shields);
    els.ghostCount.textContent = run.ghosts.length
      ? `${String(run.ghosts.length).padStart(2, "0")} IN FIELD`
      : "NO GHOSTS YET";
    const sector = Math.min(12, Math.floor(run.progress * 12) + 1);
    els.sector.textContent = `${String(sector).padStart(2, "0")} / 12`;
    els.sparks.textContent = `✦ ${run.sparksCollected} THIS LAP`;
  }

  function updateRun(dt) {
    if (!run || run.done || run.paused || run.choice) return;
    dt = Math.min(dt, 0.05);
    run.seconds += dt;
    run.progress += dt / LAP_SECONDS;
    run.lane += (run.targetLane - run.lane) * Math.min(1, dt * 4.4);
    run.invulnerable = Math.max(0, run.invulnerable - dt);
    run.ghosts.forEach((ghost) => {
      ghost.age += dt;
    });
    if (
      !run.history.length ||
      run.progress - run.history[run.history.length - 1].p >= 0.006
    ) {
      if (run.history.length < MAX_SAMPLES)
        run.history.push({ p: Math.min(run.progress, 0.999), l: run.lane });
    }
    for (const spark of run.lapSparks) {
      if (spark.taken || Math.abs(spark.p - run.progress) > 0.018) continue;
      if (Math.abs(spark.lane - run.lane) > 0.46) continue;
      spark.taken = true;
      run.combo = Math.min(8, run.combo + 1);
      const points = Math.round(
        spark.value * (1 + Math.min(4, run.combo - 1) * 0.25),
      );
      run.lapShells = Math.min(100_000, run.lapShells + points);
      run.sparksCollected++;
      showGameNotice(
        `+${points} FICTIONAL SHELL${points === 1 ? "" : "S"} · ${run.combo}× STREAK`,
        900,
      );
      ping("spark");
    }
    if (!run.invulnerable && run.seconds - run.hitAt > 1.2) {
      const geometry = dimensions(els.canvas);
      const player = pointAt(run.progress, run.lane, geometry);
      for (const ghost of run.ghosts) {
        const ghostProgress = (ghost.age / LAP_SECONDS) % 1;
        const gpos = pointAt(
          ghostProgress,
          laneAt(ghost.samples, ghostProgress),
          geometry,
        );
        if (Math.hypot(player.x - gpos.x, player.y - gpos.y) < 19) {
          run.hitAt = run.seconds;
          run.shields = Math.max(0, run.shields - 1);
          run.combo = 0;
          const shed = Math.ceil(run.lapShells * 0.2);
          run.lapShells = Math.max(0, run.lapShells - shed);
          run.invulnerable = 0.75;
          ping("hit");
          if (!run.shields) {
            bankAndFinish("wipeout");
            return;
          }
          showGameNotice(
            `GHOST HIT · −${shed} THIS LAP · ${run.shields} SHIELD LEFT`,
            1800,
          );
          break;
        }
      }
    }
    if (run.progress >= 1) completeLap();
  }

  function dimensions(canvas) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const cx = w / 2;
    const cy = h / 2;
    const rx = Math.max(45, Math.min(w * 0.34, w / 2 - 62));
    const ry = Math.max(38, Math.min(h * 0.31, h / 2 - 62));
    return { w, h, cx, cy, rx, ry };
  }
  function pointAt(progress, lane, geometry) {
    const { cx, cy, rx, ry } = geometry;
    const angle = -Math.PI / 2 + progress * Math.PI * 2;
    const nx = Math.cos(angle) / rx;
    const ny = Math.sin(angle) / ry;
    const length = Math.hypot(nx, ny) || 1;
    const offset = lane * 18;
    return {
      x: cx + rx * Math.cos(angle) + (nx / length) * offset,
      y: cy + ry * Math.sin(angle) + (ny / length) * offset,
      angle,
    };
  }
  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }
  function drawStar(ctx, x, y, outer, inner, color, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = outer * 1.8;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 4;
      const r = i % 2 ? inner : outer;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawTrack(ctx, canvas, isPreview = false) {
    const geometry = dimensions(canvas);
    const { w, h } = geometry;
    const scale = Math.min(w / 390, h / 270, 1.35);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let cached = trackCache.get(canvas);
    if (
      !cached ||
      cached.width !== canvas.width ||
      cached.height !== canvas.height ||
      cached.dpr !== dpr ||
      cached.isPreview !== isPreview
    ) {
      const surface = document.createElement("canvas");
      surface.width = canvas.width;
      surface.height = canvas.height;
      const surfaceContext = surface.getContext("2d");
      surfaceContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintTrack(surfaceContext, geometry, scale, isPreview);
      cached = {
        surface,
        width: canvas.width,
        height: canvas.height,
        dpr,
        isPreview,
      };
      trackCache.set(canvas, cached);
    }
    ctx.drawImage(cached.surface, 0, 0, w, h);
    return { ...geometry, scale };
  }

  function paintTrack(ctx, geometry, scale, isPreview) {
    const { w, h, cx, cy, rx, ry } = geometry;
    ctx.save();
    ctx.fillStyle = "#080e1b";
    ctx.fillRect(0, 0, w, h);
    const wash = ctx.createRadialGradient(
      cx,
      cy,
      10,
      cx,
      cy,
      Math.max(w, h) * 0.7,
    );
    wash.addColorStop(0, "#111b30");
    wash.addColorStop(1, "#080e1b");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#526181";
    ctx.lineWidth = 1;
    const grid = Math.max(22, 29 * scale);
    for (let x = cx % grid; x < w; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = cy % grid; y < h; y += grid) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = "#52d7e522";
    ctx.shadowBlur = 27 * scale;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#0d192c";
    ctx.lineWidth = 74 * scale;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#62708d28";
    ctx.lineWidth = 74 * scale;
    ctx.stroke();
    ctx.setLineDash([]);
    for (const offset of [-24, 0, 24]) {
      const ox = rx + offset;
      const oy = ry + offset;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ox, oy, 0, 0, Math.PI * 2);
      ctx.setLineDash(offset === 0 ? [4 * scale, 8 * scale] : []);
      ctx.lineWidth = offset === 0 ? 1 * scale : 1.1 * scale;
      ctx.strokeStyle = offset === 0 ? "#cbd8f52b" : "#b4c8f019";
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 49 * scale, ry - 49 * scale, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "#6fffd20e";
    ctx.lineWidth = 1;
    ctx.stroke();
    const finishY = cy - ry;
    ctx.save();
    ctx.translate(cx, finishY);
    const lineWidth = 5 * scale;
    const blocks = 10;
    for (let i = 0; i < blocks; i++) {
      ctx.fillStyle = i % 2 ? "#101a2a" : "#8ffff0";
      ctx.globalAlpha = i % 2 ? 0.9 : 0.8;
      ctx.fillRect(
        -lineWidth / 2,
        -37 * scale + ((74 * scale) / blocks) * i,
        lineWidth,
        (74 * scale) / blocks,
      );
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (!isPreview) {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#e5ecff";
      ctx.globalAlpha = 0.82;
      ctx.font = `700 ${Math.max(9, 12 * scale)}px ${CANVAS_FONT}`;
      ctx.fillText("THE CIRCUIT", cx, cy - 6 * scale);
      ctx.fillStyle = "#74839f";
      ctx.globalAlpha = 0.76;
      ctx.font = `400 ${Math.max(6, 7 * scale)}px ${CANVAS_FONT}`;
      ctx.fillText("YOUR LINE IS NEVER GONE", cx, cy + 11 * scale);
      ctx.restore();
    } else {
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = "#dbe8ff";
      ctx.globalAlpha = 0.45;
      ctx.font = `700 ${Math.max(8, 11 * scale)}px ${CANVAS_FONT}`;
      ctx.fillText("GHOST / TRACE 01", cx, cy + 2);
      ctx.restore();
    }
    ctx.restore();
  }
  function drawShip(ctx, point, color, scale, player = false, alpha = 1) {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(point.angle + Math.PI / 2);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = player ? 19 * scale : 14 * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -10 * scale);
    ctx.lineTo(7 * scale, 5 * scale);
    ctx.lineTo(0, 2.6 * scale);
    ctx.lineTo(-7 * scale, 5 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = player ? "#eafff8" : "#fff8";
    ctx.lineWidth = 1 * scale;
    ctx.stroke();
    if (!player) {
      ctx.beginPath();
      ctx.arc(0, 0, 12 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha * 0.5;
      ctx.lineWidth = 1 * scale;
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawSparks(ctx, geometry, sparks, time, scale) {
    for (const spark of sparks || []) {
      if (spark.taken) continue;
      const p = pointAt(spark.p, spark.lane, geometry);
      const pulse = 1 + Math.sin(time * 5 + spark.wobble) * 0.13;
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10 * scale * pulse, 0, Math.PI * 2);
      ctx.fillStyle = "#ffd77810";
      ctx.fill();
      ctx.restore();
      drawStar(ctx, p.x, p.y, 5 * scale * pulse, 2 * scale, "#ffd778");
    }
  }
  function drawGhosts(ctx, geometry, ghosts, scale, time) {
    for (const ghost of ghosts || []) {
      const p = (((ghost.age / LAP_SECONDS) % 1) + 1) % 1;
      const color = ghost.color || COLORS[1];
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.beginPath();
      for (let i = 14; i >= 0; i--) {
        const at = (p - i * 0.004 + 1) % 1;
        const q = pointAt(at, laneAt(ghost.samples, at), geometry);
        if (i === 14) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.lineWidth = 2.6 * scale;
      ctx.lineCap = "round";
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 7 * scale;
      ctx.stroke();
      ctx.restore();
      const pos = pointAt(p, laneAt(ghost.samples, p), geometry);
      drawShip(ctx, pos, color, scale, false, 0.94);
    }
  }
  function drawPlayer(
    ctx,
    geometry,
    progress,
    lane,
    scale,
    time,
    invulnerable = 0,
  ) {
    const p = pointAt(progress, lane, geometry);
    ctx.save();
    if (invulnerable > 0 && Math.floor(time * 13) % 2 === 0)
      ctx.globalAlpha = 0.32;
    const behind = pointAt(progress - 0.012, lane, geometry);
    ctx.beginPath();
    ctx.moveTo(behind.x, behind.y);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = 4 * scale;
    ctx.strokeStyle = "#6fffd2";
    ctx.globalAlpha *= 0.38;
    ctx.shadowColor = "#6fffd2";
    ctx.shadowBlur = 14 * scale;
    ctx.stroke();
    ctx.restore();
    drawShip(
      ctx,
      p,
      "#6fffd2",
      scale,
      true,
      invulnerable > 0 && Math.floor(time * 13) % 2 === 0 ? 0.34 : 1,
    );
  }
  function drawGame() {
    const canvas = els.canvas;
    fitCanvas(canvas);
    if (!canvas.width || !canvas.height) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const geometry = drawTrack(ctx, canvas, false);
    if (!run) return;
    drawSparks(ctx, geometry, run.lapSparks, run.seconds, geometry.scale);
    drawGhosts(ctx, geometry, run.ghosts, geometry.scale, run.seconds);
    drawPlayer(
      ctx,
      geometry,
      run.progress,
      run.lane,
      geometry.scale,
      run.seconds,
      run.invulnerable,
    );
  }
  function drawPreview() {
    const canvas = els.preview;
    fitCanvas(canvas);
    if (!canvas.width || !canvas.height) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const geometry = drawTrack(ctx, canvas, true);
    const ghosts = [
      {
        samples: Array(ROUTE_POINTS).fill(-0.84),
        age: (previewTime + 2.3) % LAP_SECONDS,
        color: COLORS[1],
      },
      {
        samples: Array.from(
          { length: ROUTE_POINTS },
          (_, i) => Math.sin(i / 8) * 0.64,
        ),
        age: (previewTime + 7.4) % LAP_SECONDS,
        color: "#ff6b9a",
      },
    ];
    drawSparks(
      ctx,
      geometry,
      Array.from({ length: 8 }, (_, i) => ({
        p: (i + 0.5) / 8,
        lane: i % 2 ? 0.83 : -0.7,
        wobble: i,
        taken: false,
      })),
      previewTime,
      geometry.scale,
    );
    drawGhosts(ctx, geometry, ghosts, geometry.scale, previewTime);
    drawPlayer(
      ctx,
      geometry,
      (previewTime / LAP_SECONDS) % 1,
      Math.sin(previewTime * 0.8) * 0.55,
      geometry.scale,
      previewTime,
      0,
    );
  }

  function send(conn, message) {
    try {
      if (conn?.open) conn.send(message);
    } catch (_) {}
  }
  function broadcast(message) {
    if (!network?.host) return;
    for (const conn of network.connections.values()) send(conn, message);
  }
  function roomPlayers() {
    if (!network) return [];
    const guestList = [...network.connections.values()]
      .filter((conn) => conn.playerName)
      .map((conn) => ({ id: conn.peer, name: conn.playerName }));
    return [{ id: network.id, name: network.name }, ...guestList].slice(
      0,
      MAX_PLAYERS,
    );
  }
  function renderRoster(players) {
    const safePlayers = Array.isArray(players)
      ? players.slice(0, MAX_PLAYERS).map((p) => ({
          id: String(p?.id || "").slice(0, 80),
          name: safeName(p?.name),
        }))
      : [];
    els.roster.replaceChildren();
    for (const player of safePlayers) {
      const li = document.createElement("li");
      const dot = document.createElement("i");
      const name = document.createElement("span");
      name.textContent = player.name;
      li.append(dot, name);
      els.roster.append(li);
    }
    for (let i = safePlayers.length; i < MAX_PLAYERS; i++) {
      const li = document.createElement("li");
      li.className = "is-waiting";
      const dot = document.createElement("i");
      const label = document.createElement("span");
      label.textContent = "OPEN SLOT";
      li.append(dot, label);
      els.roster.append(li);
    }
    els.rosterCount.textContent = `${safePlayers.length} / ${MAX_PLAYERS}`;
  }
  function inviteUrl(id = network?.id) {
    const url = new URL(location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", id || "");
    return url.toString();
  }
  function showLobby(isHost) {
    els.invite.value = inviteUrl(network?.host ? network.id : network?.roomId);
    els.lobbyCopy.textContent = isHost
      ? "Send the invite to your crew. Their past routes will haunt the circuit."
      : "Connected to the room. Your old routes and your crew’s routes will share the arena.";
    els.startRoom.hidden = !isHost;
    els.guestWaiting.hidden = isHost;
    renderRoster(isHost ? roomPlayers() : network?.players || []);
    showLobbyNotice(
      isHost
        ? "Room ready. Share the invite, then start when the crew is set."
        : "Connected. The host will start the circuit.",
    );
    setView("lobby");
  }
  function cleanupNetwork() {
    if (!network) return;
    try {
      for (const conn of network.connections?.values?.() || []) conn.close();
    } catch (_) {}
    try {
      network.hostConn?.close();
    } catch (_) {}
    try {
      network.peer?.destroy();
    } catch (_) {}
    network = null;
  }
  function peerUnavailable() {
    showHomeNotice(
      "Room signal unavailable. Solo still works; try again in a moment.",
    );
  }
  function createRoom() {
    if (typeof window.Peer !== "function") {
      peerUnavailable();
      return;
    }
    cleanupNetwork();
    const name = currentName();
    showHomeNotice("Finding a room signal…");
    try {
      const peer = new window.Peer(undefined, { debug: 0 });
      const next = {
        peer,
        id: "",
        host: true,
        name,
        connections: new Map(),
        pending: new Set(),
        players: [],
        roomId: "",
      };
      network = next;
      peer.on("open", (id) => {
        if (network !== next) return;
        next.id = id;
        renderRoster(roomPlayers());
        els.invite.value = inviteUrl(id);
        history.replaceState(null, "", `?room=${encodeURIComponent(id)}`);
        showLobby(true);
      });
      peer.on("connection", (conn) => acceptGuest(next, conn));
      peer.on("error", (error) => {
        if (network !== next) return;
        if (error?.type === "unavailable-id")
          showHomeNotice("That room code is in use. Open a fresh room.");
        else if (els.home.hidden)
          showLobbyNotice(
            "Room signal lost. Existing racers can keep playing locally.",
          );
        else
          showHomeNotice(
            "Room signal failed. Solo is ready if you want to race.",
          );
      });
    } catch (_) {
      peerUnavailable();
    }
  }
  function acceptGuest(room, conn) {
    if (
      !room.host ||
      room.connections.size + room.pending.size >= MAX_PLAYERS - 1
    ) {
      try {
        conn.close();
      } catch (_) {}
      return;
    }
    room.pending.add(conn);
    let accepted = false;
    const timer = setTimeout(() => {
      room.pending.delete(conn);
      if (!accepted)
        try {
          conn.close();
        } catch (_) {}
    }, 15_000);
    conn.on("data", (message) => {
      if (!message || typeof message !== "object" || Array.isArray(message))
        return;
      if (message.type === "hello") {
        if (
          accepted ||
          typeof message.name !== "string" ||
          message.name.length > 80 ||
          room.connections.size >= MAX_PLAYERS - 1
        )
          return;
        if (run?.mode === "room") {
          send(conn, {
            type: "reject",
            message: "This circuit has already started.",
          });
          conn.close();
          return;
        }
        accepted = true;
        clearTimeout(timer);
        room.pending.delete(conn);
        conn.playerName = safeName(message.name);
        room.connections.set(conn.peer, conn);
        send(conn, { type: "lobby", players: roomPlayers() });
        broadcast({ type: "lobby", players: roomPlayers() });
        if (!els.lobby.hidden) renderRoster(roomPlayers());
        showLobbyNotice(`${conn.playerName} joined the signal.`);
        return;
      }
      if (!accepted || room.connections.get(conn.peer) !== conn) return;
      if (message.type === "route") {
        const route = message.route;
        const now = Date.now();
        if (
          now - (conn.lastRouteAt || 0) < 2_000 ||
          !route ||
          typeof route.id !== "string" ||
          route.id.length > 140 ||
          !validSamples(route.samples) ||
          !Number.isFinite(route.lap) ||
          route.lap < 1 ||
          route.lap > MAX_LAPS
        )
          return;
        conn.lastRouteAt = now;
        const safeRoute = {
          id: route.id,
          owner: conn.peer,
          name: conn.playerName,
          lap: Math.floor(route.lap),
          samples: route.samples.map((x) => clamp(x, -1, 1)),
        };
        addRoomRoute(safeRoute);
        broadcast({
          type: "route",
          route: {
            ...safeRoute,
            color: COLORS[Math.abs(hash(conn.peer)) % COLORS.length],
          },
        });
      }
    });
    conn.on("close", () => {
      clearTimeout(timer);
      room.pending.delete(conn);
      if (room.connections.get(conn.peer) === conn) {
        room.connections.delete(conn.peer);
        if (!els.lobby.hidden) renderRoster(roomPlayers());
        broadcast({ type: "lobby", players: roomPlayers() });
      }
    });
    conn.on("error", () => {});
  }
  function joinRoom(raw) {
    if (typeof window.Peer !== "function") {
      peerUnavailable();
      return;
    }
    const value = String(raw || "").trim();
    let roomId = value;
    if (/^https?:/i.test(value)) {
      try {
        const url = new URL(value);
        const ids = url.searchParams.getAll("room");
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          ids.length !== 1 ||
          url.href.length > 240
        )
          throw new Error("invalid");
        roomId = ids[0];
      } catch (_) {
        showHomeNotice(
          "That invite link does not look right. Paste the full room link or code.",
        );
        return;
      }
    } else if (/[/?#]/.test(value) || value.includes("://")) {
      showHomeNotice("That room code does not look right.");
      return;
    }
    if (!/^[a-z0-9_-]{4,80}$/i.test(roomId)) {
      showHomeNotice(
        "Room code should be 4–80 letters, numbers, dashes, or underscores.",
      );
      return;
    }
    cleanupNetwork();
    const name = currentName();
    showHomeNotice("Joining the room…");
    try {
      const peer = new window.Peer(undefined, { debug: 0 });
      const next = {
        peer,
        id: "",
        host: false,
        name,
        connections: new Map(),
        pending: new Set(),
        players: [],
        roomId,
        hostConn: null,
      };
      network = next;
      peer.on("open", (id) => {
        if (network !== next) return;
        next.id = id;
        const conn = peer.connect(roomId, { reliable: true });
        next.hostConn = conn;
        conn.on("open", () => send(conn, { type: "hello", name }));
        conn.on("data", (message) => onGuestMessage(next, message));
        conn.on("close", () => {
          if (network === next && !els.home.hidden)
            showHomeNotice(
              "Room connection closed. Check with the host for a fresh invite.",
            );
          else if (network === next && !els.game.hidden)
            showGameNotice("ROOM SIGNAL CLOSED · SOLO RACE CAN CONTINUE", 2600);
        });
        conn.on("error", () =>
          showHomeNotice(
            "Could not reach that room. Check the invite and try again.",
          ),
        );
      });
      peer.on("error", (error) =>
        showHomeNotice(
          error?.type === "peer-unavailable"
            ? "That room is offline or the invite expired."
            : "Could not join that room. Try the invite again.",
        ),
      );
    } catch (_) {
      peerUnavailable();
    }
  }
  function onGuestMessage(room, message) {
    if (
      network !== room ||
      !message ||
      typeof message !== "object" ||
      Array.isArray(message)
    )
      return;
    if (message.type === "reject") {
      showHomeNotice(
        typeof message.message === "string"
          ? message.message.slice(0, 120)
          : "Room could not accept the connection.",
      );
      cleanupNetwork();
      return;
    }
    if (message.type === "lobby") {
      room.players = Array.isArray(message.players)
        ? message.players.slice(0, MAX_PLAYERS).map((p) => ({
            id: String(p?.id || "").slice(0, 80),
            name: safeName(p?.name),
          }))
        : [];
      showLobby(false);
      return;
    }
    if (message.type === "start") {
      startRun("room");
      showGameNotice("CREW CIRCUIT LIVE. ROUTES ARE SHARED.", 2200);
      return;
    }
    if (message.type === "route" && message.route) {
      const r = message.route;
      if (
        typeof r.id !== "string" ||
        r.id.length > 140 ||
        !validSamples(r.samples)
      )
        return;
      addRoomRoute({
        id: r.id,
        owner: String(r.owner || "").slice(0, 80),
        name: safeName(r.name),
        lap: boundedInt(r.lap, MAX_LAPS) || 1,
        samples: r.samples.map((x) => clamp(x, -1, 1)),
        color:
          typeof r.color === "string" && /^#[0-9a-f]{6}$/i.test(r.color)
            ? r.color
            : undefined,
      });
      return;
    }
    if (message.type === "lobby" && Array.isArray(message.players)) {
      room.players = message.players.slice(0, MAX_PLAYERS).map((p) => ({
        id: String(p?.id || "").slice(0, 80),
        name: safeName(p?.name),
      }));
      if (!els.lobby.hidden) renderRoster(room.players);
    }
  }
  function startRoom() {
    if (!network?.host) return;
    broadcast({ type: "start" });
    startRun("room");
  }
  async function copyInvite() {
    const text = els.invite.value;
    try {
      await navigator.clipboard.writeText(text);
      showLobbyNotice(
        "Invite copied. Anyone with the link can join this room.",
      );
    } catch (_) {
      els.invite.focus();
      els.invite.select();
      showLobbyNotice(
        "Select the invite link and copy it to share with your crew.",
      );
    }
  }
  function leaveToHome() {
    cleanupNetwork();
    run = null;
    sessionRoutes = [];
    els.decision.hidden = true;
    els.resultOverlay.hidden = true;
    els.pauseOverlay.hidden = true;
    history.replaceState(null, "", location.pathname);
    setView("home");
    updateGarageStats();
    showHomeNotice(
      "Back in the garage. Your banked shells and best ghost stay saved on this device.",
    );
  }

  $("#soloButton").addEventListener("click", () => {
    cleanupNetwork();
    startRun("solo");
  });
  $("#createRoom").addEventListener("click", createRoom);
  $("#joinRoom").addEventListener("click", () => joinRoom(els.roomCode.value));
  els.roomCode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinRoom(els.roomCode.value);
  });
  els.nickname.addEventListener("change", currentName);
  els.sound.addEventListener("click", () => setSound(!soundOn));
  els.startRoom.addEventListener("click", startRoom);
  $("#copyInvite").addEventListener("click", copyInvite);
  $("#leaveRoom").addEventListener("click", leaveToHome);
  $("#bankButton").addEventListener("click", () => bankAndFinish("bank"));
  $("#pushButton").addEventListener("click", pushLap);
  $("#pauseButton").addEventListener("click", showPause);
  $("#resumeButton").addEventListener("click", resume);
  $("#quitButton").addEventListener("click", showPause);
  const bankExitButton = document.createElement("button");
  bankExitButton.className = "btn btn-quiet";
  bankExitButton.type = "button";
  bankExitButton.textContent = "BANK CURRENT HAUL & EXIT";
  bankExitButton.addEventListener("click", () => bankAndFinish("bank"));
  els.pauseOverlay.querySelector(".overlay-card").append(bankExitButton);
  $("#againButton").addEventListener("click", () => {
    if (network) {
      sessionRoutes = [];
      startRun("room");
      if (network.host) broadcast({ type: "start" });
    } else startRun("solo");
  });
  $("#homeButton").addEventListener("click", leaveToHome);
  els.steer.addEventListener("input", () => {
    if (run) run.targetLane = Number(els.steer.value) / 100;
  });
  els.canvas.addEventListener("pointerdown", (event) => {
    if (!run || run.done || run.paused || run.choice) return;
    els.canvas.setPointerCapture?.(event.pointerId);
    steerFromPoint(event);
  });
  els.canvas.addEventListener("pointermove", (event) => {
    if (event.buttons && !run?.paused && !run?.choice) steerFromPoint(event);
  });
  function steerFromPoint(event) {
    const rect = els.canvas.getBoundingClientRect();
    const ratio = clamp(
      (event.clientX - rect.left) / Math.max(1, rect.width),
      0,
      1,
    );
    const value = Math.round((ratio * 2 - 1) * 100);
    els.steer.value = String(value);
    if (run) run.targetLane = value / 100;
  }
  window.addEventListener("keydown", (event) => {
    if (!run || run.done || run.choice) return;
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      run.targetLane = clamp(run.targetLane - 0.24, -1, 1);
      els.steer.value = String(Math.round(run.targetLane * 100));
      event.preventDefault();
    }
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      run.targetLane = clamp(run.targetLane + 0.24, -1, 1);
      els.steer.value = String(Math.round(run.targetLane * 100));
      event.preventDefault();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      showPause();
    }
    if (event.code === "Space" && !els.pauseOverlay.hidden) {
      event.preventDefault();
      resume();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && run && !run.done && !run.choice && !run.paused) {
      visibilityPaused = true;
      showPause();
    } else if (!document.hidden && visibilityPaused) {
      visibilityPaused = false;
      els.pauseOverlay.hidden = false;
    }
  });
  window.addEventListener("resize", () => {
    fitCanvas(els.canvas);
    fitCanvas(els.preview);
  });

  function frame(timestamp) {
    const dt = lastFrame ? Math.min(0.05, (timestamp - lastFrame) / 1000) : 0;
    lastFrame = timestamp;
    if (!els.home.hidden && !reduceMotion) previewTime += dt;
    if (!els.home.hidden) drawPreview();
    if (!els.game.hidden) {
      if (run && !run.paused && !run.done && !run.choice) updateRun(dt);
      drawGame();
      if (run && timestamp - lastHud > 100) {
        updateHud();
        lastHud = timestamp;
      }
    }
    requestAnimationFrame(frame);
  }
  setSound(false);
  requestAnimationFrame(frame);
})();
