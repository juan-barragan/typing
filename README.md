# Typewell

A calm, browser-only typing trainer, based on the requirements in `TODO.md`.

## Run

The generated data (`data/words.js`, `data/common.js`, `data/sentences.js` and `data/snippets.js`) is checked in, so the app works straight after cloning. There are no dependencies, build steps, accounts, or application servers.

Open `index.html` directly in a browser, or serve this directory:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## First-time setup for the scripts

You only need this to regenerate the word data or run the browser checks. The app itself does not need it.

1. Python 3.8 or newer: `python3 --version`.
2. For the browser checks only: Firefox and the `websockets` package.

   ```sh
   python3 -m pip install websockets
   ```

3. Regenerate the data in this order, because each step reads the previous one: the common words are matched against the dictionary, and sentences may only use common words.

   ```sh
   python3 scripts/build_dictionary.py        # writes data/words.js
   curl -o /tmp/en_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt
   python3 scripts/build_frequency.py /tmp/en_50k.txt   # writes data/common.js
   curl -o /tmp/eng_sentences.tsv.bz2 https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2   # about 25 MB
   python3 scripts/build_sentences.py /tmp/eng_sentences.tsv.bz2   # writes data/sentences.js
   ```

   Each script can also be run on its own when only its input changes. The sentence build takes about a minute.

   The code snippets are written by hand in `snippets/python.py` and `snippets/typescript.ts`. After editing either file, rebuild:

   ```sh
   npm install -g typescript                  # once, to get tsc for type-checking (optional)
   python3 scripts/build_snippets.py          # writes data/snippets.js
   ```

   The build refuses to write the data if any snippet breaks a rule. Without `tsc` it skips the TypeScript type check and prints a warning.

   `build_dictionary.py` reads `/usr/share/dict/words` by default. The macOS file differs from the bundled Ubuntu `wamerican` list, so only rebuild the dictionary if you mean to change it. See [Dictionary](#dictionary).

4. Run the browser checks with two background processes, a static server and an isolated headless Firefox, then the script:

   ```sh
   python3 -m http.server 8080 --bind 127.0.0.1 &
   mkdir -p /tmp/typewell-firefox
   # macOS: /Applications/Firefox.app/Contents/MacOS/firefox instead of firefox
   firefox --headless --no-remote --profile /tmp/typewell-firefox --remote-debugging-port 9222 &
   python3 scripts/browser_check.py
   ```

   Each step prints a `PASS:` line, and screenshots are written to `/tmp/typewell-*.png`. Afterwards, stop both processes: `kill %1 %2`, or close the terminal. The checks clear this site's `typewell.*` storage at `127.0.0.1:8080`, so don't use that address for real practice.

## Practice

- Choose **Your name** in the header to add a named profile. Your existing progress transfers to the first name you add; additional people start with their own fresh progress. Use the name/avatar button to switch people. Names ignore differences in capitalization and extra spaces, so entering an existing name resumes that profile.
- Each profile keeps its own preferences, letters, word bank, lesson position, history, and daily goal. The app remembers the last selected name after reopening. These are local browser profiles, without passwords or cross-device synchronization.
- Starts with the eight common English letters `e t a o i n s h`, focusing on `h`.
- Chooses 12 words containing only unlocked letters, favoring everyday words (by frequency rank), the focus letter, and coverage of other available letters. Practice continues through shuffled 12-word rounds with no repetition limit. At the end of every 12-word round, reaching your focus-letter targets automatically completes the lesson and unlocks the next letter. Choose **Practice “[next letter]”** to begin its new word bank. If you need more practice, rounds continue and **I’m finished** becomes available; choose it at any time to see results. It also works while paused. The counter shows the total words completed, and the progress bar tracks the current round.
- The bank stays the same between rounds, lessons, and reloads until the focus letter reaches both configurable targets (default for new profiles: 30 WPM and 95% accuracy).
- Progress uses the current lesson’s focus-letter statistics, checked after each round or when you finish manually. Saved target preferences are preserved. A completed lesson needs at least 10 timed, correct presses of the focus letter before it can unlock the next letter in `etaoinshrdlucmfpgwybvkxjqz`.
- **Letter pairs.** Every press of a letter that follows another letter in the same word is also timed as a pair (`th`, `he`, `in`…). Pair statistics are kept from the first lesson. Once all 26 letters are unlocked and the last one is mastered, lessons focus on the letter pairs. Unlocking the last letter is not enough: until it is mastered, the badge reads "LAST STEP: MASTER z → LETTER PAIRS", and the note beside it ends with "Then letter pairs begin." The pair lessons focus on the 40 most common English pairs, which appear as a second strip under the letters. The next focus is the slowest pair not yet mastered or already fluent; unseen pairs come first, in frequency order. Each word in a pair lesson contains the pair, and the pair must reach the same speed, accuracy, and 10-press targets. Pairs only count lowercase letters, so `Th` is not `th`.
- **Real sentences.** When every common pair is mastered or already fluent, lessons become six real sentences per round. The focus starts with capitals (`⇧`, every Shift + letter), with full stops. Then one punctuation mark unlocks at a time: `, ' ? ! - " ; :`. Digits (`0-9`, one unit) come last, in everyday numbers such as years, times, and amounts ("I was born on June 4, 1974."). Every sentence in a lesson contains the focus and uses only unlocked marks, so no digits appear before they unlock. Marks appear as a third strip. Once everything is unlocked, practice targets the slowest mark, digits, or capitals.
- **Opposite Shift.** For capitals and shifted marks, the keyboard guide lights the base key and the Shift on the other hand (left Shift for `K` and `?`, right Shift for `A` and `!`). Using the same-hand Shift still counts as correct, but shows a gentle hint and is counted in the lesson results. Mobile keyboards don't report which Shift was used, so this is not checked there.
- **Code mode.** The selector in the lesson toolbar switches between **Guided path**, **Python code** and **TypeScript code**.
  - **When it opens.** The code options stay locked, greyed out and marked "(locked)", until the guided path's step 3 is done, that is until digits, the last sentence unit, are mastered. Until then, the badge reads "LAST STEP: MASTER 0-9 → CODE MODE". The result screen announces when code mode opens.
  - **Older saves.** A save that is in code mode while still locked returns to the guided path; its code progress is kept for when code mode opens.
  - Each mode keeps its own focus, lesson, and unfinished round, so switching back resumes exactly where you were. In code mode, each round is two real snippets. Each snippet starts with a comment stating its goal, which you type too.
  - **Units.** Code mode practises digits (`0-9`, one unit) and every symbol that appears in at least 3 of that language's snippets, most frequent first. Each language has its own order and progress.
  - **Snippet choice.** Snippets that use the focus symbol more often are preferred. The focus must reach the usual targets to move on; once every symbol is done, practice targets the slowest.
  - **New lines and indentation.** Press Enter at the end of each line (shown as `↵`). Leading indentation is skipped automatically, as an editor would.
  - **Shared statistics.** Letters, pairs, and symbol statistics are shared with the guided path. A `(` is a `(` wherever you type it.
- Mistakes stop the cursor: type the correct character to continue. Every attempt counts toward accuracy, including corrected mistakes. Backspace clears error feedback; it never erases recorded attempts.
- Overall speed is correct characters / 5 / active minutes, shown after the first second. Per-letter speed uses the time preceding each press, including time spent making mistakes. The first press after starting or resuming is not timed.
- Click the practice area or press Enter to start. Escape, leaving the tab/window, or 15 seconds without a keystroke pauses the lesson. Paste and held-key repeats do not count as practice.
- Preferences, the unfinished lesson, unlocked letters, letter performance, and completed lessons are saved in `localStorage` and survive closing tabs and restarting the browser. Existing tab-only progress is migrated automatically on the first reload. Progress belongs to this browser profile and site address; clearing site data removes it. If storage is unavailable, the app works in memory. No data leaves the browser.
- Daily practice time resets on a new local calendar day; all-time practice totals, lesson history, and letter progress are retained.
- The keyboard guide is QWERTY; the physical characters you type determine correctness. Mobile text input is supported.

## Dictionary

`data/words.js` is generated from `/usr/share/dict/words`. The generator lowercases entries, removes everything except ASCII `a`–`z`, drops empty entries, and deduplicates. Lessons use words between two and eight letters long. The browser uses the checked-in asset and never needs access to the system dictionary.

```sh
python3 scripts/build_dictionary.py
# Or supply a different dictionary file:
python3 scripts/build_dictionary.py /path/to/words
```

The bundled source dictionary is Ubuntu's `wamerican` word list, derived from SCOWL. Its redistribution notices are in `data/DICTIONARY-LICENSE.txt`.

`data/common.js` holds `TYPEWELL_COMMON`, the 10,000 most frequent words in rank order, and `TYPEWELL_PAIRS`, the 40 most common letter pairs inside words, weighted by word frequency. It is generated by `scripts/build_frequency.py` from the [FrequencyWords](https://github.com/hermitdave/FrequencyWords) English 50k list (OpenSubtitles 2018, content licensed CC BY-SA 4.0). Only entries made solely of `a`–`z` that already exist in `data/words.js` are kept; fragments such as `'s` are dropped rather than stripped. Because the source is film subtitles, the ranking leans conversational (`you`, `yeah`) and includes casual profanity and character names. `--words` and `--pairs` change the list sizes.

`data/sentences.js` holds `TYPEWELL_SENTENCES`, 10,000 short English sentences from [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR), generated by `scripts/build_sentences.py`. A sentence is kept only if:

- it is 20–90 characters long and starts with a capital;
- it uses only letters, digits, spaces and `. , ' ? ! - " ; :`;
- every word, including each part of a contraction such as `don't`, is among the 5,000 most common words.

About a million sentences qualify. The script picks 600 for each mark and 600 with digits, so rare marks such as `;` and `:` have enough examples, fills the rest at random, and keeps sentences naming Tatoeba's ever-present "Tom" and "Mary" to at most 10%. The selection is reproducible (fixed random seed). `--sentences`, `--vocabulary` and `--per-mark` change the sizes.

`data/snippets.js` holds `TYPEWELL_SNIPPETS`, the Python and TypeScript snippets for code mode. They are generated by `scripts/build_snippets.py` from `snippets/python.py` and `snippets/typescript.ts`. Each snippet starts after a `# %%` or `// %%` line, and its first line is a comment stating its goal.

The build enforces these rules:

- ASCII only, spaces rather than tabs, no trailing whitespace;
- at most 79 columns and 3–20 lines;
- each snippet stands alone: Python snippets must compile, and TypeScript snippets must pass `tsc --strict` (ES2022 + DOM), each checked as its own module.

Snippets use only the standard library or browser APIs.

## Files

- `index.html`: semantic page, controls, and dialogs
- `styles.css`: responsive layout and keyboard styling
- `engine.js`: word and sentence selection, Shift key mapping, lesson generation, and promotion rules
- `app.js`: input, metrics, session state, and UI
- `scripts/build_dictionary.py`: dictionary asset generation
- `scripts/build_frequency.py`: common words and letter pairs asset generation
- `scripts/build_sentences.py`: real sentences asset generation
- `snippets/python.py`, `snippets/typescript.ts`: hand-written code-mode snippets
- `scripts/build_snippets.py`: snippet validation and code-mode asset generation
- `scripts/browser_check.py`: browser regression checks

## Browser checks

`scripts/browser_check.py` exercises the actual app in Firefox through WebDriver BiDi. It checks the cleaned dictionary, common words, all unlock stages, letter pair banks and selection, accuracy/speed gates, typing and mistakes, pair statistics, pause timing, completion, the transition to letter pairs, sentence banks for every mark and digits, Shift key mapping, the transition to digits, the transition to sentences, opposite-Shift hints, code units and snippet banks, code mode switching, Enter and auto-indentation, session restoration, preferences, and mobile input/layout. The script requires Python's `websockets` package only for testing; the app has no runtime dependencies. See [First-time setup for the scripts](#first-time-setup-for-the-scripts) for how to launch it.
