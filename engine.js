/* Pure lesson logic, shared by the browser and the regression checks. */
(() => {
  const ORDER = 'etaoinshrdlucmfpgwybvkxjqz';
  const makeStat = () => ({ attempts: 0, correct: 0, milliseconds: 0, timed: 0 });
  const accuracy = stat => stat.attempts ? stat.correct / stat.attempts * 100 : 0;
  const speed = stat => stat.milliseconds > 0 ? 12000 * stat.timed / stat.milliseconds : 0;
  function makeBank(dictionary, unlocked, focus, random = Math.random) {
    const allowed = new Set(ORDER.slice(0, unlocked));
    const candidates = dictionary.filter(word => word.length >= 2 && word.length <= 8 && [...word].every(c => allowed.has(c)));
    const selected = [];
    // Favor varied, short words containing the focus letter, while covering all unlocked letters.
    const uncovered = new Set(allowed);
    while (selected.length < 12 && candidates.length) {
      const ranked = candidates.map(word => ({ word, score: (word.includes(focus) ? 5 : 0) + [...new Set(word)].filter(c => uncovered.has(c)).length * 2 + (word.length <= 5 ? 1 : 0) + random() * 4 }));
      ranked.sort((a, b) => b.score - a.score);
      const word = ranked[0].word;
      selected.push(word);
      [...word].forEach(c => uncovered.delete(c));
      candidates.splice(candidates.indexOf(word), 1);
    }
    if (!selected.length) throw new Error('No words are available for these letters.');
    return selected;
  }
  function makeLesson(bank, random = Math.random) {
    // One round of the bank. The UI supplies further rounds until the user finishes.
    const words = [...bank];
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
    return words.join(' ');
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
  window.Typewell = { ORDER, makeStat, accuracy, speed, makeBank, makeLesson, prepareRun, qualifies };
})();
