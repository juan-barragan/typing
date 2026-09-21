(() => {
  'use strict';
  const { ORDER, makeStat, accuracy, speed, makeBank, makeLesson, prepareRun, qualifies } = window.Typewell;
  const $ = id => document.getElementById(id);
  const DEFAULT_KEY = 'typewell.progress.v1';
  const PROFILES_KEY = 'typewell.profiles.v1';
  const ACTIVE_PROFILE_KEY = 'typewell.active-profile.v1';
  let profiles = [];
  let activeProfile = null;
  try {
    const savedProfiles = JSON.parse(localStorage.getItem(PROFILES_KEY));
    if (Array.isArray(savedProfiles)) profiles = savedProfiles.filter(profile => /^p-[a-z0-9-]+$/.test(profile?.id) && typeof profile.name === 'string' && profile.name.trim().length > 0 && profile.name.length <= 40);
    activeProfile = profiles.find(profile => profile.id === localStorage.getItem(ACTIVE_PROFILE_KEY)) || null;
  } catch { /* Profiles remain usable in memory when browser storage is unavailable. */ }
  const storageKey = () => activeProfile ? `typewell.profile.${activeProfile.id}.v1` : DEFAULT_KEY;
  const LEGACY_KEY = 'typewell.session.v1';
  const today = () => {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };
  const fresh = () => ({ version: 1, settings: { speed: 35, accuracy: 95, goal: 15 }, unlocked: 8, focus: 'h', mastered: [], bank: [], totalMs: 0, attempts: 0, correct: 0, letters: {}, records: [], run: null, keyboard: true });
  let state = fresh();
  let storageAvailable = true;
  let migrated = false;
  // Prefer durable progress; recover the previous tab-only save on first upgrade.
  for (const legacy of activeProfile ? [false] : [false, true]) {
    try {
      const saved = JSON.parse(legacy ? sessionStorage.getItem(LEGACY_KEY) : localStorage.getItem(storageKey()));
      if (saved?.version === 1 && Number.isInteger(saved.unlocked) && saved.unlocked >= 8 && saved.unlocked <= 26 && ORDER.includes(saved.focus) && Array.isArray(saved.bank) && saved.settings && Array.isArray(saved.records) && saved.letters && Array.isArray(saved.mastered)) {
        state = saved;
        migrated = legacy;
        break;
      }
    } catch { /* A missing, blocked, or malformed save must not prevent practice. */ }
  }
  if (!state.practiceDay) {
    state.practiceDay = today();
    state.dailyMs = state.totalMs;
  }
  function refreshDay() {
    if (state.practiceDay !== today()) {
      state.practiceDay = today();
      state.dailyMs = 0;
    }
  }
  refreshDay();
  let running = false;
  let lastTick = null;
  let lastKey = null;
  let error = false;
  let chars = [];
  let keyElements = new Map();
  let lastSave = 0;
  let completed = false;

  function save() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
      storageAvailable = true;
    }
    catch { storageAvailable = false; }
    if (storageAvailable && migrated) {
      try { sessionStorage.removeItem(LEGACY_KEY); migrated = false; } catch { /* Keep the legacy backup if removal is blocked. */ }
    }
    $('storage-status').textContent = storageAvailable ? activeProfile ? `Progress saved for ${activeProfile.name}` : 'Progress saved in this browser' : 'Progress kept in memory for this visit';
  }
  const announce = message => { $('announcement').textContent = message; };
  const formatTime = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  const lessonSpeed = () => state.run.ms >= 1000 ? state.run.correct * 12000 / state.run.ms : 0;
  const wordsCompleted = () => state.run.completedWords + [...state.run.text.matchAll(/\S+/g)].filter(word => word.index + word[0].length <= state.run.position).length;

  // Keep an in-memory copy too, so switching works when persistent storage is blocked.
  const profileStates = new Map();
  function renderProfile() {
    $('profile-name').textContent = activeProfile?.name || 'Your name';
    $('profile-avatar').textContent = activeProfile ? [...activeProfile.name][0].toUpperCase() : '+';
    $('profile-button').setAttribute('aria-label', activeProfile ? `Switch profile. Current profile: ${activeProfile.name}` : 'Choose a name for your progress');
    $('profile-note').textContent = activeProfile ? 'Choose your name to pick up where you left off, or add someone new.' : 'Your current progress will belong to the first name you add.';
    $('profile-list').replaceChildren();
    for (const profile of profiles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'profile-option';
      button.dataset.profileId = profile.id;
      button.setAttribute('aria-pressed', String(profile.id === activeProfile?.id));
      const name = document.createElement('span');
      name.textContent = profile.name;
      const status = document.createElement('span');
      status.textContent = profile.id === activeProfile?.id ? 'Current ✓' : 'Continue →';
      button.append(name, status);
      button.addEventListener('click', () => selectProfile(profile));
      $('profile-list').append(button);
    }
  }

  function selectProfile(profile, isNew = false) {
    pause();
    save();
    if (activeProfile) profileStates.set(activeProfile.id, state);
    const claimExisting = !activeProfile && isNew;
    let nextState = claimExisting ? state : profileStates.get(profile.id);
    if (!nextState && !isNew) {
      try { nextState = JSON.parse(localStorage.getItem(`typewell.profile.${profile.id}.v1`)); } catch { /* Use a fresh in-memory profile if unavailable. */ }
    }
    activeProfile = profile;
    state = nextState || fresh();
    if (!state.practiceDay) { state.practiceDay = today(); state.dailyMs = state.totalMs; }
    refreshDay();
    lastTick = null;
    lastKey = null;
    error = false;
    completed = false;
    if (state.run) state.run = prepareRun(state.run, state.bank);
    if (state.run && state.run.position < state.run.text.length) { renderWords(); renderLetters(); renderMetrics(); }
    else newLesson();
    setKeyboardVisibility();
    renderSession();
    $('start-label').textContent = state.run.position ? 'Find your flow again' : 'Let’s get typing';
    $('start-caption').textContent = `Ready when you are, ${profile.name}.`;
    $('typing-hint').textContent = '✧  Find the rhythm. You don’t need to rush.';
    save();
    if (storageAvailable) {
      try {
        localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
        localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
        if (claimExisting) localStorage.removeItem(DEFAULT_KEY);
      } catch {
        storageAvailable = false;
        $('storage-status').textContent = 'Progress kept in memory for this visit';
      }
    }
    renderProfile();
    $('profile-dialog').close();
    announce(`Welcome, ${profile.name}. Your progress is ready.`);
  }

  function newLesson() {
    if (!state.bank.length) state.bank = makeBank(window.TYPEWELL_WORDS, state.unlocked, state.focus);
    state.run = { text: makeLesson(state.bank), position: 0, completedWords: 0, attempts: 0, correct: 0, ms: 0, letters: {} };
    error = false;
    completed = false;
    renderWords();
    renderLetters();
    renderMetrics();
    save();
  }

  function renderWords() {
    const words = $('words');
    words.replaceChildren();
    chars = [];
    const parts = state.run.text.split(' ');
    parts.forEach((word, index) => {
      const wrapper = document.createElement('span');
      wrapper.className = 'word';
      for (const character of word + (index < parts.length - 1 ? ' ' : '')) {
        const span = document.createElement('span');
        span.className = 'char';
        span.textContent = character;
        wrapper.append(span);
        chars.push(span);
      }
      words.append(wrapper);
    });
    $('typing-input').setAttribute('aria-label', `Type these words: ${state.run.text}`);
    words.style.transform = '';
    renderCursor();
  }

  function renderCursor() {
    const position = state.run.position;
    chars.forEach((span, index) => { span.className = `char${index < position ? ' correct' : ''}${index === position ? ' current' : ''}${index === position && error ? ' error' : ''}`; });
    const current = chars[position];
    if (current) {
      const lineHeight = parseFloat(getComputedStyle($('words')).lineHeight);
      const offset = Math.max(0, current.offsetTop - lineHeight);
      $('words').style.transform = `translateY(-${offset}px)`;
    }
    const done = wordsCompleted();
    $('word-count').textContent = `${done} words`;
    $('word-count').title = `Round ${Math.floor(state.run.completedWords / state.bank.length) + 1} · practice as long as you like`;
    $('finish-lesson').hidden = done < state.bank.length;
    $('practice-shortcuts').hidden = done >= state.bank.length;
    $('lesson-progress').style.width = `${position / state.run.text.length * 100}%`;
    for (const [key, element] of keyElements) element.classList.toggle('next', key === state.run.text[position]);
  }

  function renderLetters() {
    $('letter-strip').replaceChildren();
    [...ORDER].forEach((letter, index) => {
      const element = document.createElement('span');
      const mastered = state.mastered.includes(letter);
      element.className = `letter${index < state.unlocked ? ' unlocked' : ''}${letter === state.focus ? ' focused' : ''}${mastered ? ' mastered' : ''}`;
      element.textContent = letter;
      const stat = state.letters[letter];
      element.title = `${letter.toUpperCase()} — ${letter === state.focus ? 'current focus' : index < state.unlocked ? 'unlocked' : 'up next'}${stat?.attempts ? ` · ${Math.round(speed(stat))} wpm · ${Math.round(accuracy(stat))}% accuracy` : ''}`;
      $('letter-strip').append(element);
    });
    $('letter-count').textContent = `${state.unlocked} / 26`;
    $('focus-letter').textContent = state.focus;
    $('next-letter').innerHTML = state.unlocked < 26 ? `UP NEXT <b>${ORDER[state.unlocked]}</b><span>→</span>` : 'ALL LETTERS UNLOCKED <span>✓</span>';
    $('lesson-label').textContent = `LESSON ${String(state.records.length + 1).padStart(2, '0')}`;
    $('lesson-description').textContent = state.unlocked === 8 ? 'The foundations' : 'Growing your range';
  }

  function renderMetrics() {
    refreshDay();
    $('speed').textContent = Math.round(lessonSpeed());
    $('accuracy').textContent = state.run.attempts ? Math.round(accuracy(state.run)) : '—';
    $('practice-time').textContent = formatTime(state.dailyMs);
    $('goal-minutes').textContent = state.settings.goal;
    $('goal-progress').style.width = `${Math.min(100, state.dailyMs / (state.settings.goal * 600))}%`;
    $('speed-target').textContent = `Working toward ${state.settings.speed} wpm`;
    $('accuracy-target').textContent = `Aim for ${state.settings.accuracy}% or higher`;
    const focus = state.run.letters[state.focus];
    $('focus-caption').textContent = focus?.timed ? `${Math.round(speed(focus))} wpm · ${Math.round(accuracy(focus))}% on “${state.focus}”` : 'A new letter, a little more possibility';
    if (state.dailyMs >= state.settings.goal * 60000) $('progress-note').textContent = 'Your daily goal, done. Stay a little longer or enjoy a well-earned break.';
    else $('progress-note').textContent = 'Master your focus letter to unlock the next. Your pace is the right pace.';
  }

  const finger = key => {
    if ("`1qaz0p;/'-=[]\\".includes(key)) return 'pinky';
    if ('2wsx9ol.'.includes(key)) return 'ring';
    if ('3edc8ik,'.includes(key)) return 'middle';
    return 'index';
  };
  function buildKeyboard() {
    const rows = [
      ['`','1','2','3','4','5','6','7','8','9','0','-','=','Backspace'],
      ['Tab','q','w','e','r','t','y','u','i','o','p','[',']','\\'],
      ['Caps Lock','a','s','d','f','g','h','j','k','l',';',"'",'Enter'],
      ['Shift','z','x','c','v','b','n','m',',','.','/','Shift'],
      ['Ctrl','Alt','⌘',' ','⌘','Alt','Ctrl']
    ];
    rows.forEach(row => {
      const wrapper = document.createElement('div');
      wrapper.className = 'keyboard-row';
      row.forEach(key => {
        const element = document.createElement('span');
        element.className = `key ${key.length === 1 ? finger(key) : 'wide'}${['Caps Lock','Shift','Enter'].includes(key) ? ' extra-wide' : ''}${key === ' ' ? ' space' : ''}${'fj'.includes(key) ? ' home' : ''}`;
        element.textContent = key === ' ' ? '' : key.length === 1 ? key.toUpperCase() : key;
        wrapper.append(element);
        keyElements.set(key, element);
      });
      $('keyboard').append(wrapper);
    });
    setKeyboardVisibility();
  }

  function setKeyboardVisibility() {
    $('keyboard-content').hidden = !state.keyboard;
    $('keyboard-toggle').innerHTML = state.keyboard ? 'Hide keyboard <span>⌃</span>' : 'Show keyboard <span>⌄</span>';
    $('keyboard-toggle').setAttribute('aria-expanded', String(state.keyboard));
  }

  function activate() {
    if ($('settings-dialog').open || $('result-dialog').open || $('profile-dialog').open || !state.run || completed) return;
    if (running) { $('typing-input').focus({ preventScroll: true }); return; }
    running = true;
    lastKey = null;
    lastTick = null;
    $('practice-card').classList.add('running');
    $('pause').disabled = false;
    $('typing-input').focus({ preventScroll: true });
    renderCursor();
    announce(`Lesson started. Focus on ${state.focus}.`);
  }

  function tick(now = performance.now()) {
    if (!running || lastTick === null) return;
    // Ignore long idle gaps, including a suspended browser or sleeping computer.
    if (lastKey !== null && now - lastKey >= 15000) {
      pause(true);
      return;
    }
    const elapsed = Math.max(0, now - lastTick);
    refreshDay();
    state.run.ms += elapsed;
    state.totalMs += elapsed;
    state.dailyMs += elapsed;
    lastTick = now;
  }

  function pause(idle = false) {
    if (!running) return;
    if (!idle) tick();
    running = false;
    lastTick = null;
    lastKey = null;
    $('practice-card').classList.remove('running');
    $('start-label').textContent = 'Find your flow again';
    $('start-caption').textContent = idle ? 'A little break. Your progress is right here.' : 'Paused. Pick up right where you left off.';
    $('typing-input').blur();
    renderMetrics();
    save();
    announce('Lesson paused. Press Enter to resume.');
  }

  function type(character) {
    if (!running || completed) return;
    const now = performance.now();
    tick(now);
    if (!running) return;
    const expected = state.run.text[state.run.position];
    if (!expected) return;
    const correct = character === expected;
    const elapsed = lastKey === null ? null : now - lastKey;
    if (lastTick === null) lastTick = now;
    state.run.attempts++;
    state.attempts++;
    if (correct) { state.run.correct++; state.correct++; }
    if (expected !== ' ') {
      for (const dictionary of [state.run.letters, state.letters]) {
        const stat = dictionary[expected] ||= makeStat();
        stat.attempts++;
        if (correct) stat.correct++;
        if (elapsed !== null) { stat.milliseconds += elapsed; if (correct) stat.timed++; }
      }
    }
    lastKey = now;
    error = !correct;
    if (correct) state.run.position++;
    $('typing-hint').textContent = error ? `Try ${expected === ' ' ? 'the space bar' : `“${expected}”`} again. You’ve got this.` : '✧  Find the rhythm. You don’t need to rush.';
    const key = keyElements.get(character);
    if (key) { key.classList.add('pressed'); setTimeout(() => key.classList.remove('pressed'), 130); }
    if (state.run.position === state.run.text.length) {
      state.run.completedWords += state.bank.length;
      state.run.text = ' ' + makeLesson(state.bank);
      state.run.position = 0;
      renderWords();
      if (state.run.completedWords === state.bank.length) announce('First round complete. Keep typing, or choose I’m finished to see your results.');
    } else renderCursor();
    renderMetrics();
    save();
  }

  function finish() {
    if (completed || !state.run || wordsCompleted() < state.bank.length) return;
    tick();
    running = false;
    completed = true;
    lastTick = null;
    lastKey = null;
    const focus = state.focus;
    const stat = state.run.letters[focus] || makeStat();
    const mastered = qualifies(stat, state.settings);
    const record = { focus, words: wordsCompleted(), wpm: Math.round(lessonSpeed()), accuracy: Math.round(accuracy(state.run)), ms: state.run.ms, mastered, focusSpeed: Math.round(speed(stat)), focusAccuracy: Math.round(accuracy(stat)) };
    state.records.push(record);
    if (mastered) {
      if (!state.mastered.includes(focus)) state.mastered.push(focus);
      if (state.unlocked < ORDER.length) {
        state.focus = ORDER[state.unlocked++];
        state.bank = [];
      } else {
        // Once every letter is available, strengthen the least fluent remaining letter.
        state.focus = [...ORDER].sort((a,b) => speed(state.letters[a] || makeStat()) - speed(state.letters[b] || makeStat()))[0];
        state.bank = [];
      }
    }
    $('result-title').textContent = mastered ? 'Room for one more letter.' : 'Practice makes progress.';
    $('result-message').textContent = mastered ? `You reached both targets for “${focus}”. Your next focus is “${state.focus}”.` : `Another little step forward. Let’s keep building confidence with “${focus}” and the same familiar words.`;
    $('result-metrics').innerHTML = `<div><strong>${record.wpm}</strong><span>words / minute</span></div><div><strong>${record.accuracy}%</strong><span>accuracy</span></div><div><strong>${formatTime(record.ms)}</strong><span>active time</span></div>`;
    $('result-detail').textContent = `${record.words} words practiced. Your “${focus}”: ${record.focusSpeed} wpm, ${record.focusAccuracy}% accuracy (${stat.timed} timed correct presses). Target: ${state.settings.speed} wpm and ${state.settings.accuracy}%, with at least 10 timed correct presses.`;
    $('practice-card').classList.remove('running');
    $('result-dialog').showModal();
    // A completed run is never restored as an unfinished lesson.
    state.run = null;
    save();
    renderSession();
    announce($('result-message').textContent);
  }

  function continueLesson() {
    $('result-dialog').close();
    newLesson();
    activate();
  }

  function renderSession() {
    $('session-summary').textContent = `${state.records.length} lessons · ${formatTime(state.totalMs)} of practice`;
    if (!state.records.length) {
      $('session-results').innerHTML = '<p class="empty-state">Your story starts with a single word.<br>Finish a lesson to see your speed, accuracy, and new letters here.</p>';
      return;
    }
    $('session-results').innerHTML = `<table><thead><tr><th>Lesson</th><th>Focus</th><th>Speed</th><th>Accuracy</th><th>Progress</th></tr></thead><tbody>${state.records.slice().reverse().map((record, index) => `<tr><td>${String(state.records.length - index).padStart(2,'0')}</td><td>${record.focus.toUpperCase()}</td><td>${record.wpm} wpm</td><td>${record.accuracy}%</td><td>${record.mastered ? 'Target reached ✓' : 'Building confidence'}</td></tr>`).join('')}</tbody></table>`;
  }

  document.addEventListener('keydown', event => {
    if ($('settings-dialog').open || $('result-dialog').open || $('profile-dialog').open || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); pause(); return; }
    if (event.key === 'Enter' && !running && (event.target === document.body || event.target === $('typing-input'))) { event.preventDefault(); activate(); return; }
    if (!running || event.target !== $('typing-input')) return;
    if (event.key === 'Tab') { pause(); return; }
    if (event.key === 'Backspace') {
      event.preventDefault();
      // Errors hold the cursor in place; clearing feedback doesn't erase attempts.
      error = false;
      renderCursor();
      return;
    }
    if (event.key.length === 1) { event.preventDefault(); if (!event.repeat) type(event.key); }
  });
  $('typing-input').addEventListener('input', event => {
    if (event.isComposing) return;
    if (event.inputType !== 'insertFromPaste' && event.data?.length === 1) type(event.data);
    $('typing-input').value = '';
  });
  $('typing-input').addEventListener('paste', event => event.preventDefault());
  $('profile-button').addEventListener('click', () => {
    pause();
    renderProfile();
    $('profile-input').value = '';
    $('profile-input').setCustomValidity('');
    $('profile-dialog').showModal();
  });
  $('close-profile').addEventListener('click', () => $('profile-dialog').close());
  $('profile-input').addEventListener('input', () => $('profile-input').setCustomValidity(''));
  $('profile-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('profile-input');
    const name = input.value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    input.setCustomValidity(!name ? 'Please enter a name.' : name.length > 40 ? 'Please use 40 characters or fewer.' : '');
    if (!$('profile-form').reportValidity()) return;
    const existing = profiles.find(profile => profile.name.toLowerCase() === name.toLowerCase());
    if (existing) { selectProfile(existing); return; }
    const profile = { id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, name };
    profiles.push(profile);
    selectProfile(profile, true);
  });
  $('typing-input').addEventListener('blur', () => { if (running) pause(); });
  $('typing-area').addEventListener('click', activate);
  $('pause').addEventListener('click', () => pause());
  $('finish-lesson').addEventListener('click', finish);
  $('restart').addEventListener('click', () => { pause(); newLesson(); activate(); });
  $('next-lesson').addEventListener('click', continueLesson);
  $('result-dialog').addEventListener('cancel', event => { event.preventDefault(); $('result-dialog').close(); newLesson(); });
  $('settings-button').addEventListener('click', () => {
    pause();
    for (const key of ['speed','accuracy','goal']) $(`setting-${key}`).value = state.settings[key];
    $('settings-dialog').showModal();
  });
  $('close-settings').addEventListener('click', () => $('settings-dialog').close());
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!$('settings-form').reportValidity()) return;
    for (const key of ['speed','accuracy','goal']) state.settings[key] = Number($(`setting-${key}`).value);
    save();
    renderMetrics();
    $('settings-dialog').close();
    announce('Your preferences have been saved.');
  });
  $('keyboard-toggle').addEventListener('click', () => { state.keyboard = !state.keyboard; setKeyboardVisibility(); save(); });
  $('session-tab').addEventListener('click', () => {
    pause();
    renderSession();
    $('session-panel').hidden = false;
    $('session-tab').classList.add('active');
    $('practice-tab').classList.remove('active');
    $('session-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
  });
  $('practice-tab').addEventListener('click', () => {
    $('session-panel').hidden = true;
    $('session-tab').classList.remove('active');
    $('practice-tab').classList.add('active');
    $('practice-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', () => pause());
  window.addEventListener('pagehide', () => { pause(); save(); });
  window.addEventListener('resize', () => { if (state.run) renderCursor(); });
  setInterval(() => {
    if (!running) return;
    tick();
    renderMetrics();
    if (performance.now() - lastSave > 2000) { save(); lastSave = performance.now(); }
  }, 250);

  try {
    if (!Array.isArray(window.TYPEWELL_WORDS) || !window.TYPEWELL_WORDS.length) throw new Error('Dictionary unavailable');
    buildKeyboard();
    renderProfile();
    if (state.run) state.run = prepareRun(state.run, state.bank);
    if (state.run && state.run.position < state.run.text.length) { renderWords(); renderLetters(); renderMetrics(); }
    else newLesson();
    save();
  } catch (error) {
    console.error(error);
    $('start-label').textContent = 'The words couldn’t load';
    $('start-caption').textContent = 'Reload the page to try again.';
    $('start-button').disabled = true;
  }
})();
