/* Pure lesson logic, shared by the browser and the regression checks. */
(() => {
  const ORDER = 'etaoinshrdlucmfpgwybvkxjqz';
  const makeStat = () => ({ attempts: 0, correct: 0, milliseconds: 0, timed: 0 });
  const accuracy = stat => stat.attempts ? stat.correct / stat.attempts * 100 : 0;
  const speed = stat => stat.milliseconds > 0 ? 12000 * stat.timed / stat.milliseconds : 0;
  // After the letter pairs come real sentences: capitals (⇧) with full stops, then one mark at a time, then digits.
  const MARKS = ['⇧', '.', ',', "'", '?', '!', '-', '"', ';', ':', '0-9'];
  // A focus is a letter, then a two-letter pair once every letter is unlocked, then a mark.
  const isPair = focus => /^[a-z]{2}$/.test(focus);
  const isMark = focus => MARKS.includes(focus);
  // The unit a character practices beyond letters: ⇧ for capitals, 0-9 for digits, or the symbol itself.
  const markOf = c => /[A-Z]/.test(c) ? '⇧' : /[0-9]/.test(c) ? '0-9' : /[a-z \n]/.test(c) ? null : c;
  // The keyboard keys behind a character: its base key, and the Shift on the opposite hand if needed.
  const SHIFTED = { '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/' };
  const LEFT_HAND = '`12345qwertasdfgzxcvb';
  const baseKey = character => character === '\n' ? 'Enter' : SHIFTED[character] || character.toLowerCase();
  const shiftFor = character => SHIFTED[character] || /[A-Z]/.test(character) ? (LEFT_HAND.includes(baseKey(character)) ? 'ShiftRight' : 'ShiftLeft') : null;
  function makeBank(dictionary, unlocked, focus, random = Math.random, common = []) {
    const allowed = new Set(ORDER.slice(0, unlocked));
    const ranks = new Map(common.map((word, rank) => [word, rank]));
    const candidates = dictionary.filter(word => word.length >= 2 && word.length <= 8 && [...word].every(c => allowed.has(c)) && (!isPair(focus) || word.includes(focus)));
    const selected = [];
    // Favor varied, short, everyday words containing the focus, while covering all unlocked letters.
    const uncovered = new Set(allowed);
    const commonness = word => ranks.has(word) ? 4 + 2 * (1 - ranks.get(word) / ranks.size) : 0;
    while (selected.length < 12 && candidates.length) {
      const ranked = candidates.map(word => ({ word, score: (word.includes(focus) ? 5 : 0) + [...new Set(word)].filter(c => uncovered.has(c)).length * 2 + (word.length <= 5 ? 1 : 0) + commonness(word) + random() * 4 }));
      ranked.sort((a, b) => b.score - a.score);
      const word = ranked[0].word;
      selected.push(word);
      [...word].forEach(c => uncovered.delete(c));
      candidates.splice(candidates.indexOf(word), 1);
    }
    if (!selected.length) throw new Error('No words are available for these letters.');
    return selected;
  }
  function makeSentenceBank(sentences, unlocked, focus, random = Math.random) {
    const candidates = sentences.map(sentence => ({ sentence, counts: tally(sentence) }))
      .filter(({ counts }) => counts.has(focus) && [...counts.keys()].every(unit => unlocked.includes(unit)));
    const selected = [];
    // Favor sentences practicing the focus several times, while covering all unlocked marks.
    const uncovered = new Set(unlocked);
    while (selected.length < 6 && candidates.length) {
      const ranked = candidates.map(candidate => ({ candidate, score: Math.min(candidate.counts.get(focus), 3) * 3 + [...candidate.counts.keys()].filter(unit => uncovered.has(unit)).length * 2 + random() * 4 }));
      ranked.sort((a, b) => b.score - a.score);
      const { candidate } = ranked[0];
      selected.push(candidate.sentence);
      candidate.counts.forEach((_, unit) => uncovered.delete(unit));
      candidates.splice(candidates.indexOf(candidate), 1);
    }
    if (!selected.length) throw new Error('No sentences are available for these marks.');
    return selected;
  }
  // How often each unit (⇧, 0-9, or a symbol) occurs in a text.
  function tally(text) {
    const counts = new Map();
    for (const c of text) {
      const unit = markOf(c);
      if (unit) counts.set(unit, (counts.get(unit) || 0) + 1);
    }
    return counts;
  }
  function codeUnits(snippets) {
    // Digits and symbols found in at least 3 snippets, most frequent first; capitals belong to sentences.
    const total = new Map(), spread = new Map();
    for (const counts of snippets.map(tally)) counts.forEach((count, unit) => {
      total.set(unit, (total.get(unit) || 0) + count);
      spread.set(unit, (spread.get(unit) || 0) + 1);
    });
    return [...total.keys()].filter(unit => unit !== '⇧' && spread.get(unit) >= 3).sort((a, b) => total.get(b) - total.get(a));
  }
  function makeCodeBank(snippets, focus, random = Math.random) {
    // Two snippets per round, favoring those that use the focus symbol often.
    const candidates = snippets.map(snippet => ({ snippet, count: tally(snippet).get(focus) || 0 })).filter(({ count }) => count);
    const ranked = candidates.map(({ snippet, count }) => ({ snippet, score: Math.min(count, 8) + random() * 6 }));
    ranked.sort((a, b) => b.score - a.score);
    if (!ranked.length) throw new Error('No snippets are available for this symbol.');
    return ranked.slice(0, 2).map(({ snippet }) => snippet);
  }
  function makeLesson(bank, random = Math.random, separator = ' ') {
    // One round of the bank. The UI supplies further rounds until the user finishes.
    const words = [...bank];
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
    return words.join(separator);
  }
  function prepareRun(run, bank) {
    if (Number.isInteger(run.completedWords)) return run;
    // Keep the cursor and metrics from older 36-word lessons when upgrading.
    const words = [...run.text.matchAll(/\S+/g)];
    const done = words.filter(word => word.index + word[0].length <= run.position).length;
    const completedWords = Math.floor(done / bank.length) * bank.length;
    const previous = words[completedWords - 1];
    const start = previous ? previous.index + previous[0].length : 0;
    const last = words[Math.min(completedWords + bank.length, words.length) - 1];
    const text = completedWords >= words.length ? ' ' + makeLesson(bank) : run.text.slice(start, last.index + last[0].length);
    return { ...run, text, position: completedWords >= words.length ? 0 : run.position - start, completedWords };
  }
  function qualifies(stat, settings) {
    return stat.attempts >= 10 && stat.timed >= 10 && accuracy(stat) >= settings.accuracy && speed(stat) >= settings.speed;
  }
  // Unseen units count as slowest; ties keep the given order.
  const slowest = (units, stats) => units.reduce((weakest, unit) => speed(stats[unit] || makeStat()) < speed(stats[weakest] || makeStat()) ? unit : weakest);
  function weakestPair(pairs, stats, mastered, settings) {
    // Slowest common pair not yet fluent, or null once every pair is.
    const pending = pairs.filter(pair => !mastered.includes(pair) && !qualifies(stats[pair] || makeStat(), settings));
    return pending.length ? slowest(pending, stats) : null;
  }
  window.Typewell = { ORDER, MARKS, makeStat, accuracy, speed, isPair, isMark, markOf, baseKey, shiftFor, makeBank, makeSentenceBank, codeUnits, makeCodeBank, makeLesson, prepareRun, qualifies, slowest, weakestPair };
})();
