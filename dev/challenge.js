(() => {
  'use strict';

  const RUNTIME_ORIGIN = 'https://assets.tappieapp.com';
  const RUNTIME_URL = 'https://assets.tappieapp.com/avatars/layerlab/casual/2026.07.30-m2.5b4r3a4b/index.html';
  const WIN_TARGET = 5;
  const MAX_RECORDING_MS = 12000;
  const MIN_RECORDING_MS = 500;
  const params = new URLSearchParams(location.search);
  const difficulty = ['easy', 'normal', 'hard'].includes(params.get('difficulty')) ? params.get('difficulty') : 'normal';
  const rewardZoneEnabled = params.get('rewardZone') === '1';
  const unityArena = window.TappieChallengeArena || null;
  const $ = id => document.getElementById(id);
  const arena = $('arenaShell');

  const opponents = {
    easy: { label: '簡單 · 暖身', name: '森林小隊員', score: [58, 82] },
    normal: { label: '一般 · 推薦', name: '橘光探險家', score: [68, 90] },
    hard: { label: '困難 · 挑戰', name: '星際守門員', score: [76, 96] }
  };

  const questions = [
    { topic: 'Buildings', sentence: 'We are going to the museum.', target: 'museum' },
    { topic: 'Buildings', sentence: 'We are going to the library.', target: 'library' },
    { topic: 'Buildings', sentence: 'We are going to the hospital.', target: 'hospital' },
    { topic: 'Places', sentence: 'We are playing in the park.', target: 'park' },
    { topic: 'Buildings', sentence: 'The supermarket is across the street.', target: 'supermarket' },
    { topic: 'Buildings', sentence: 'My school is next to the bank.', target: 'school' },
    { topic: 'Places', sentence: 'They are waiting at the station.', target: 'station' },
    { topic: 'Buildings', sentence: 'The restaurant is near the hotel.', target: 'restaurant' },
    { topic: 'Places', sentence: 'We can meet at the airport.', target: 'airport' },
    { topic: 'Buildings', sentence: 'The post office closes at five.', target: 'post office' }
  ];

  // 2026-08-05 LayerLab catalog verified display-index ranges. Zero explicitly unequips optional parts.
  const PART_MAX = Object.freeze({
    Bag: 18, Bottom: 55, Brows: 23, Earrings: 20, Eyes: 12, EyeWear: 18,
    Glove: 32, Hair: 28, Headgear: 68, LeftHand: 4, Mask: 32, Mouth: 11,
    RightHand: 19, Shoes: 50, Top: 71
  });
  const REQUIRED_PARTS = ['Eyes', 'Brows', 'Mouth', 'Hair', 'Top', 'Bottom', 'Shoes'];
  const OPTIONAL_PARTS = Object.freeze({
    Headgear: .42, EyeWear: .36, Mask: .18, Earrings: .28, Glove: .32,
    Bag: .27, LeftHand: .20, RightHand: .28
  });

  const opponent = opponents[difficulty];
  const requestedPlayerName = (params.get('playerName') || '').trim();
  if (requestedPlayerName) $('playerName').textContent = requestedPlayerName.slice(0, 32);
  $('difficultyLabel').textContent = opponent.label;
  $('opponentName').textContent = opponent.name;
  $('readyPlayerName').textContent = $('playerName').textContent;
  $('readyOpponentName').textContent = opponent.name;

  function randomInt(min, max) {
    const span = max - min + 1;
    if (window.crypto?.getRandomValues) {
      const data = new Uint32Array(1);
      window.crypto.getRandomValues(data);
      return min + (data[0] % span);
    }
    return min + Math.floor(Math.random() * span);
  }

  function createRandomLoadout(actorId) {
    const parts = REQUIRED_PARTS.map(type => ({ type, displayIndex: randomInt(1, PART_MAX[type]) }));
    Object.entries(OPTIONAL_PARTS).forEach(([type, chance]) => {
      parts.push({ type, displayIndex: Math.random() < chance ? randomInt(1, PART_MAX[type]) : 0 });
    });
    return { actorId, animation: actorId === 'player' ? 'Stand_Idle1' : 'Stand_Idle2', parts };
  }

  function loadoutSignature(loadout) {
    return loadout.parts.map(part => `${part.type}:${part.displayIndex}`).join('|');
  }

  const playerLoadout = createRandomLoadout('player');
  let opponentLoadout = createRandomLoadout('opponent');
  while (loadoutSignature(playerLoadout) === loadoutSignature(opponentLoadout)) {
    opponentLoadout = createRandomLoadout('opponent');
  }
  window.__TAPPIE_CHALLENGE_RANDOM_LOADOUTS__ = Object.freeze({ player: playerLoadout, opponent: opponentLoadout });
  console.info('[Tappie Challenge v0.9.0-alpha8] Random actor pair', window.__TAPPIE_CHALLENGE_RANDOM_LOADOUTS__);

  const actors = {
    player: { frame: $('playerRuntimeFrame'), stage: $('playerRuntimeStage'), status: $('playerRuntimeStatus'), ready: false, commandSeq: 0, pending: new Map() },
    opponent: { frame: $('opponentRuntimeFrame'), stage: $('opponentRuntimeStage'), status: $('opponentRuntimeStatus'), ready: false, commandSeq: 0, pending: new Map() }
  };

  const state = {
    player: 0,
    opponent: 0,
    round: 1,
    energy: 0,
    skillArmed: false,
    recording: false,
    processing: false,
    sessionStarted: false,
    lastPlayerScore: 0,
    lastOpponentScore: 0,
    currentQuestion: questions[0],
    pendingOpponentScore: 0,
    rewardMode: false,
    rewardSelected: false
  };

  const gate = {
    playerReady: false,
    opponentReady: false,
    micReady: false,
    worldPrepared: false,
    starting: false,
    progress: 0,
    readyButtonShown: false,
    introStartedAt: 0,
    introCompletedAt: 0
  };

  let iframeFallbackStarted = false;
  let unityInitializePromise = null;
  let micStream = null;
  let mediaRecorder = null;
  let recordingChunks = [];
  let recordingStartedAt = 0;
  let recordingTimer = 0;
  let systemAudioContext = null;
  let azureAuthToken = '';
  let azureRegionCode = '';
  let azureTokenRefreshAt = 0;
  let azureRefreshTimer = 0;

  function command(actorName, name, args = {}) {
    if (unityArena?.isReady()) {
      if (name === 'randomize') return Promise.resolve({ handledBy: 'unity-loadout-contract' });
      if (name === 'playAnimation') {
        const method = actorName === 'player' ? 'PlayPlayerAnimation' : 'PlayOpponentAnimation';
        return unityArena.send(method, String(args.name || 'Stand_Idle1'));
      }
      return Promise.resolve({ handledBy: 'unity-arena' });
    }
    const actor = actors[actorName];
    return new Promise((resolve, reject) => {
      if (!actor?.frame?.contentWindow) return reject(new Error(`${actorName} runtime iframe missing`));
      const id = `challenge-${actorName}-${Date.now()}-${++actor.commandSeq}`;
      const timer = setTimeout(() => {
        actor.pending.delete(id);
        reject(new Error(`${actorName} runtime timeout: ${name}`));
      }, 8000);
      actor.pending.set(id, { resolve, reject, timer });
      actor.frame.contentWindow.postMessage({ source: 'tappie-layerlab-parent-command', id, command: name, args }, RUNTIME_ORIGIN);
    });
  }

  async function prepareActor(actorName) {
    const actor = actors[actorName];
    try {
      const randomCount = actorName === 'player' ? 2 : 3;
      for (let i = 0; i < randomCount; i += 1) await command(actorName, 'randomize');
      const idle = actorName === 'player' ? 'Stand_Idle1' : 'Stand_Idle2';
      await command(actorName, 'playAnimation', { name: idle }).catch(() => command(actorName, 'playAnimation', { name: 'Stand_Idle1' }));
      actor.status.textContent = actorName === 'player' ? '我方準備完成' : '對手準備完成';
    } catch (error) {
      console.warn(`[Challenge Arena v0.9.0-alpha8] ${actorName} iframe fallback`, error);
      actor.status.textContent = '使用角色預覽圖';
    }
  }

  function bindActorMessages(actorName) {
    const actor = actors[actorName];
    actor.frame.addEventListener('load', () => { actor.status.textContent = actorName === 'player' ? '我方連線中' : '對手連線中'; });
    actor.frame.addEventListener('error', () => { actor.status.textContent = '使用角色預覽圖'; });
  }

  function startIframeFallback() {
    if (iframeFallbackStarted) return;
    iframeFallbackStarted = true;
    Object.entries(actors).forEach(([actorName, actor]) => {
      actor.ready = false;
      actor.stage.classList.remove('is-ready');
      actor.status.textContent = actorName === 'player' ? '我方載入中' : '對手載入中';
      actor.frame.src = actor.frame.dataset.src || RUNTIME_URL;
    });
    gate.worldPrepared = true;
    gate.progress = 1;
    updateGate();
  }

  function stopIframeFallback() {
    if (!iframeFallbackStarted) return;
    iframeFallbackStarted = false;
    Object.values(actors).forEach(actor => {
      actor.ready = false;
      actor.pending.forEach(pending => {
        clearTimeout(pending.timer);
        pending.reject(new Error('Unity Arena 已接管角色顯示'));
      });
      actor.pending.clear();
      actor.frame.src = 'about:blank';
      actor.stage.classList.remove('is-ready');
    });
  }

  window.addEventListener('message', event => {
    if (event.origin !== RUNTIME_ORIGIN) return;
    const actorName = event.source === actors.player.frame.contentWindow ? 'player' : event.source === actors.opponent.frame.contentWindow ? 'opponent' : null;
    if (!actorName) return;
    const actor = actors[actorName];
    const msg = event.data;
    if (!msg || msg.source !== 'tappie-layerlab-browser-contract') return;
    if (msg.kind === 'event' && msg.event === 'ready') {
      actor.ready = true;
      actor.stage.classList.add('is-ready');
      void prepareActor(actorName);
    }
    if (msg.kind === 'response') {
      const pending = actor.pending.get(msg.id);
      if (!pending) return;
      actor.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.ok) pending.resolve(msg.result); else pending.reject(new Error(msg.error || 'Runtime command failed'));
    }
  });

  bindActorMessages('player');
  bindActorMessages('opponent');

  const enterChallengeButton = $('enterChallengeButton');
  const readyProgress = document.querySelector('.ready-progress');
  const readyPermission = document.querySelector('.ready-permission');
  enterChallengeButton.hidden = true;
  enterChallengeButton.disabled = true;
  enterChallengeButton.textContent = '場景載入中…';

  function setGateProgress(value) {
    gate.progress = Math.max(gate.progress, Math.min(1, Number(value) || 0));
    $('readyProgressBar').style.width = `${Math.round(gate.progress * 100)}%`;
    updateGate();
  }

  function setGateStatus(message, isError = false) {
    $('readyStatus').textContent = message;
    $('readyStatus').classList.toggle('is-error', isError);
  }

  function updateGate() {
    const assetsReady = gate.worldPrepared && gate.progress >= .999;
    $('playerReadyState').textContent = gate.playerReady ? '已確認' : assetsReady ? '等待確認' : '載入中';
    $('opponentReadyState').textContent = gate.opponentReady ? '已確認' : gate.playerReady ? '等待對手…' : assetsReady ? '等待確認' : '連線中';
    document.querySelector('.ready-actor-player').classList.toggle('is-ready', gate.playerReady);
    document.querySelector('.ready-actor-opponent').classList.toggle('is-ready', gate.opponentReady);
    if (gate.starting) return;

    if (!assetsReady) {
      if (readyProgress) readyProgress.hidden = false;
      if (readyPermission) readyPermission.hidden = true;
      enterChallengeButton.hidden = true;
      enterChallengeButton.disabled = true;
      enterChallengeButton.textContent = '場景載入中…';
      setGateStatus(`正在準備 Arena ${Math.round(gate.progress * 100)}%`);
      return;
    }

    if (readyProgress) readyProgress.hidden = true;
    if (readyPermission) readyPermission.hidden = false;

    if (!gate.playerReady) {
      enterChallengeButton.hidden = false;
      enterChallengeButton.disabled = false;
      enterChallengeButton.textContent = '進入挑戰';
      gate.readyButtonShown = true;
      setGateStatus('場景與角色準備完成，按下後等待對手。');
      return;
    }

    enterChallengeButton.hidden = false;
    enterChallengeButton.disabled = true;
    if (!gate.opponentReady) {
      enterChallengeButton.textContent = '等待對手中…';
      setGateStatus('你已確認，正在等待對手進入…');
    } else {
      enterChallengeButton.textContent = '雙方已準備';
      setGateStatus('雙方已確認，正在開始入場運鏡…');
    }
  }

  window.addEventListener('tappie:challenge-arena-progress', event => setGateProgress(event.detail?.progress));
  window.addEventListener('tappie:challenge-arena-fallback', startIframeFallback);

  async function prepareUnityWorld() {
    if (!unityArena?.isReady()) return;
    if (unityInitializePromise) return unityInitializePromise;
    unityInitializePromise = (async () => {
      stopIframeFallback();
      actors.player.ready = true;
      actors.opponent.ready = true;
      actors.player.status.textContent = 'Unity 我方準備完成';
      actors.opponent.status.textContent = 'Unity 對手準備完成';
      await unityArena.initialize({
        difficulty,
        playerLoadout,
        opponentLoadout,
        playMatchIntro: false
      });
      gate.worldPrepared = true;
      setGateProgress(1);
      updateGate();
    })().catch(error => {
      console.error('[Challenge Arena v0.9.0-alpha8] initialize failed', error);
      unityInitializePromise = null;
      startIframeFallback();
    });
    return unityInitializePromise;
  }

  window.addEventListener('tappie:challenge-arena-ready', () => { void prepareUnityWorld(); });
  if (unityArena?.isReady()) void prepareUnityWorld();
  if (!unityArena || unityArena.state.phase === 'disabled' || unityArena.state.phase === 'error') startIframeFallback();

  async function ensureMicrophone() {
    if (micStream?.active) return micStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('此瀏覽器不支援麥克風錄音');
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1, sampleRate: 16000 }
    });
    return micStream;
  }

  $('enterChallengeButton').addEventListener('click', async () => {
    const button = enterChallengeButton;
    if (!gate.worldPrepared || gate.progress < .999 || gate.playerReady || gate.starting) return;
    button.disabled = true;
    button.textContent = '正在開啟麥克風…';
    setGateStatus('正在開啟麥克風…');
    try {
      await ensureMicrophone();
      gate.micReady = true;
      gate.playerReady = true;
      updateGate();
      setTimeout(() => {
        gate.opponentReady = true;
        updateGate();
        void tryStartMatch();
      }, randomInt(850, 1450));
      void refreshAzureToken().catch(error => console.warn('[Challenge Speech] token preload', error));
    } catch (error) {
      console.error('[Challenge Speech] microphone', error);
      gate.micReady = false;
      gate.playerReady = false;
      button.disabled = false;
      button.hidden = false;
      button.textContent = '重新開啟麥克風';
      updateGate();
      setGateStatus('需要麥克風權限才能進行真實發音評分。', true);
    }
  });

  async function tryStartMatch() {
    if (gate.starting || state.sessionStarted) return;
    if (!gate.playerReady || !gate.opponentReady || !gate.micReady || !gate.worldPrepared || gate.progress < .999) return;
    gate.starting = true;
    gate.introStartedAt = performance.now();
    setGateStatus('雙方已準備，開始入場運鏡…');
    enterChallengeButton.textContent = '開始入場';
    $('recordButton').disabled = true;
    setRecordButton('等待入場運鏡完成');
    $('arenaCaption').textContent = '雙方正在進場';

    // The gate must leave before PlayMatchIntro, otherwise the complete intro
    // runs behind the waiting page and the user only sees BATTLE_MAIN.
    $('readyGate').classList.add('is-leaving');
    await new Promise(resolve => setTimeout(resolve, 440));
    $('readyGate').hidden = true;

    try {
      if (unityArena?.isReady()) {
        const introComplete = unityArena.waitForRuntime('intro-complete', null, 16000);
        await unityArena.playMatchIntro();
        await introComplete.catch(error => console.warn('[Challenge Arena] intro completion fallback', error));
        // Canonical Match Intro owns the full camera sequence and already settles
        // on the approved BATTLE_MAIN. No second camera owner is resumed here.
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
    } finally {
      gate.introCompletedAt = performance.now();
      state.sessionStarted = true;
      prepareRound();
      $('recordButton').disabled = false;
      setRecordButton('開始錄音');
      $('arenaCaption').textContent = '面對對手，準備開口';
      window.__TAPPIE_CHALLENGE_GATE_DIAGNOSTICS__ = {
        worldPrepared: gate.worldPrepared,
        progress: gate.progress,
        introMs: Math.round(gate.introCompletedAt - gate.introStartedAt),
        arena: unityArena?.state?.arenaId || null,
        arenaDiagnostics: unityArena?.diagnostics?.() || null
      };
    }
  }

  async function refreshAzureToken(force = false) {
    if (!force && azureAuthToken && Date.now() < azureTokenRefreshAt) return;
    if (!window.TappieAPI?.getAzureToken) throw new Error('TappieAPI.getAzureToken 尚未載入');
    const data = await window.TappieAPI.getAzureToken();
    if (!data?.success || !data.token || !data.region) throw new Error(data?.message || 'Azure 語音權杖取得失敗');
    azureAuthToken = data.token;
    azureRegionCode = data.region;
    azureTokenRefreshAt = Date.now() + 8 * 60 * 1000;
  }

  void refreshAzureToken().catch(error => console.warn('[Challenge Speech] token will retry on demand', error));
  azureRefreshTimer = window.setInterval(() => {
    if (state.sessionStarted) void refreshAzureToken(true).catch(error => console.warn('[Challenge Speech] token refresh', error));
  }, 8 * 60 * 1000);

  function renderScoreTrack(trackId, score, previous, side) {
    const track = $(trackId);
    const lamps = [...track.querySelectorAll('.score-lamps i')];
    lamps.forEach((lamp, index) => {
      lamp.classList.toggle('is-on', index < score);
      const justOn = index >= previous && index < score;
      lamp.classList.toggle('just-on', justOn);
      if (justOn) setTimeout(() => lamp.classList.remove('just-on'), 480);
    });
    track.setAttribute('aria-label', `${side} ${score} / ${WIN_TARGET}`);
  }

  function render() {
    renderScoreTrack('playerScoreTrack', state.player, state.lastPlayerScore, '我方');
    renderScoreTrack('opponentScoreTrack', state.opponent, state.lastOpponentScore, '對手');
    state.lastPlayerScore = state.player;
    state.lastOpponentScore = state.opponent;
    $('roundLabel').textContent = `ROUND ${state.round}`;
    const angle = Math.min(360, state.energy * 120);
    $('skillOrbRing').style.setProperty('--energy-angle', `${angle}deg`);
    $('skillFraction').textContent = `${state.energy}/3`;
    $('skillButton').setAttribute('aria-label', `重擊能量 ${state.energy} / 3`);
    $('skillButton').disabled = !state.sessionStarted || state.processing || state.energy < 3 || state.skillArmed;
    $('skillButton').classList.toggle('is-ready', state.energy >= 3 && !state.skillArmed && !state.processing);
    $('skillButton').classList.toggle('is-armed', state.skillArmed);
    $('energyHint').textContent = state.skillArmed
      ? '重擊已準備：本回合勝出時一次亮起 2 格。'
      : state.energy >= 3
        ? '能量已滿，點擊右下角重擊。'
        : `再完成 ${3 - state.energy} 題即可使用重擊；勝出時一次亮 2 格。`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function renderQuestion() {
    const question = state.currentQuestion;
    const safeSentence = escapeHtml(question.sentence);
    const safeTarget = escapeHtml(question.target);
    const targetExpression = new RegExp(`(${question.target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
    $('questionNumber').textContent = state.round;
    document.querySelector('.question-row > div > span').innerHTML = `${escapeHtml(question.topic)} · 第 <b id="questionNumber">${state.round}</b> 題`;
    $('questionSentence').innerHTML = safeSentence.replace(targetExpression, `<strong>${safeTarget}</strong>`);
  }

  function generateOpponentScore() {
    return randomInt(opponent.score[0], opponent.score[1]);
  }

  function prepareRound() {
    state.currentQuestion = questions[(state.round - 1) % questions.length];
    state.pendingOpponentScore = generateOpponentScore();
    renderQuestion();
    render();
  }

  function setFocus(side, duration = 1500) {
    arena.classList.remove('focus-player', 'focus-opponent');
    if (side) arena.classList.add(`focus-${side}`);
    if (duration > 0) setTimeout(() => arena.classList.remove('focus-player', 'focus-opponent'), duration);
  }

  async function playRoundAnimations(type) {
    if (unityArena?.isReady()) {
      const cue = type === 'win'
        ? { cue: 'ROUND_WIN', actor: 'player', returnToBattle: true }
        : type === 'lose'
          ? { cue: 'ROUND_WIN', actor: 'opponent', returnToBattle: true }
          : { cue: 'TIE', actor: 'player', returnToBattle: true };
      const fallbackMs = type === 'tie' ? 1350 : 2650;
      await unityArena.playCueAndWait(
        cue,
        type === 'tie' ? 'tie-complete' : 'round-win-complete',
        6000,
        fallbackMs
      ).catch(() => delay(fallbackMs));
      return;
    }
    if (type === 'win') {
      setFocus('player');
      if (actors.player.ready) await command('player', 'playAnimation', { name: 'Emoji_Cheer' }).catch(() => command('player', 'playAnimation', { name: 'Emoji_Nice' })).catch(() => {});
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Reaction_Struck' }).catch(() => {});
    } else if (type === 'lose') {
      setFocus('opponent');
      if (actors.opponent.ready) await command('opponent', 'playAnimation', { name: 'Emoji_Cheer' }).catch(() => command('opponent', 'playAnimation', { name: 'Emoji_Nice' })).catch(() => {});
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Reaction_Struck' }).catch(() => {});
    } else {
      setFocus(null, 0);
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Emoji_Aghast' }).catch(() => {});
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Emoji_Aghast' }).catch(() => {});
    }
    await delay(type === 'tie' ? 1350 : 2400);
  }

  function showResult(type, myScore, enemyScore, gained) {
    $('resultLabel').textContent = { win: '回合勝利', tie: '同分平手', lose: '本回合惜敗' }[type];
    $('mySpeechScore').textContent = myScore;
    $('enemySpeechScore').textContent = enemyScore;
    $('resultCopy').textContent = type === 'tie' ? '雙方都不亮燈' : type === 'win' ? `亮起 ${gained} 格` : '對手亮起 1 格';
    $('roundResult').classList.add('is-visible');
    $('roundResult').setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      $('roundResult').classList.remove('is-visible');
      $('roundResult').setAttribute('aria-hidden', 'true');
    }, 1750);
  }

  function renderFinalLamps(winner) {
    const box = $('finalLamps');
    box.innerHTML = '';
    for (let i = 0; i < WIN_TARGET; i += 1) {
      const lamp = document.createElement('i');
      lamp.className = winner;
      box.appendChild(lamp);
    }
  }

  async function enterRewardMode() {
    if (state.rewardMode) return;
    state.rewardMode = true;
    state.rewardSelected = false;
    $('recordButton').disabled = true;
    $('skillButton').disabled = true;
    $('battleControls').hidden = true;
    $('rewardControls').hidden = false;
    $('finishRewardMode').hidden = true;
    $('rewardChestAction').hidden = true;
    $('rewardJumpButton').disabled = false;
    $('rewardControlTitle').textContent = '走到想選的寶箱前';
    $('rewardControlStatus').textContent = '左側搖桿移動；拖曳遊戲畫面旋轉視角。靠近寶箱後再開啟。';
    $('arenaCaption').textContent = '勝利！前往選擇獎勵寶箱';
    arena.classList.add('reward-mode');
    await unityArena?.beginRewardSelection({
      arenaId: unityArena.state?.arenaId,
      chestCount: 3,
      control: 'third-person-joystick-orbit',
      radiusMeters: 50
    }).catch(error => console.warn('[Challenge Reward] begin', error));
  }

  function isMatchComplete() {
    return state.player >= WIN_TARGET || state.opponent >= WIN_TARGET;
  }

  async function finishMatchIfNeeded() {
    if (!isMatchComplete()) return false;
    const playerWon = state.player >= WIN_TARGET;
    setFocus(playerWon ? 'player' : 'opponent', 0);
    $('recordButton').disabled = true;

    if (unityArena?.isReady()) {
      await unityArena.playCueAndWait(
        { cue: 'FINAL_WIN', actor: playerWon ? 'player' : 'opponent', returnToBattle: false },
        'final-win-complete',
        8500,
        3800
      ).catch(() => delay(3800));
      // Reward must never inherit Dance/Final pose or its cinematic camera.
      await unityArena.resetRoundPose().catch(() => {});
      await unityArena.playActorAnimation('player', 'Stand_Idle1').catch(() => {});
      await delay(120);
    } else if (playerWon) {
      if (actors.player.ready) await command('player', 'playAnimation', { name: 'Dance_2' }).catch(() => {});
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Emoji_Cry' }).catch(() => {});
      await delay(3200);
      if (actors.player.ready) await command('player', 'playAnimation', { name: 'Stand_Idle1' }).catch(() => {});
    } else {
      if (actors.opponent.ready) await command('opponent', 'playAnimation', { name: 'Dance_2' }).catch(() => {});
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Emoji_Cry' }).catch(() => {});
      await delay(3200);
    }

    if (playerWon && rewardZoneEnabled && unityArena?.isReady()) {
      $('arenaCaption').textContent = '挑戰成功，進入獎勵探索';
      await enterRewardMode();
      return true;
    }

    $('endTitle').textContent = playerWon ? '挑戰成功' : '這次差一點';
    $('endCopy').textContent = playerWon ? '你率先亮滿五格，完成本場口說對決。' : '對手率先亮滿五格；可以回到挑戰後再試一次。';
    renderFinalLamps(playerWon ? 'player' : 'opponent');
    $('endSheet').classList.add('is-visible');
    $('endSheet').setAttribute('aria-hidden', 'false');
    return true;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function resolveScoredRound(myScore) {
    const enemyScore = state.pendingOpponentScore;
    const type = myScore > enemyScore ? 'win' : myScore < enemyScore ? 'lose' : 'tie';
    let gained = 0;
    if (type === 'win') {
      gained = state.skillArmed ? 2 : 1;
      state.player = Math.min(WIN_TARGET, state.player + gained);
    }
    if (type === 'lose') state.opponent = Math.min(WIN_TARGET, state.opponent + 1);
    state.energy = Math.min(3, state.energy + 1);
    state.skillArmed = false;
    const matchCompleteAfterScore = isMatchComplete();
    const roundAnimation = matchCompleteAfterScore ? Promise.resolve() : playRoundAnimations(type);
    showResult(type, myScore, enemyScore, gained);
    $('arenaCaption').textContent = type === 'win' ? `發音 ${myScore} 分，回合勝利` : type === 'tie' ? `雙方 ${myScore} 分，再來一次` : `發音 ${myScore} 分，對手勝出`;
    render();
    await roundAnimation;
    if (await finishMatchIfNeeded()) return;
    state.round += 1;
    if (unityArena?.isReady()) {
      await unityArena.resetRoundPose().catch(() => {});
    }
    prepareRound();
    $('arenaCaption').textContent = '下一題，準備開口';
  }

  function supportedRecordingMime() {
    if (!window.MediaRecorder) return '';
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported?.(type)) || '';
  }

  function setRecordButton(label, className = '') {
    const button = $('recordButton');
    button.querySelector('span').textContent = label;
    button.classList.toggle('is-recording', className === 'recording');
    button.classList.toggle('is-processing', className === 'processing');
  }

  async function createWavFileFromBlob(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    if (!systemAudioContext) systemAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (systemAudioContext.state === 'suspended') await systemAudioContext.resume().catch(() => {});
    const audioBuffer = await new Promise((resolve, reject) => {
      let settled = false;
      const success = value => { if (!settled) { settled = true; resolve(value); } };
      const failure = error => { if (!settled) { settled = true; reject(error instanceof Error ? error : new Error('錄音解碼失敗')); } };
      try {
        const result = systemAudioContext.decodeAudioData(arrayBuffer.slice(0), success, failure);
        if (result?.then) result.then(success).catch(failure);
      } catch (error) { failure(error); }
    });
    const sampleRate = 16000;
    const length = Math.max(1, Math.ceil(Math.max(audioBuffer.duration, .1) * sampleRate));
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offlineContext = new OfflineContext(1, length, sampleRate);
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    const resampled = await offlineContext.startRendering();
    const wavBuffer = new ArrayBuffer(44 + resampled.length * 2);
    const view = new DataView(wavBuffer);
    let position = 0;
    const write16 = value => { view.setUint16(position, value, true); position += 2; };
    const write32 = value => { view.setUint32(position, value, true); position += 4; };
    write32(0x46464952); write32(wavBuffer.byteLength - 8); write32(0x45564157);
    write32(0x20746d66); write32(16); write16(1); write16(1);
    write32(sampleRate); write32(sampleRate * 2); write16(2); write16(16);
    write32(0x61746164); write32(resampled.length * 2);
    const samples = resampled.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(position, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      position += 2;
    }
    return new File([wavBuffer], 'challenge-round.wav', { type: 'audio/wav' });
  }

  function strictPronunciationScore(pronunciationResult) {
    const accuracy = Number(pronunciationResult.accuracyScore) || 0;
    const completeness = Number(pronunciationResult.completenessScore) || 0;
    const fluency = Number(pronunciationResult.fluencyScore) || 0;
    const baseScore = accuracy * .5 + completeness * .3 + fluency * .2;
    const words = pronunciationResult.detailResult?.Words || [];
    let missingCount = 0;
    let brokenCount = 0;
    let phonemePenalty = 0;
    words.forEach(word => {
      const assessment = word.PronunciationAssessment || {};
      const wordScore = Number(assessment.AccuracyScore) || 0;
      const errorType = assessment.ErrorType || '';
      if (errorType === 'Omission' || wordScore === 0 || !word.Phonemes?.length) {
        missingCount += 1;
      } else if (wordScore < 50) {
        brokenCount += 1;
      } else {
        word.Phonemes.forEach(phoneme => {
          const score = Number(phoneme.PronunciationAssessment?.AccuracyScore) || 0;
          if (score >= 95) return;
          if (score >= 90) phonemePenalty += 2;
          else if (score >= 85) phonemePenalty += 2.6;
          else if (score >= 80) phonemePenalty += 3;
          else if (score >= 75) phonemePenalty += 3.4;
          else if (score >= 70) phonemePenalty += 3.8;
          else if (score >= 65) phonemePenalty += 4.2;
          else if (score >= 60) phonemePenalty += 4.6;
          else phonemePenalty += 6;
        });
      }
    });
    const wordCount = Math.max(1, words.length);
    let penalty = (missingCount * 15 + brokenCount * 10 + phonemePenalty) / Math.max(1, Math.sqrt(wordCount));
    if (wordCount <= 3) penalty += fluency < 50 ? 15 : fluency < 75 ? 6 : 0;
    else penalty += fluency < 50 ? 5 : fluency < 75 ? 2 : 0;
    return Math.max(0, Math.min(100, Math.round(baseScore - penalty)));
  }

  async function assessPronunciation(wavFile, referenceText) {
    await refreshAzureToken();
    if (!window.SpeechSDK) throw new Error('Azure Speech SDK 尚未載入');
    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(azureAuthToken, azureRegionCode);
    speechConfig.speechRecognitionLanguage = 'en-US';
    const audioConfig = SpeechSDK.AudioConfig.fromWavFileInput(wavFile);
    const pronunciationConfig = new SpeechSDK.PronunciationAssessmentConfig(
      referenceText,
      SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
      SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
      true
    );
    const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
    pronunciationConfig.applyTo(recognizer);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { recognizer.close(); } catch (_) {}
        reject(new Error('Azure 發音評分逾時，請再試一次'));
      }, 25000);
      const close = () => { clearTimeout(timeout); try { recognizer.close(); } catch (_) {} };
      recognizer.recognizeOnceAsync(result => {
        if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
          close();
          reject(new Error('沒有辨識到完整英文，請再說一次'));
          return;
        }
        try {
          const pronunciationResult = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
          const score = strictPronunciationScore(pronunciationResult);
          close();
          resolve(score);
        } catch (error) {
          close();
          reject(error);
        }
      }, error => {
        close();
        reject(new Error(`語音評分連線失敗：${error}`));
      });
    });
  }

  function countLocalVoiceUsage() {
    try {
      const key = 'tappie.challenge.voice-usage.local.v072';
      sessionStorage.setItem(key, String((Number(sessionStorage.getItem(key)) || 0) + 1));
    } catch (_) {}
  }

  async function processRecording(blob, durationMs) {
    if (durationMs < MIN_RECORDING_MS || blob.size < 500) {
      throw new Error('錄音太短，請完整說完句子再送出');
    }
    setRecordButton('正在轉成 WAV…', 'processing');
    $('arenaCaption').textContent = '正在處理錄音';
    const wavFile = await createWavFileFromBlob(blob);
    setRecordButton('Azure 正在評分…', 'processing');
    $('arenaCaption').textContent = '正在進行發音評分';
    const score = await assessPronunciation(wavFile, state.currentQuestion.sentence);
    countLocalVoiceUsage();
    await resolveScoredRound(score);
  }

  async function startRecording() {
    if (!state.sessionStarted || state.processing || state.recording || isMatchComplete()) return;
    await ensureMicrophone();
    if (!window.MediaRecorder) throw new Error('此瀏覽器不支援 MediaRecorder');
    recordingChunks = [];
    const mimeType = supportedRecordingMime();
    mediaRecorder = mimeType ? new MediaRecorder(micStream, { mimeType }) : new MediaRecorder(micStream);
    mediaRecorder.addEventListener('dataavailable', event => { if (event.data?.size) recordingChunks.push(event.data); });
    mediaRecorder.addEventListener('stop', async () => {
      clearTimeout(recordingTimer);
      state.recording = false;
      state.processing = true;
      $('recordButton').disabled = true;
      render();
      const durationMs = Date.now() - recordingStartedAt;
      const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || mimeType || 'audio/webm' });
      try {
        await processRecording(blob, durationMs);
      } catch (error) {
        console.error('[Challenge Speech] assessment', error);
        $('arenaCaption').textContent = error.message || '評分失敗，請再試一次';
      } finally {
        state.processing = false;
        if (!$('endSheet').classList.contains('is-visible')) {
          $('recordButton').disabled = false;
          setRecordButton('開始錄音');
        }
        render();
      }
    }, { once: true });
    recordingStartedAt = Date.now();
    state.recording = true;
    mediaRecorder.start(100);
    setRecordButton('錄音中，再按一次完成', 'recording');
    $('arenaCaption').textContent = '正在聽你說';
    recordingTimer = setTimeout(stopRecording, MAX_RECORDING_MS);
  }

  function stopRecording() {
    if (!state.recording || !mediaRecorder || mediaRecorder.state !== 'recording') return;
    setRecordButton('正在整理錄音…', 'processing');
    mediaRecorder.stop();
  }

  $('recordButton').addEventListener('click', () => {
    if (state.recording) stopRecording();
    else void startRecording().catch(error => {
      console.error('[Challenge Speech] start', error);
      $('arenaCaption').textContent = error.message || '無法開始錄音';
      state.recording = false;
      state.processing = false;
      $('recordButton').disabled = false;
      setRecordButton('重新錄音');
    });
  });

  $('audioButton').addEventListener('click', () => {
    if (!window.speechSynthesis || !state.currentQuestion) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(state.currentQuestion.sentence);
    utterance.lang = 'en-US';
    utterance.rate = .86;
    window.speechSynthesis.speak(utterance);
  });

  $('skillButton').addEventListener('click', () => {
    if (state.processing || state.recording || state.energy < 3 || state.skillArmed) return;
    $('skillCutin').classList.add('is-visible');
    $('skillCutin').setAttribute('aria-hidden', 'false');
    setFocus('player', 900);
    if (unityArena?.isReady()) void unityArena.playActorAnimation('player', 'Action_Punch').catch(() => {});
    else if (actors.player.ready) void command('player', 'playAnimation', { name: 'Action_Punch' }).catch(() => {});
    setTimeout(() => {
      state.energy = 0;
      state.skillArmed = true;
      $('skillCutin').classList.remove('is-visible');
      $('skillCutin').setAttribute('aria-hidden', 'true');
      $('arenaCaption').textContent = '重擊已準備，本回合勝出亮 2 格';
      render();
    }, 900);
  });

  const rewardJoystick = $('rewardJoystick');
  const rewardJoystickKnob = $('rewardJoystickKnob');
  let rewardPointerId = null;
  let rewardMove = { x: 0, y: 0 };
  let rewardSendQueued = false;
  let rewardHeartbeatTimer = 0;

  function stopRewardHeartbeat() {
    if (rewardHeartbeatTimer) clearInterval(rewardHeartbeatTimer);
    rewardHeartbeatTimer = 0;
  }

  function startRewardHeartbeat() {
    stopRewardHeartbeat();
    rewardHeartbeatTimer = window.setInterval(() => {
      if (rewardPointerId == null || !state.rewardMode || state.rewardSelected) return;
      void unityArena?.setRewardMoveInput(rewardMove).catch(() => {});
    }, 50);
  }

  function sendRewardMove(x, y) {
    rewardMove = { x, y };
    if (rewardSendQueued) return;
    rewardSendQueued = true;
    requestAnimationFrame(() => {
      rewardSendQueued = false;
      void unityArena?.setRewardMoveInput(rewardMove).catch(() => {});
    });
  }

  function updateRewardJoystick(event) {
    const rect = rewardJoystick.getBoundingClientRect();
    const radius = Math.max(1, Math.min(rect.width, rect.height) * .36);
    let x = event.clientX - (rect.left + rect.width / 2);
    let y = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y);
    if (length > radius) { x = x / length * radius; y = y / length * radius; }
    rewardJoystickKnob.style.transform = `translate(${x}px, ${y}px)`;
    const magnitude = Math.min(1, Math.hypot(x, y) / radius);
    rewardJoystick.classList.toggle('is-running', magnitude >= .70);
    sendRewardMove(x / radius, -y / radius);
  }

  function releaseRewardJoystick() {
    rewardPointerId = null;
    stopRewardHeartbeat();
    rewardJoystick?.classList.remove('is-running');
    rewardJoystickKnob.style.transform = 'translate(0, 0)';
    sendRewardMove(0, 0);
  }

  rewardJoystick?.addEventListener('pointerdown', event => {
    if (!state.rewardMode || state.rewardSelected) return;
    rewardPointerId = event.pointerId;
    rewardJoystick.setPointerCapture(event.pointerId);
    updateRewardJoystick(event);
    startRewardHeartbeat();
  });
  rewardJoystick?.addEventListener('pointermove', event => {
    if (event.pointerId !== rewardPointerId) return;
    updateRewardJoystick(event);
  });
  rewardJoystick?.addEventListener('pointerup', releaseRewardJoystick);
  rewardJoystick?.addEventListener('pointercancel', releaseRewardJoystick);
  rewardJoystick?.addEventListener('lostpointercapture', releaseRewardJoystick);


  let rewardLookPointerId = null;
  let rewardLookLastX = 0;
  let rewardLookLastY = 0;
  let rewardLookSendQueued = false;
  let rewardLookDelta = { x: 0, y: 0 };

  function sendRewardLook(x, y) {
    rewardLookDelta.x += x;
    rewardLookDelta.y += y;
    if (rewardLookSendQueued) return;
    rewardLookSendQueued = true;
    requestAnimationFrame(() => {
      rewardLookSendQueued = false;
      const payload = { x: rewardLookDelta.x, y: rewardLookDelta.y };
      rewardLookDelta = { x: 0, y: 0 };
      void unityArena?.setRewardLookInput(payload).catch(() => {});
    });
  }

  arena?.addEventListener('pointerdown', event => {
    if (!state.rewardMode || state.rewardSelected || rewardJoystick?.contains(event.target)) return;
    if (event.target.closest?.('button, a, input')) return;
    rewardLookPointerId = event.pointerId;
    rewardLookLastX = event.clientX;
    rewardLookLastY = event.clientY;
    arena.setPointerCapture?.(event.pointerId);
  });
  arena?.addEventListener('pointermove', event => {
    if (event.pointerId !== rewardLookPointerId) return;
    const dx = event.clientX - rewardLookLastX;
    const dy = event.clientY - rewardLookLastY;
    rewardLookLastX = event.clientX;
    rewardLookLastY = event.clientY;
    sendRewardLook(dx, dy);
  });
  const releaseRewardLook = event => {
    if (event?.pointerId != null && event.pointerId !== rewardLookPointerId) return;
    rewardLookPointerId = null;
  };
  arena?.addEventListener('pointerup', releaseRewardLook);
  arena?.addEventListener('pointercancel', releaseRewardLook);
  arena?.addEventListener('lostpointercapture', releaseRewardLook);

  const rewardChestAction = $('rewardChestAction');

  window.addEventListener('tappie:reward-state', event => {
    const detail = event.detail || {};
    if (!state.rewardMode) return;
    if (detail.selected) {
      state.rewardSelected = true;
      releaseRewardJoystick();
      rewardChestAction.hidden = true;
      $('rewardJumpButton').disabled = true;
      $('rewardControlTitle').textContent = '獎勵已加入';
      $('rewardControlStatus').textContent = '寶箱已選擇，可以回到挑戰。';
      $('finishRewardMode').hidden = false;
      $('arenaCaption').textContent = '獎勵已加入';
      return;
    }
    const visible = Boolean(detail.active && detail.nearChest && !state.rewardSelected);
    rewardChestAction.hidden = !visible;
    if (visible) {
      rewardChestAction.style.left = `${Math.max(8, Math.min(92, Number(detail.screenX || .5) * 100))}%`;
      rewardChestAction.style.top = `${Math.max(16, Math.min(82, Number(detail.screenY || .5) * 100))}%`;
      rewardChestAction.textContent = `開啟寶箱 ${Number(detail.chestIndex || 0) + 1}`;
      $('rewardControlStatus').textContent = '已靠近寶箱，點擊寶箱上方的按鈕領取。';
    } else {
      $('rewardControlStatus').textContent = '內圈走路、外圈跑步；拖曳畫面旋轉視角。';
    }
  });

  rewardChestAction?.addEventListener('click', async () => {
    if (!state.rewardMode || state.rewardSelected) return;
    rewardChestAction.disabled = true;
    $('rewardControlStatus').textContent = '正在開啟寶箱…';
    await unityArena?.confirmRewardSelection().catch(() => {});
    setTimeout(() => { rewardChestAction.disabled = false; }, 800);
  });

  $('rewardJumpButton')?.addEventListener('click', () => {
    if (!state.rewardMode || state.rewardSelected) return;
    void unityArena?.rewardJump().catch(() => {});
  });

  const goBack = () => { location.href = './dashboard.html?tab=challenge'; };
  $('backButton').addEventListener('click', goBack);
  $('finishBattle').addEventListener('click', goBack);
  $('finishRewardMode')?.addEventListener('click', () => {
    void unityArena?.endRewardSelection().catch(() => {});
    goBack();
  });

  window.addEventListener('pagehide', () => {
    clearInterval(azureRefreshTimer);
    stopRewardHeartbeat();
    clearTimeout(recordingTimer);
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    micStream?.getTracks().forEach(track => track.stop());
    window.speechSynthesis?.cancel();
    if (state.rewardMode) {
      releaseRewardJoystick();
      try { unityArena?.endRewardSelection(); } catch (_) {}
    }
  });

  setGateProgress(unityArena?.state?.progress || 0);
  prepareRound();
})();
