(() => {
  'use strict';

  const RUNTIME_ORIGIN = 'https://assets.tappieapp.com';
  const frame = document.getElementById('opponentRuntimeFrame');
  const stage = document.getElementById('opponentRuntimeStage');
  const runtimeStatus = document.getElementById('runtimeStatus');
  const params = new URLSearchParams(location.search);
  const difficulty = ['easy','normal','hard'].includes(params.get('difficulty')) ? params.get('difficulty') : 'normal';

  const opponents = {
    easy: { label: '簡單 · 暖身', name: '森林小隊員' },
    normal: { label: '一般 · 推薦', name: '橘光探險家' },
    hard: { label: '困難 · 高獎勵', name: '星際守門員' }
  };

  const state = { player: 0, opponent: 0, round: 1, energy: 0, skillArmed: false, recording: false, runtimeReady: false, commandSeq: 0, pending: new Map() };

  const $ = id => document.getElementById(id);
  const opponent = opponents[difficulty];
  $('difficultyLabel').textContent = opponent.label;
  $('opponentName').textContent = opponent.name;

  function command(name, args = {}) {
    return new Promise((resolve, reject) => {
      if (!frame?.contentWindow) return reject(new Error('Runtime iframe missing'));
      const id = `challenge-${Date.now()}-${++state.commandSeq}`;
      const timer = setTimeout(() => { state.pending.delete(id); reject(new Error(`Runtime command timeout: ${name}`)); }, 8000);
      state.pending.set(id, { resolve, reject, timer });
      frame.contentWindow.postMessage({ source: 'tappie-layerlab-parent-command', id, command: name, args }, RUNTIME_ORIGIN);
    });
  }

  async function prepareOpponent() {
    try {
      const randomCount = difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2;
      for (let i = 0; i < randomCount; i += 1) await command('randomize');
      await command('playAnimation', { name: 'Stand_Idle2' }).catch(() => command('playAnimation', { name: 'Stand_Idle1' }));
      runtimeStatus.textContent = '對手角色準備完成';
    } catch (error) {
      console.warn('[Challenge Arena] opponent setup fallback', error);
      runtimeStatus.textContent = '使用對手預覽圖';
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== frame?.contentWindow || event.origin !== RUNTIME_ORIGIN) return;
    const msg = event.data;
    if (!msg || msg.source !== 'tappie-layerlab-browser-contract') return;
    if (msg.kind === 'event' && msg.event === 'ready') {
      state.runtimeReady = true;
      stage.classList.add('is-ready');
      void prepareOpponent();
    }
    if (msg.kind === 'response') {
      const pending = state.pending.get(msg.id);
      if (!pending) return;
      state.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.ok) pending.resolve(msg.result); else pending.reject(new Error(msg.error || 'Runtime command failed'));
    }
  });

  frame.addEventListener('load', () => { runtimeStatus.textContent = '對手角色連線中'; });
  frame.addEventListener('error', () => { runtimeStatus.textContent = '使用對手預覽圖'; });

  function render() {
    $('playerScore').textContent = state.player;
    $('opponentScore').textContent = state.opponent;
    $('roundLabel').textContent = `ROUND ${state.round}`;
    [...$('energyPips').children].forEach((pip, index) => pip.classList.toggle('is-on', index < state.energy));
    $('energyPips').setAttribute('aria-label', `招式能量 ${state.energy} / 3`);
    $('energyHint').textContent = state.energy >= 3 ? (state.skillArmed ? '本回合已準備發動' : '能量已滿') : `再完成 ${3 - state.energy} 題即可使用`;
    $('skillButton').disabled = state.energy < 3 || state.skillArmed;
  }

  function showResult(type, my, enemy, gained) {
    const label = { win: '回合勝利', tie: '同分平手', lose: '本回合惜敗' }[type];
    $('resultLabel').textContent = label;
    $('mySpeechScore').textContent = my;
    $('enemySpeechScore').textContent = enemy;
    $('resultCopy').textContent = type === 'tie' ? '雙方都不加分' : type === 'win' ? `獲得 ${gained} 分` : '對手獲得 1 分';
    $('roundResult').classList.add('is-visible');
    $('roundResult').setAttribute('aria-hidden', 'false');
    setTimeout(() => { $('roundResult').classList.remove('is-visible'); $('roundResult').setAttribute('aria-hidden', 'true'); }, 980);
  }

  function finishIfNeeded() {
    if (state.player < 3 && state.opponent < 3) return false;
    $('finalScore').textContent = `${state.player} : ${state.opponent}`;
    $('endSheet').classList.add('is-visible');
    $('endSheet').setAttribute('aria-hidden', 'false');
    if (state.runtimeReady) void command('playAnimation', { name: state.player >= 3 ? 'Dance_2' : 'Emoji_Cry' }).catch(() => {});
    return true;
  }

  function simulate(type) {
    if ($('endSheet').classList.contains('is-visible')) return;
    const values = { win: [88,74], tie: [82,82], lose: [76,86] }[type];
    let gained = 0;
    if (type === 'win') { gained = state.skillArmed ? 2 : 1; state.player += gained; }
    if (type === 'lose') state.opponent += 1;
    state.energy = Math.min(3, state.energy + 1);
    state.skillArmed = false;
    showResult(type, values[0], values[1], gained);
    $('arenaCaption').textContent = type === 'win' ? '漂亮！保持節奏' : type === 'tie' ? '完全同分，再來一次' : '聽清楚，再試一次';
    render();
    setTimeout(() => { if (!finishIfNeeded()) { state.round += 1; $('questionNumber').textContent = state.round; render(); } }, 1100);
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
    if (state.runtimeReady) void command('playAnimation', { name: 'Action_Punch' }).catch(() => {});
    setTimeout(() => {
      state.energy = 0;
      state.skillArmed = true;
      $('skillCutin').classList.remove('is-visible');
      $('skillCutin').setAttribute('aria-hidden', 'true');
      $('arenaCaption').textContent = '重擊已準備，本回合勝出得 2 分';
      render();
    }, 900);
  });

  document.querySelectorAll('[data-result]').forEach(button => button.addEventListener('click', () => simulate(button.dataset.result)));
  $('resetBattle').addEventListener('click', () => {
    Object.assign(state, { player: 0, opponent: 0, round: 1, energy: 0, skillArmed: false, recording: false });
    $('questionNumber').textContent = '1';
    $('endSheet').classList.remove('is-visible');
    $('endSheet').setAttribute('aria-hidden', 'true');
    $('arenaCaption').textContent = '面對對手，準備開口';
    render();
  });
  const goBack = () => { location.href = './dashboard.html?tab=challenge'; };
  $('backButton').addEventListener('click', goBack);
  $('finishBattle').addEventListener('click', goBack);

  render();
})();
