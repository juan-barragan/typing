## The goal of this app is to creatte an app for helpping typing 
1. Is a web app, mainly front, no server side
2. Let's use /usr/share/dict/words for the words
3. On the current session keep track of the progress of the person working
4. Goal is to improve typing
5. clean the dictionary from all non alpha chars, set all chars to lowercase
5. Algorithm:
    a) Start with the most commun letters, choose 8 for starting
    b) pull randomly a set of words to type having the best combination of those selected letters
    c) track performance of typing. Define two thresholds SPEED and ACCURACY let them be parameters, start with SPEED = 30 wpm ACCURACY at 95%. No moving to next stage if that thresholds are not meet.
    d) keep pulling the same set of words ( say a dozen ) until user reach the requiered speed and accuracy for a given letter.
    e) once the threshold reached for a letter, choose another letter, the next most commun one.
    f) keep pulling random words from that set.
6. UX:
    a) pull the set of words (they can repeat) say arount 30-40 on top. clearly visible with a cursor moving for indicating next caracter to type
    b) have a look to the screenshoot.

## Next steps, once the letters are mastered
Each stage reuses the same idea: a unit of practice (letter, pair, word, symbol…) with the SPEED and ACCURACY gates, always drilling the weakest one.

1. [x] Letter pairs (bigrams). Time the move between two letters of the same word (`th`, `he`, `in`, `er`, `an`, `ing`…). Same-finger pairs (`ed`, `un`, `ce`) and awkward reaches (`br`, `ny`) are usually the slowest. After the 26 letters, drill the least fluent of the 40 most common pairs, with words containing that pair.
2. [x] Real word frequency. Weight word choice with a frequency list (top 10,000 English words) so `the`, `and`, `of`, `that` become automatic, instead of rare dictionary words.
3. [x] Capitals and punctuation, in real sentences. Starts once all 40 letter pairs are mastered or fluent.
    a) [x] Shift with the opposite hand (left Shift for `K`, right Shift for `A`). The keyboard guide shows the right Shift; the wrong hand gives a hint, not a mistake.
    b) [x] Punctuation, one mark at a time after capitals and full stops: `, ' ? ! - " ; :`. Sentences keep apostrophes, so `don't`, `it's` appear.
    c) [x] Real sentences from Tatoeba, 10,000 sentences using only the 5,000 most common words, 6 per round.
    d) [x] Digits in prose for non-programmers (years, times, amounts: "I was born on June 4, 1974."), as the last unit after `:`. Digits count as one unit, `0-9`, and stay out of sentences until unlocked.
4. [x] Numbers and symbols, through a code mode for Python and TypeScript.
    a) [x] Pick "Python code" or "TypeScript code" from the practice selector; each language keeps its own progress, and the guided path is kept where you left it. Locked until step 3 is done (digits mastered).
    b) [x] Real, useful snippets (38 Python, 34 TypeScript, standard library / browser only), each starting with a comment stating its goal, which is typed too. Sources in `snippets/`, checked by `scripts/build_snippets.py` (Python compiles, TypeScript passes `tsc --strict`).
    c) [x] Units are digits (`0-9`, one unit) and every symbol used in at least 3 snippets, most frequent first (Python: `0-9 " ( ) , : . = - _ [ ] # { } ' > * + % / < @ ! |`; TypeScript: `` ( ) : ; . 0-9 = , " { } / > [ ] < ? ` $ - | * + & ' ! # ``). Same speed/accuracy gates, then the slowest.
    d) [x] Enter types a new line; leading indentation is skipped automatically, as an editor would.
5. [ ] Fluency and stamina.
    a) Rhythm: measure how evenly keys are spaced in time, not only the average speed.
    b) Correcting mode: let errors through and require Backspace to fix them, like real typing.
    c) Longer timed tests: 1, 3 and 5 minutes.
    d) Rising targets: once everything passes at 30 WPM, raise the goal step by step (40, 50, 60…) and review the weakest items.
6. [ ] Make the unit of progress general (letter, pair, common word, punctuation mark, symbol) so each new stage reuses the same unlock and promotion logic.
