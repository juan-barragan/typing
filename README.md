# Typewell

A calm, browser-only typing trainer, based on the requirements in `TODO.md`.

## Run

Open `index.html` directly in a browser. There are no dependencies, build steps, accounts, or application servers. Alternatively, serve this directory:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Practice

- Choose **Your name** in the header to add a named profile. Your existing progress transfers to the first name you add; additional people start with their own fresh progress. Use the name/avatar button to switch people. Names ignore differences in capitalization and extra spaces, so entering an existing name resumes that profile.
- Each profile keeps its own preferences, letters, word bank, lesson position, history, and daily goal. The app remembers the last selected name after reopening. These are local browser profiles, without passwords or cross-device synchronization.
- Starts with the eight common English letters `e t a o i n s h`, focusing on `h`.
- Chooses 12 words containing only unlocked letters, favoring the focus letter and coverage of other available letters. Practice continues through shuffled 12-word rounds with no repetition limit. After the first 12 words, **I’m finished** becomes available; choose it at any time to see results and evaluate your focus-letter targets. It also works while paused. The counter shows the total words completed, and the progress bar tracks the current round.
- The bank stays the same between rounds, lessons, and reloads until the focus letter reaches both configurable targets (default: 35 WPM and 95% accuracy).
- A completed lesson needs at least 10 timed, correct presses of the focus letter before it can unlock the next letter in `etaoinshrdlucmfpgwybvkxjqz`. After all letters are unlocked, practice targets the least fluent letter.
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

## Files

- `index.html`: semantic page, controls, and dialogs
- `styles.css`: responsive layout and keyboard styling
- `engine.js`: word selection, lesson generation, and promotion rules
- `app.js`: input, metrics, session state, and UI
- `scripts/build_dictionary.py`: dictionary asset generation

## Browser checks

`scripts/browser_check.py` exercises the actual app in Firefox through WebDriver BiDi. It checks the cleaned dictionary, all unlock stages, accuracy/speed gates, typing and mistakes, pause timing, completion, session restoration, preferences, and mobile input/layout. The script requires Python's `websockets` package only for testing; the app has no runtime dependencies. See the script's header for the local server and isolated Firefox launch commands.
