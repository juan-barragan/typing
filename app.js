(() => {
  'use strict';
  const { ORDER, MARKS, makeStat, accuracy, speed, isPair, isMark, markOf, baseKey, shiftFor, makeBank, makeSentenceBank, codeUnits, makeCodeBank, makeLesson, prepareRun, qualifies, slowest, weakestPair } = window.Typewell;
  const COMMON = window.TYPEWELL_COMMON || [];
  const PAIRS = window.TYPEWELL_PAIRS || [];
  const SENTENCES = window.TYPEWELL_SENTENCES || [];
  const SNIPPETS = window.TYPEWELL_SNIPPETS || {};
  const LANGUAGES = { python: 'Python', typescript: 'TypeScript' };
  // Each code language practices its own digits and symbols, most frequent first.
  const CODE_UNITS = Object.fromEntries(Object.keys(LANGUAGES).filter(language => SNIPPETS[language]?.length).map(language => [language, codeUnits(SNIPPETS[language])]));
  // How a focus reads in messages: ⇧ means every capital letter, 0-9 every digit.
  const named = unit => unit === '⇧' ? 'capitals' : unit === '0-9' ? 'digits' : `“${unit}”`;
  // Code symbols such as < and & are shown as text wherever HTML is built.
  const escapeHtml = text => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
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
  const fresh = () => ({ version: 1, settings: { speed: 30, accuracy: 95, goal: 15 }, unlocked: 8, focus: 'h', mastered: [], masteredPairs: [], masteredMarks: [], unlockedMarks: 0, bank: [], totalMs: 0, attempts: 0, correct: 0, letters: {}, pairs: {}, marks: {}, records: [], run: null, keyboard: true, mode: 'guided', tracks: {}, code: {} });
  function upgrade(saved) {
    // Saves from before daily goals, letter pairs, sentences, and code mode existed.
    if (!saved.practiceDay) { saved.practiceDay = today(); saved.dailyMs = saved.totalMs; }
    saved.mode ||= 'guided';
    saved.tracks ||= {};
    saved.code ||= {};
    saved.pairs ||= {};
    saved.masteredPairs ||= [];
    saved.marks ||= {};
    saved.masteredMarks ||= [];
    saved.unlockedMarks ||= 0;
    if (saved.run) { saved.run.pairs ||= {}; saved.run.marks ||= {}; }
    return saved;
  }
  // The statistics for the current focus: per letter, per pair once every letter is unlocked, then per mark or symbol.
  const focusStats = owner => /^[a-z]$/.test(state.focus) ? owner.letters : isPair(state.focus) ? owner.pairs : owner.marks;
  const inCode = () => Boolean(CODE_UNITS[state.mode]);
  // Code mode opens once the guided path's sentences are done, ending with digits.
  const codeUnlocked = () => state.masteredMarks.includes(MARKS.at(-1));
  function swapTrack(mode) {
    // Each mode keeps its own focus, bank, and unfinished lesson to come back to.
    state.tracks[state.mode] = { focus: state.focus, bank: state.bank, run: state.run };
    if (mode !== 'guided') state.code[mode] ||= { unlocked: 1, mastered: [] };
    Object.assign(state, state.tracks[mode] || { focus: CODE_UNITS[mode][0], bank: [], run: null }, { mode });
    delete state.tracks[mode];
  }
  // What mastering the focus opens up when it is the last step of a guided stage: after every letter, or after digits.
  const nextStage = () => inCode() ? null : state.unlocked === 26 && /^[a-z]$/.test(state.focus) ? 'letter pairs' : isMark(state.focus) && state.unlockedMarks === MARKS.length && !codeUnlocked() ? 'code mode' : null;
  // A save can't stay in code mode before it unlocks; its code progress waits in its track.
  const enforceCodeLock = () => { if (state.mode !== 'guided' && !codeUnlocked()) swapTrack('guided'); };
  // Words are separated by spaces; code snippets by a blank line.
  const separator = () => inCode() ? '\n\n' : ' ';
  const validFocus = saved => saved.mode && saved.mode !== 'guided' ? Boolean(CODE_UNITS[saved.mode]?.includes(saved.focus)) : /^[a-z]$/.test(saved.focus) || saved.unlocked === 26 && (/^[a-z]{2}$/.test(saved.focus) || isMark(saved.focus) && MARKS.indexOf(saved.focus) < saved.unlockedMarks);
  let state = fresh();
  let storageAvailable = true;
  let migrated = false;
  // Prefer durable progress; recover the previous tab-only save on first upgrade.
  for (const legacy of activeProfile ? [false] : [false, true]) {
    try {
      const saved = JSON.parse(legacy ? sessionStorage.getItem(LEGACY_KEY) : localStorage.getItem(storageKey()));
      if (saved?.version === 1 && Number.isInteger(saved.unlocked) && saved.unlocked >= 8 && saved.unlocked <= 26 && validFocus(saved) && Array.isArray(saved.bank) && saved.settings && Array.isArray(saved.records) && saved.letters && Array.isArray(saved.mastered)) {
        state = saved;
        migrated = legacy;
        break;
      }
    } catch { /* A missing, blocked, or malformed save must not prevent practice. */ }
  }
  upgrade(state);
  enforceCodeLock();
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
  // The Shift key currently held, and a reminder shown after using the same-hand Shift.
  let heldShift = null;
  let shiftHint = '';

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
  // Words in one round: 12 practice words, or however many the round's sentences or snippets contain.
  const roundWords = () => (state.bank.join(' ').match(/\S+/g) || []).length;
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
    state = upgrade(nextState || fresh());
    enforceCodeLock();
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
    if (!state.bank.length) state.bank = inCode() ? makeCodeBank(SNIPPETS[state.mode], state.focus) : isMark(state.focus) ? makeSentenceBank(SENTENCES, MARKS.slice(0, state.unlockedMarks), state.focus) : makeBank(window.TYPEWELL_WORDS, state.unlocked, state.focus, Math.random, COMMON);
    state.run = { text: makeLesson(state.bank, Math.random, separator()), position: 0, completedWords: 0, attempts: 0, correct: 0, ms: 0, letters: {}, pairs: {}, marks: {}, shifted: 0, shiftMisses: 0 };
    error = false;
    shiftHint = '';
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
    const addChar = (parent, character, base = 'char') => {
      const span = document.createElement('span');
      span.dataset.base = base;
      span.className = base;
      span.textContent = character;
      parent.append(span);
      chars.push(span);
    };
    words.classList.toggle('code', inCode());
    $('practice-card').classList.toggle('code-mode', inCode());
    if (inCode()) {
      // One row per line; Enter shows as ↵ and leading indentation is skipped while typing.
      const lines = state.run.text.split('\n');
      lines.forEach((line, index) => {
        const row = document.createElement('div');
        row.className = `code-line${/^\s*(#|\/\/)/.test(line) ? ' comment' : ''}`;
        const indent = line.length - line.trimStart().length;
        [...line].forEach((character, column) => addChar(row, character, column < indent ? 'char indent' : 'char'));
        if (index < lines.length - 1) addChar(row, '↵', 'char newline');
        words.append(row);
      });
    } else {
      const parts = state.run.text.split(' ');
      parts.forEach((word, index) => {
        const wrapper = document.createElement('span');
        wrapper.className = 'word';
        for (const character of word + (index < parts.length - 1 ? ' ' : '')) addChar(wrapper, character);
        words.append(wrapper);
      });
    }
    $('typing-input').setAttribute('aria-label', `Type ${inCode() ? 'this code' : 'these words'}: ${state.run.text}`);
    words.style.transform = '';
    renderCursor();
  }

  function renderCursor() {
    const position = state.run.position;
    chars.forEach((span, index) => { span.className = `${span.dataset.base}${index < position ? ' correct' : ''}${index === position ? ' current' : ''}${index === position && error ? ' error' : ''}`; });
    const current = chars[position];
    if (current) {
      const lineHeight = parseFloat(getComputedStyle($('words')).lineHeight);
      const offset = Math.max(0, current.offsetTop - lineHeight);
      $('words').style.transform = `translateY(-${offset}px)`;
    }
    const done = wordsCompleted();
    $('word-count').textContent = `${done} words`;
    $('word-count').title = `Round ${Math.floor(state.run.completedWords / roundWords()) + 1} · practice as long as you like`;
    $('finish-lesson').hidden = done < roundWords();
    $('practice-shortcuts').hidden = done >= roundWords();
    $('lesson-progress').style.width = `${position / state.run.text.length * 100}%`;
    const next = state.run.text[position];
    const keys = next ? [baseKey(next), shiftFor(next)] : [];
    for (const [key, element] of keyElements) element.classList.toggle('next', keys.includes(key));
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
    const code = inCode();
    const pairStage = !code && isPair(state.focus);
    const sentenceStage = !code && isMark(state.focus);
    $('pair-strip').hidden = !pairStage && !sentenceStage;
    $('pair-strip').replaceChildren();
    if (pairStage || sentenceStage) for (const pair of PAIRS) {
      const element = document.createElement('span');
      element.className = `letter unlocked${pair === state.focus ? ' focused' : ''}${state.masteredPairs.includes(pair) ? ' mastered' : ''}`;
      element.textContent = pair;
      const stat = state.pairs[pair];
      element.title = `${pair.toUpperCase()} — ${pair === state.focus ? 'current focus' : 'common letter pair'}${stat?.timed ? ` · ${Math.round(speed(stat))} wpm · ${Math.round(accuracy(stat))}% accuracy` : ''}`;
      $('pair-strip').append(element);
    }
    $('mark-strip').hidden = !sentenceStage;
    $('mark-strip').replaceChildren();
    if (sentenceStage) MARKS.forEach((mark, index) => {
      const element = document.createElement('span');
      element.className = `letter${index < state.unlockedMarks ? ' unlocked' : ''}${mark === state.focus ? ' focused' : ''}${state.masteredMarks.includes(mark) ? ' mastered' : ''}`;
      element.textContent = mark;
      const stat = state.marks[mark];
      element.title = `${mark === '⇧' ? 'Capitals' : mark === '0-9' ? 'Digits' : mark} —${mark === state.focus ? 'current focus' : index < state.unlockedMarks ? 'unlocked' : 'up next'}${stat?.timed ? ` · ${Math.round(speed(stat))} wpm · ${Math.round(accuracy(stat))}% accuracy` : ''}`;
      $('mark-strip').append(element);
    });
    const units = CODE_UNITS[state.mode] || [];
    const progress = state.code[state.mode];
    $('code-strip').hidden = !code;
    $('code-strip').replaceChildren();
    if (code) units.forEach((unit, index) => {
      const element = document.createElement('span');
      element.className = `letter${index < progress.unlocked ? ' unlocked' : ''}${unit === state.focus ? ' focused' : ''}${progress.mastered.includes(unit) ? ' mastered' : ''}`;
      element.textContent = unit;
      const stat = state.marks[unit];
      element.title = `${unit === '0-9' ? 'Digits' : unit} — ${unit === state.focus ? 'current focus' : index < progress.unlocked ? 'unlocked' : 'up next'}${stat?.timed ? ` · ${Math.round(speed(stat))} wpm · ${Math.round(accuracy(stat))}% accuracy` : ''}`;
      $('code-strip').append(element);
    });
    for (const option of $('mode-select').options) {
      if (option.value === 'guided') continue;
      option.disabled = !codeUnlocked();
      option.textContent = `${LANGUAGES[option.value]} code${codeUnlocked() ? '' : ' (locked)'}`;
    }
    $('mode-select').title = codeUnlocked() ? 'Practice mode' : 'Code mode unlocks once you master digits in sentences, the end of the guided path’s step 3.';
    $('mode-select').value = state.mode;
    $('letter-count').textContent = code ? `${LANGUAGES[state.mode]} · symbols ${progress.unlocked} / ${units.length}` : sentenceStage ? `26 / 26 · pairs ${state.masteredPairs.length} / ${PAIRS.length} · marks ${state.unlockedMarks} / ${MARKS.length}` : pairStage ? `26 / 26 · pairs ${state.masteredPairs.length} / ${PAIRS.length}` : `${state.unlocked} / 26`;
    $('focus-letter').textContent = state.focus;
    const stage = nextStage();
    $('next-letter').innerHTML = stage ? `LAST STEP: MASTER <b>${escapeHtml(state.focus)}</b><span>→</span>${stage.toUpperCase()}` : code ? progress.unlocked < units.length ? `UP NEXT <b>${escapeHtml(units[progress.unlocked])}</b><span>→</span>` : 'EVERY SYMBOL UNLOCKED <span>✓</span>' : state.unlocked < 26 ? `UP NEXT <b>${ORDER[state.unlocked]}</b><span>→</span>` : sentenceStage ? state.unlockedMarks < MARKS.length ? `UP NEXT <b>${escapeHtml(MARKS[state.unlockedMarks])}</b><span>→</span>` : 'EVERYTHING UNLOCKED <span>✓</span>' : pairStage ? `LETTER PAIRS <b>${state.masteredPairs.length} / ${PAIRS.length}</b><span>→</span>` : 'ALL LETTERS UNLOCKED <span>✓</span>';
    $('lesson-label').textContent = `LESSON ${String(state.records.length + 1).padStart(2, '0')}`;
    $('lesson-description').textContent = code ? `${LANGUAGES[state.mode]} code` : sentenceStage ? 'Real sentences' : pairStage ? 'Letter pairs' : state.unlocked === 8 ? 'The foundations' : 'Growing your range';
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
    const focus = focusStats(state.run)[state.focus];
    $('focus-caption').textContent = focus?.timed ? `${Math.round(speed(focus))} wpm · ${Math.round(accuracy(focus))}% on ${named(state.focus)}` : inCode() ? 'Real code, one symbol at a time' : state.focus === '⇧' ? 'Shift with the other hand' : state.focus === '0-9' ? 'Years, times, and amounts' : isMark(state.focus) ? 'A new mark, a little more expression' : isPair(state.focus) ? 'Two letters, one smooth motion' : 'A new letter, a little more possibility';
    if (state.dailyMs >= state.settings.goal * 60000) $('progress-note').textContent = 'Your daily goal, done. Stay a little longer or enjoy a well-earned break.';
    else $('progress-note').textContent = `Reach ${state.settings.speed} wpm and ${state.settings.accuracy}% on ${named(state.focus)} with 10 timed correct presses. Progress is checked after every ${inCode() ? 'round of snippets' : isMark(state.focus) ? 'round of sentences' : '12-word round'}.${{ 'letter pairs': ' Then letter pairs begin.', 'code mode': ' Then code mode unlocks.' }[nextStage()] || ''}`;
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
      ['ShiftLeft','z','x','c','v','b','n','m',',','.','/','ShiftRight'],
      ['Ctrl','Alt','⌘',' ','⌘','Alt','Ctrl']
    ];
    rows.forEach(row => {
      const wrapper = document.createElement('div');
      wrapper.className = 'keyboard-row';
      row.forEach(key => {
        const element = document.createElement('span');
        element.className = `key ${key.length === 1 ? finger(key) : 'wide'}${['Caps Lock','ShiftLeft','ShiftRight','Enter'].includes(key) ? ' extra-wide' : ''}${key === ' ' ? ' space' : ''}${'fj'.includes(key) ? ' home' : ''}`;
        element.textContent = key === ' ' ? '' : key.length === 1 ? key.toUpperCase() : key.startsWith('Shift') ? 'Shift' : key;
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

  function type(character, shift = null) {
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
    if (expected !== ' ' && expected !== '\n') {
      // Lowercase letters, pairs of lowercase letters within a word, and marks: ⇧ covers capitals, 0-9 digits.
      const previous = state.run.text[state.run.position - 1] || '';
      const letter = /[a-z]/.test(expected) ? expected : null;
      const pair = letter && /[a-z]/.test(previous) ? previous + expected : null;
      const mark = markOf(expected);
      for (const [dictionary, key] of [[state.run.letters, letter], [state.letters, letter], [state.run.pairs, pair], [state.pairs, pair], [state.run.marks, mark], [state.marks, mark]]) {
        if (!key) continue;
        const stat = dictionary[key] ||= makeStat();
        stat.attempts++;
        if (correct) stat.correct++;
        if (elapsed !== null) { stat.milliseconds += elapsed; if (correct) stat.timed++; }
      }
    }
    // The Shift side is only known from physical keyboards; a same-hand Shift is a hint, not a mistake.
    const needed = shiftFor(expected);
    if (correct && needed && shift) {
      state.run.shifted++;
      if (shift !== needed) state.run.shiftMisses++;
      shiftHint = shift === needed ? '' : `Nicely typed. For “${expected}”, try the ${needed === 'ShiftLeft' ? 'left' : 'right'} Shift, with the other hand.`;
    }
    lastKey = now;
    error = !correct;
    if (correct) state.run.position++;
    // Like an editor, a new line starts at its indentation.
    if (correct && expected === '\n') while (state.run.text[state.run.position] === ' ') state.run.position++;
    $('typing-hint').textContent = error ? `Try ${expected === ' ' ? 'the space bar' : expected === '\n' ? 'Enter' : `“${expected}”`} again. You’ve got this.` : shiftHint || '✧  Find the rhythm. You don’t need to rush.';
    const key = keyElements.get(baseKey(character));
    if (key) { key.classList.add('pressed'); setTimeout(() => key.classList.remove('pressed'), 130); }
    if (state.run.position === state.run.text.length) {
      // Evaluate before rolling over so the finished round is counted exactly once.
      if (qualifies(focusStats(state.run)[state.focus] || makeStat(), state.settings)) {
        finish();
        return;
      }
      state.run.completedWords += roundWords();
      state.run.text = separator() + makeLesson(state.bank, Math.random, separator());
      state.run.position = 0;
      renderWords();
      if (state.run.completedWords === roundWords()) announce('First round complete. Keep typing, or choose I’m finished to see your results.');
    } else renderCursor();
    renderMetrics();
    save();
  }

  function finish() {
    if (completed || !state.run || wordsCompleted() < roundWords()) return;
    tick();
    running = false;
    completed = true;
    lastTick = null;
    lastKey = null;
    const focus = state.focus;
    const stat = focusStats(state.run)[focus] || makeStat();
    const mastered = qualifies(stat, state.settings);
    const record = { focus, words: wordsCompleted(), wpm: Math.round(lessonSpeed()), accuracy: Math.round(accuracy(state.run)), ms: state.run.ms, mastered, focusSpeed: Math.round(speed(stat)), focusAccuracy: Math.round(accuracy(stat)), shifted: state.run.shifted || 0, shiftMisses: state.run.shiftMisses || 0, mode: state.mode };
    state.records.push(record);
    const marksBefore = state.unlockedMarks;
    const codeBefore = codeUnlocked();
    const code = inCode();
    const progress = state.code[state.mode];
    const symbolsBefore = progress?.unlocked;
    if (mastered && code) {
      // Code mode walks through its language's symbols, then strengthens the slowest one.
      const units = CODE_UNITS[state.mode];
      if (!progress.mastered.includes(focus)) progress.mastered.push(focus);
      state.focus = progress.unlocked < units.length ? units[progress.unlocked++] : slowest(units, state.marks);
      state.bank = [];
    } else if (mastered) {
      const list = isMark(focus) ? state.masteredMarks : isPair(focus) ? state.masteredPairs : state.mastered;
      if (!list.includes(focus)) list.push(focus);
      if (state.unlocked < ORDER.length) state.focus = ORDER[state.unlocked++];
      else if (isMark(focus)) state.focus = state.unlockedMarks < MARKS.length ? MARKS[state.unlockedMarks++] : slowest(MARKS, state.marks);
      else {
        // Once every letter is available, smooth out the least fluent common letter pair.
        state.focus = weakestPair(PAIRS, state.pairs, state.masteredPairs, state.settings);
        // With every pair fluent, real sentences start with capitals and full stops.
        if (!state.focus) { state.unlockedMarks = 2; state.focus = MARKS[0]; }
      }
      state.bank = [];
    }
    const toSentences = !code && isMark(state.focus) && !isMark(focus);
    $('result-title').textContent = !mastered ? 'Practice makes progress.' : code ? progress.unlocked > symbolsBefore ? 'Room for one more symbol.' : 'Smoother every time.' : toSentences ? 'On to real sentences.' : isMark(focus) ? state.unlockedMarks > marksBefore ? state.focus === '0-9' ? 'On to numbers.' : 'Room for one more mark.' : 'Smoother every time.' : isPair(focus) ? 'That pair flows now.' : isPair(state.focus) ? 'Every letter, yours.' : 'Room for one more letter.';
    $('next-lesson').textContent = mastered ? `Practice ${named(state.focus)} →` : `Keep practicing ${named(focus)} →`;
    $('result-message').textContent = mastered ? `You reached both targets for ${named(focus)}. Your next focus is ${!code && isPair(state.focus) ? 'the letter pair ' : ''}${named(state.focus)}${toSentences ? ', in real sentences' : ''}.` : `Another little step forward. Let’s keep building confidence with ${named(focus)} and the same familiar ${code ? 'snippets' : isMark(focus) ? 'sentences' : 'words'}.`;
    if (!codeBefore && codeUnlocked()) $('result-message').textContent += ' Code mode is now unlocked: choose Python or TypeScript in the lesson toolbar.';
    $('result-metrics').innerHTML = `<div><strong>${record.wpm}</strong><span>words / minute</span></div><div><strong>${record.accuracy}%</strong><span>accuracy</span></div><div><strong>${formatTime(record.ms)}</strong><span>active time</span></div>`;
    $('result-detail').textContent = `${record.words} words practiced. Your ${named(focus)}: ${record.focusSpeed} wpm, ${record.focusAccuracy}% accuracy (${stat.timed} timed correct presses). Target: ${state.settings.speed} wpm and ${state.settings.accuracy}%, with at least 10 timed correct presses.${record.shifted ? ` Opposite-hand Shift: ${record.shifted - record.shiftMisses} of ${record.shifted}.` : ''}`;
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
    $('session-results').innerHTML = `<table><thead><tr><th>Lesson</th><th>Focus</th><th>Speed</th><th>Accuracy</th><th>Progress</th></tr></thead><tbody>${state.records.slice().reverse().map((record, index) => `<tr><td>${String(state.records.length - index).padStart(2,'0')}</td><td>${LANGUAGES[record.mode] ? `${LANGUAGES[record.mode]} ` : ''}${escapeHtml(record.focus.toUpperCase())}</td><td>${record.wpm} wpm</td><td>${record.accuracy}%</td><td>${record.mastered ? 'Target reached ✓' : 'Building confidence'}</td></tr>`).join('')}</tbody></table>`;
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Shift') heldShift = ['ShiftLeft', 'ShiftRight'].includes(event.code) ? event.code : null;
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
    // In code mode Enter types a new line; elsewhere it does nothing while typing.
    if (event.key === 'Enter') { event.preventDefault(); if (inCode() && !event.repeat) type('\n'); return; }
    if (event.key.length === 1) { event.preventDefault(); if (!event.repeat) type(event.key, event.shiftKey ? heldShift : null); }
  });
  document.addEventListener('keyup', event => { if (event.key === 'Shift') heldShift = null; });
  $('typing-input').addEventListener('input', event => {
    if (event.isComposing) return;
    if (event.inputType !== 'insertFromPaste' && event.data?.length === 1) type(event.data);
    else if (event.inputType === 'insertLineBreak' && inCode()) type('\n');
    $('typing-input').value = '';
  });
  function switchMode(mode) {
    if (mode === state.mode || (mode !== 'guided' && (!CODE_UNITS[mode] || !codeUnlocked()))) { $('mode-select').value = state.mode; return; }
    pause();
    swapTrack(mode);
    error = false;
    completed = false;
    shiftHint = '';
    $('typing-hint').textContent = '✧  Find the rhythm. You don’t need to rush.';
    if (state.run && state.run.position < state.run.text.length) { renderWords(); renderLetters(); renderMetrics(); }
    else newLesson();
    $('start-label').textContent = state.run.position ? 'Find your flow again' : 'Let’s get typing';
    save();
    announce(`${mode === 'guided' ? 'Guided path' : `${LANGUAGES[mode]} code`} selected. Focus on ${named(state.focus)}.`);
  }
  $('mode-select').addEventListener('change', event => switchMode(event.target.value));
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
    if (!Array.isArray(window.TYPEWELL_WORDS) || !window.TYPEWELL_WORDS.length || !COMMON.length || !PAIRS.length || !SENTENCES.length || !CODE_UNITS.python || !CODE_UNITS.typescript) throw new Error('Dictionary unavailable');
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
