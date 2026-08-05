(() => {
  'use strict';

  const RUNTIME_ORIGIN = 'https://assets.tappieapp.com';
  const RUNTIME_URL = 'https://assets.tappieapp.com/avatars/layerlab/casual/2026.07.30-m2.5b4r3a4b/index.html';
  const params = new URLSearchParams(location.search);
  const difficulty = ['easy','normal','hard'].includes(params.get('difficulty')) ? params.get('difficulty') : 'normal';
  const WIN_TARGET = 5;
  const unityArena = window.TappieChallengeArena || null;
  let iframeFallbackStarted = false;
  document.body.classList.toggle('challenge-debug', params.get('challengeDebug') === '1');

  const opponents = {
    easy: { label: '簡單 · 暖身', name: '森林小隊員' },
    normal: { label: '一般 · 推薦', name: '橘光探險家' },
    hard: { label: '困難 · 高獎勵', name: '星際守門員' }
  };

  const $ = id => document.getElementById(id);
  const arena = $('arenaShell');
  const actors = {
    player: {
      frame: $('playerRuntimeFrame'),
      stage: $('playerRuntimeStage'),
      status: $('playerRuntimeStatus'),
      ready: false,
      commandSeq: 0,
      pending: new Map()
    },
    opponent: {
      frame: $('opponentRuntimeFrame'),
      stage: $('opponentRuntimeStage'),
      status: $('opponentRuntimeStatus'),
      ready: false,
      commandSeq: 0,
      pending: new Map()
    }
  };

  const state = {
    player: 0,
    opponent: 0,
    round: 1,
    energy: 0,
    skillArmed: false,
    recording: false,
    lastPlayerScore: 0,
    lastOpponentScore: 0
  };

  const opponent = opponents[difficulty];
  $('difficultyLabel').textContent = opponent.label;
  $('opponentName').textContent = opponent.name;

  const requestedPlayerName = (params.get('playerName') || '').trim();
  if (requestedPlayerName) $('playerName').textContent = requestedPlayerName.slice(0, 32);

  function command(actorName, name, args = {}) {
    if (unityArena?.isReady()) {
      if (name === 'randomize') return Promise.resolve({ handledBy: 'unity-default-opponent' });
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
      if (actorName === 'opponent') {
        const randomCount = difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2;
        for (let i = 0; i < randomCount; i += 1) await command('opponent', 'randomize');
      }
      const idle = actorName === 'player' ? 'Stand_Idle1' : 'Stand_Idle2';
      await command(actorName, 'playAnimation', { name: idle }).catch(() => command(actorName, 'playAnimation', { name: 'Stand_Idle1' }));
      actor.status.textContent = actorName === 'player' ? '我方準備完成' : '對手準備完成';
    } catch (error) {
      console.warn(`[Challenge Arena v0.4] ${actorName} setup fallback`, error);
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

  window.addEventListener('tappie:challenge-arena-fallback', startIframeFallback);
  window.addEventListener('tappie:challenge-arena-ready', () => {
    stopIframeFallback();
    actors.player.ready = true;
    actors.opponent.ready = true;
    actors.player.status.textContent = 'Unity 我方準備完成';
    actors.opponent.status.textContent = 'Unity 對手準備完成';
    void unityArena.initialize({
      difficulty,
      playerLoadout: unityArena.readStoredLoadout()
    }).catch(error => console.error('[Challenge Arena v0.7] initialize failed', error));
  });
  if (!unityArena || unityArena.state.phase === 'disabled' || unityArena.state.phase === 'error') startIframeFallback();

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
    $('skillButton').disabled = state.energy < 3 || state.skillArmed;
    $('skillButton').classList.toggle('is-ready', state.energy >= 3 && !state.skillArmed);
    $('skillButton').classList.toggle('is-armed', state.skillArmed);
    $('energyHint').textContent = state.skillArmed
      ? '重擊已準備：本回合勝出時一次亮起 2 格。'
      : state.energy >= 3
        ? '能量已滿，點擊右下角重擊。'
        : `再完成 ${3 - state.energy} 題即可使用重擊；勝出時一次亮 2 格。`;
  }

  function setFocus(side, duration = 1150) {
    arena.classList.remove('focus-player', 'focus-opponent');
    if (side) arena.classList.add(`focus-${side}`);
    if (duration > 0) setTimeout(() => arena.classList.remove('focus-player', 'focus-opponent'), duration);
  }

  function playRoundAnimations(type) {
    if (unityArena?.isReady()) {
      const cue = type === 'win'
        ? { cue: 'ROUND_WIN', actor: 'player', returnToBattle: true }
        : type === 'lose'
          ? { cue: 'ROUND_WIN', actor: 'opponent', returnToBattle: true }
          : { cue: 'TIE', actor: 'player', returnToBattle: true };
      void unityArena.playCue(cue).catch(() => {});
      return;
    }
    if (type === 'win') {
      setFocus('player');
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Emoji_Cheer' }).catch(() => command('player', 'playAnimation', { name: 'Emoji_Nice' })).catch(() => {});
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Reaction_Struck' }).catch(() => {});
    } else if (type === 'lose') {
      setFocus('opponent');
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Emoji_Cheer' }).catch(() => command('opponent', 'playAnimation', { name: 'Emoji_Nice' })).catch(() => {});
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Reaction_Struck' }).catch(() => {});
    } else {
      setFocus(null, 0);
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Emoji_Aghast' }).catch(() => {});
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Emoji_Aghast' }).catch(() => {});
    }
  }

  function showResult(type, my, enemy, gained) {
    const label = { win: '回合勝利', tie: '同分平手', lose: '本回合惜敗' }[type];
    $('resultLabel').textContent = label;
    $('mySpeechScore').textContent = my;
    $('enemySpeechScore').textContent = enemy;
    $('resultCopy').textContent = type === 'tie' ? '雙方都不亮燈' : type === 'win' ? `亮起 ${gained} 格` : '對手亮起 1 格';
    $('roundResult').classList.add('is-visible');
    $('roundResult').setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      $('roundResult').classList.remove('is-visible');
      $('roundResult').setAttribute('aria-hidden', 'true');
    }, 980);
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

  function finishIfNeeded() {
    if (state.player < WIN_TARGET && state.opponent < WIN_TARGET) return false;
    const playerWon = state.player >= WIN_TARGET;
    $('endTitle').textContent = playerWon ? '挑戰成功' : '這次差一點';
    $('endCopy').textContent = playerWon ? '率先亮滿五格，獲得勝利寶箱。' : '對手率先亮滿五格，完成挑戰仍可獲得練習獎勵。';
    renderFinalLamps(playerWon ? 'player' : 'opponent');
    $('endSheet').classList.add('is-visible');
    $('endSheet').setAttribute('aria-hidden', 'false');
    setFocus(playerWon ? 'player' : 'opponent', 0);
    if (unityArena?.isReady()) {
      void unityArena.playCue({
        cue: 'FINAL_WIN',
        actor: playerWon ? 'player' : 'opponent',
        returnToBattle: false
      }).catch(() => {});
      return true;
    }
    if (playerWon) {
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Dance_2' }).catch(() => {});
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Emoji_Cry' }).catch(() => {});
    } else {
      if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Dance_2' }).catch(() => {});
      if (actors.player.ready) void command('player', 'playAnimation', { name: 'Emoji_Cry' }).catch(() => {});
    }
    return true;
  }

  function simulate(type) {
    if ($('endSheet').classList.contains('is-visible')) return;
    const values = { win: [88,74], tie: [82,82], lose: [76,86] }[type];
    let gained = 0;
    if (type === 'win') {
      gained = state.skillArmed ? 2 : 1;
      state.player = Math.min(WIN_TARGET, state.player + gained);
    }
    if (type === 'lose') state.opponent = Math.min(WIN_TARGET, state.opponent + 1);
    state.energy = Math.min(3, state.energy + 1);
    state.skillArmed = false;
    playRoundAnimations(type);
    showResult(type, values[0], values[1], gained);
    $('arenaCaption').textContent = type === 'win' ? '漂亮！亮起一格' : type === 'tie' ? '完全同分，再來一次' : '聽清楚，再試一次';
    render();
    setTimeout(() => {
      if (!finishIfNeeded()) {
        state.round += 1;
        $('questionNumber').textContent = state.round;
        render();
        if (!unityArena?.isReady()) {
          if (actors.player.ready) void command('player', 'playAnimation', { name: 'Stand_Idle1' }).catch(() => {});
          if (actors.opponent.ready) void command('opponent', 'playAnimation', { name: 'Stand_Idle2' }).catch(() => {});
        }
      }
    }, 1280);
  }

  $('recordButton').addEventListener('click', () => {
    state.recording = !state.recording;
    $('recordButton').classList.toggle('is-recording', state.recording);
    $('recordButton').querySelector('span').textContent = state.recording ? '錄音中，再按一次完成' : '開始錄音';
    $('arenaCaption').textContent = state.recording ? '正在聽你說' : '面對對手，準備開口';
  });

  $('skillButton').addEventListener('click', () => {
    if (state.energy < 3 || state.skillArmed) return;
    $('skillCutin').classList.add('is-visible');
    $('skillCutin').setAttribute('aria-hidden', 'false');
    setFocus('player', 900);
    if (unityArena?.isReady()) {
      void unityArena.playCue({ cue: 'SKILL_SUCCESS', actor: 'player', returnToBattle: true }).catch(() => {});
    } else if (actors.player.ready) {
      void command('player', 'playAnimation', { name: 'Action_Punch' }).catch(() => {});
    }
    setTimeout(() => {
      state.energy = 0;
      state.skillArmed = true;
      $('skillCutin').classList.remove('is-visible');
      $('skillCutin').setAttribute('aria-hidden', 'true');
      $('arenaCaption').textContent = '重擊已準備，本回合勝出亮 2 格';
      render();
    }, 900);
  });

  document.querySelectorAll('[data-result]').forEach(button => button.addEventListener('click', () => simulate(button.dataset.result)));
  $('fillSkill').addEventListener('click', () => { state.energy = 3; state.skillArmed = false; render(); });
  $('resetBattle').addEventListener('click', () => {
    Object.assign(state, { player: 0, opponent: 0, round: 1, energy: 0, skillArmed: false, recording: false, lastPlayerScore: 0, lastOpponentScore: 0 });
    $('questionNumber').textContent = '1';
    $('endSheet').classList.remove('is-visible');
    $('endSheet').setAttribute('aria-hidden', 'true');
    arena.classList.remove('focus-player', 'focus-opponent');
    $('arenaCaption').textContent = '面對對手，準備開口';
    if (unityArena?.isReady()) void unityArena.resetRoundPose().catch(() => {});
    render();
  });

  const goBack = () => { location.href = './dashboard.html?tab=challenge'; };
  $('backButton').addEventListener('click', goBack);
  $('finishBattle').addEventListener('click', goBack);
  render();
})();
