#!/usr/bin/env python3
"""Browser regression checks via Firefox WebDriver BiDi (requires websockets).

Start a local static server on 8080 and an isolated Firefox instance:
  mkdir -p /tmp/typewell-firefox
  firefox --headless --no-remote --profile /tmp/typewell-firefox --remote-debugging-port 9222
Then: python3 scripts/browser_check.py
"""
import asyncio
import base64
import json
from pathlib import Path
import websockets


async def main():
    async with websockets.connect('ws://127.0.0.1:9222/session', max_size=10_000_000) as ws:
        sequence = 0
        async def command(method, params):
            nonlocal sequence
            sequence += 1
            await ws.send(json.dumps({'id': sequence, 'method': method, 'params': params}))
            while True:
                message = json.loads(await ws.recv())
                if message.get('id') == sequence:
                    if message.get('type') == 'error':
                        raise RuntimeError(message)
                    return message['result']

        await command('session.new', {'capabilities': {}})
        context = (await command('browsingContext.create', {'type': 'tab'}))['context']
        async def evaluate(expression):
            result = await command('script.evaluate', {'expression': expression, 'target': {'context': context}, 'awaitPromise': True})
            if result['type'] == 'exception':
                raise AssertionError(result['exceptionDetails'])
            return result['result'].get('value')

        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 1440, 'height': 1120}})
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/README.md', 'wait': 'complete'})
        await evaluate("Object.keys(localStorage).filter(key => key.startsWith('typewell.')).forEach(key => localStorage.removeItem(key)); sessionStorage.removeItem('typewell.session.v1');")
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        await asyncio.sleep(1)
        print(await evaluate("""(() => {
          function check(value, message) { if (!value) throw new Error(message); }
          window.check = check;
          window.saved = () => JSON.parse(localStorage.getItem('typewell.progress.v1'));
          check(document.querySelectorAll('.letter').length === 26, 'letter strip did not render');
          check(document.querySelectorAll('.char').length > 30, 'practice words did not render');
          check(TYPEWELL_WORDS.every(w => /^[a-z]+$/.test(w)), 'dictionary normalization');
          check(new Set(TYPEWELL_WORDS).size === TYPEWELL_WORDS.length, 'dictionary deduplication');
          const {ORDER, MARKS, makeBank, makeSentenceBank, makeLesson, prepareRun, qualifies, speed, accuracy, slowest, weakestPair, shiftFor, baseKey, markOf} = Typewell;
          check(new Set(ORDER).size === 26, 'alphabet');
          const dictionary = new Set(TYPEWELL_WORDS), common = new Set(TYPEWELL_COMMON);
          check(TYPEWELL_COMMON.length >= 5000 && TYPEWELL_COMMON.every(w => dictionary.has(w)) && common.size === TYPEWELL_COMMON.length, 'common words come from the dictionary');
          check(TYPEWELL_COMMON.slice(0,5).includes('the') && TYPEWELL_PAIRS.length === 40 && TYPEWELL_PAIRS.every(p => /^[a-z]{2}$/.test(p)) && TYPEWELL_PAIRS.includes('th'), 'frequency ranking and letter pairs');
          for (let n = 8; n <= 26; n++) {
            const focus = ORDER[n-1], bank = makeBank(TYPEWELL_WORDS,n,focus,() => .4,TYPEWELL_COMMON);
            check(bank.filter(w => common.has(w)).length >= 8, 'everyday words preferred at stage ' + n);
            check(bank.length === 12 && new Set(bank).size === 12, '12 distinct words at stage ' + n);
            check(bank.every(w => [...w].every(c => ORDER.slice(0,n).includes(c))), 'locked letter at stage ' + n);
            const lesson = makeLesson(bank);
            check(lesson.split(' ').length === 12, '12-word round');
            check([...lesson].filter(c => c === focus).length * 3 >= 10, 'insufficient focus opportunities ' + focus);
            check(bank.every(w => lesson.split(' ').filter(x => x === w).length === 1), 'one complete bank per round');
          }
          for (const pair of TYPEWELL_PAIRS) {
            const bank = makeBank(TYPEWELL_WORDS,26,pair,() => .4,TYPEWELL_COMMON);
            check(bank.length === 12 && new Set(bank).size === 12 && bank.every(w => w.includes(pair)), 'every pair bank word contains ' + pair);
          }
          const fluent = {attempts:20,correct:20,timed:20,milliseconds:6000}, slow = {...fluent,milliseconds:20000};
          const settings = {speed:35,accuracy:95};
          check(weakestPair(['th','he','in'],{},[],settings) === 'th', 'unseen pairs keep frequency order');
          check(weakestPair(['th','he','in'],{th:slow,he:{...slow,milliseconds:30000}},[],settings) === 'in', 'unseen pair before practiced ones');
          check(weakestPair(['th','he','in'],{th:slow,he:{...slow,milliseconds:30000},in:fluent},[],settings) === 'he', 'slowest unfluent pair');
          check(weakestPair(['th','he'],{he:slow},['th'],settings) === 'he', 'mastered pairs skipped');
          check(weakestPair(['th','he'],{th:fluent,he:{...fluent,milliseconds:5000}},['th','he'],settings) === null, 'all pairs fluent: none left');
          check(slowest(['.',',','?'],{'.':fluent,',':slow}) === '?' && slowest(['.',','],{'.':fluent,',':slow}) === ',', 'slowest unit');
          check(TYPEWELL_SENTENCES.length >= 5000 && TYPEWELL_SENTENCES.every(s => /^[A-Z][A-Za-z0-9 .,'?!\\-";:]{19,89}$/.test(s)), 'sentence data');
          check(MARKS.at(-1) === '0-9' && TYPEWELL_SENTENCES.filter(s => /[0-9]/.test(s)).length >= 600, 'digits come last, with enough sentences');
          check(shiftFor('A') === 'ShiftRight' && shiftFor('K') === 'ShiftLeft' && shiftFor('?') === 'ShiftLeft' && shiftFor('!') === 'ShiftRight' && shiftFor('"') === 'ShiftLeft' && shiftFor(':') === 'ShiftLeft', 'opposite Shift');
          check(shiftFor('a') === null && shiftFor('.') === null && shiftFor("'") === null && baseKey('?') === '/' && baseKey('"') === "'" && baseKey('T') === 't', 'base keys');
          for (let n = 2; n <= MARKS.length; n++) {
            const focus = n === 2 ? '⇧' : MARKS[n-1], unlocked = MARKS.slice(0,n);
            const sentences = makeSentenceBank(TYPEWELL_SENTENCES,unlocked,focus,() => .4);
            check(sentences.length === 6 && new Set(sentences).size === 6, '6 sentences for ' + focus);
            check(sentences.every(s => [...s].every(c => !markOf(c) || unlocked.includes(markOf(c)))), 'locked mark in sentences for ' + focus);
            const units = [...makeLesson(sentences)].filter(c => markOf(c) === focus).length;
            check(sentences.every(s => [...s].some(c => markOf(c) === focus)) && units * 2 >= 10, 'focus opportunities for ' + focus);
          }
          const {codeUnits, makeCodeBank} = Typewell;
          for (const language of ['python','typescript']) {
            const snippets = TYPEWELL_SNIPPETS[language], units = codeUnits(snippets);
            const comment = language === 'python' ? '# ' : '// ';
            check(snippets.length >= 30 && snippets.every(s => s.startsWith(comment) && /^[ -~\\n]+$/.test(s) && !/ \\n/.test(s)), 'snippet data ' + language);
            check(units.length >= 20 && units.includes('0-9') && units.includes('(') && !units.includes('⇧'), 'code units ' + language);
            for (const unit of units) {
              check(snippets.filter(s => [...s].some(c => markOf(c) === unit)).length >= 3, 'unit in 3 snippets ' + language + ' ' + unit);
              const code = makeCodeBank(snippets, unit, () => .4);
              check(code.length === 2 && new Set(code).size === 2 && code.every(s => [...s].some(c => markOf(c) === unit)), 'code bank ' + language + ' ' + unit);
            }
          }
          check(codeUnits(TYPEWELL_SNIPPETS.typescript).includes(';') && !codeUnits(TYPEWELL_SNIPPETS.python).includes(';') && codeUnits(TYPEWELL_SNIPPETS.python).includes('@'), 'language-specific units');
          check(baseKey('\\n') === 'Enter' && markOf('7') === '0-9' && markOf('Q') === '⇧' && markOf('q') === null && markOf('{') === '{' && markOf('\\n') === null, 'code keys and units');
          check(makeLesson(['a = 1','b = 2'], () => .4, '\\n\\n').split('\\n\\n').length === 2, 'snippet separator');
          const bank = makeBank(TYPEWELL_WORDS,8,'h',() => .4);
          const round = makeLesson(bank,() => .4);
          for(const position of [2, round.length, round.length + 3, round.length * 2 + 1, round.length * 3 + 2]) {
            const old = {text: [round,round,round].join(' '), position, attempts:position,correct:position,ms:5000,letters:{}};
            const updated = prepareRun(old,bank);
            check(updated.attempts === old.attempts && updated.ms === old.ms, 'legacy metrics retained');
            check(updated.text.trim().split(' ').length === 12, 'legacy lesson reduced to current round');
            if(position < old.text.length) check(updated.text[updated.position] === old.text[position], 'legacy cursor retained');
          }
          const good = {attempts:20,correct:20,timed:20,milliseconds:6000};
          check(speed(good) === 40 && accuracy(good) === 100, 'metric math');
          check(qualifies(good,{speed:35,accuracy:95}), 'valid promotion');
          check(!qualifies({...good,correct:18},{speed:35,accuracy:95}), 'accuracy gate');
          check(!qualifies({...good,milliseconds:10000},{speed:35,accuracy:95}), 'speed gate');
          check(!qualifies({...good,attempts:9,timed:9},{speed:35,accuracy:95}), 'sample gate');
          return 'PASS: dictionary, common words, sentences, all 19 unlock stages, coverage, 40 pair banks, weakest pair, 10 sentence stages including digits, Shift mapping, code units and banks for both languages, lesson repetition, metric math, promotion gates';
        })()"""))

        async def screenshot(name):
            shot = await command('browsingContext.captureScreenshot', {'context': context})
            path = Path('/tmp') / name
            path.write_bytes(base64.b64decode(shot['data']))
            print('Screenshot:', path)

        await screenshot('typewell-desktop.png')
        print(await evaluate("""(() => {
          window.fakeTime = 1000; performance.now = () => fakeTime;
          window.press = key => { fakeTime += 180; document.getElementById('typing-input').dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})); };
          document.getElementById('start-button').click();
          check(document.activeElement.id === 'typing-input', 'start focuses input');
          const first = saved().run.text[0];
          press('!'); check(saved().run.position === 0 && saved().run.attempts === 1, 'mistake stops cursor');
          press('Backspace'); check(saved().run.attempts === 1, 'backspace preserves accuracy');
          press(first); check(saved().run.position === 1 && saved().run.attempts === 2, 'correct key advances');
          const beforeClick = saved().run.ms;
          document.getElementById('typing-area').click();
          press(saved().run.text[1]);
          check(saved().run.ms > beforeClick, 'clicking active area preserves timer');
          press('Escape'); check(!document.getElementById('practice-card').classList.contains('running'), 'pause');
          const time = saved().totalMs; fakeTime += 60000;
          document.getElementById('start-button').click();
          press(saved().run.text[saved().run.position]); check(saved().totalMs === time, 'pause excluded from timing');
          document.getElementById('restart').click(); check(saved().run.position === 0, 'restart');
          check(document.getElementById('finish-lesson').hidden, 'finish hidden before first round');
          document.getElementById('finish-lesson').click();
          check(!document.getElementById('result-dialog').open, 'cannot finish before first round');
          const run = saved().run;
          const bank = saved().bank.join(',');
          const cardHeight = document.getElementById('practice-card').getBoundingClientRect().height;
          // Every focus letter gets one wrong attempt first: accuracy must prevent promotion.
          for (const c of run.text) { if(c === 'h') press('!'); press(c); }
          check(!document.getElementById('result-dialog').open && !document.getElementById('finish-lesson').hidden, 'first round offers finish without popup');
          check(document.activeElement.id === 'typing-input' && document.getElementById('practice-card').classList.contains('running'), 'first round preserves typing focus and timer');
          check(document.getElementById('practice-card').getBoundingClientRect().height === cardHeight, 'finish button must not shift layout');
          check(saved().run.completedWords === 12 && saved().run.text[0] === ' ', 'continuous word separator');
          const pairsTyped = run.text.split(' ').flatMap(w => [...w].slice(1).map((c, i) => w[i] + c));
          check(pairsTyped.every(p => saved().run.pairs[p]?.correct >= 1) && Object.keys(saved().run.pairs).every(p => pairsTyped.includes(p)), 'pairs recorded within words only');
          check(pairsTyped.filter(p => p === 'th').length === (saved().run.pairs.th?.correct || 0), 'pair correct presses counted once');
          for(let round = 0; round < 3; round++) for (const c of saved().run.text) press(c);
          check(saved().run.completedWords === 48 && !document.getElementById('result-dialog').open, 'no three-round cap');
          check(saved().run.text.trim().split(' ').length === 12 && document.querySelectorAll('.word').length <= 13, 'unlimited practice keeps bounded text');
          press('Escape');
          document.getElementById('finish-lesson').click();
          check(document.getElementById('result-dialog').open && saved().records[0].words === 48, 'manual finish while paused');
          check(saved().records.length === 1 && saved().unlocked === 8, 'failed accuracy blocks unlock');
          document.getElementById('next-lesson').click();
          check(saved().bank.join(',') === bank, 'bank persists until mastery');
          // At 33 WPM, the new 30 WPM default should advance automatically.
          window.press = key => { fakeTime += 360; document.getElementById('typing-input').dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true})); };
          for(let round = 0; round < 3 && saved().run; round++) for (const c of saved().run.text) press(c);
          check(document.getElementById('result-dialog').open && saved().run === null, 'targets automatically finish the round');
          check(saved().records[1].words <= 36 && saved().records[1].words % 12 === 0, 'automatic completion counts full rounds once');
          check(document.getElementById('next-lesson').textContent.includes('Practice “r”'), 'next stage button names unlocked letter');
          document.getElementById('finish-lesson').click();
          check(saved().records.length === 2, 'automatic completion cannot be recorded twice');
          check(saved().unlocked === 9 && saved().focus === 'r', 'mastery unlocks next letter');
          check(saved().records.length === 2 && saved().records[1].mastered, 'lesson history');
          document.getElementById('next-lesson').click();
          check(saved().bank.some(w => w.includes('r')), 'next bank includes new letter');
          press(saved().run.text[0]);
          fakeTime += 16000;
          press(saved().run.text[1]);
          check(!document.getElementById('practice-card').classList.contains('running'), 'idle auto-pause');
          check(saved().run.position === 1, 'idle pause retains position');
          document.getElementById('settings-button').click();
          document.getElementById('setting-speed').value = 42;
          document.getElementById('setting-accuracy').value = 97;
          document.getElementById('setting-goal').value = 20;
          document.getElementById('settings-form').requestSubmit();
          check(saved().settings.speed === 42 && saved().settings.accuracy === 97 && saved().settings.goal === 20, 'preferences');
          document.getElementById('keyboard-toggle').click();
          check(document.getElementById('keyboard-content').hidden, 'keyboard toggle');
          document.getElementById('session-tab').click();
          check(!document.getElementById('session-panel').hidden && document.querySelectorAll('#session-results tbody tr').length === 2, 'session history view');
          return 'PASS: input, mistakes, pause timing, restart, stable bank, completion, unlocking, preferences, keyboard toggle, session history';
        })()"""))
        await command('browsingContext.reload', {'context': context, 'wait': 'complete'})
        print(await evaluate("""(() => {
          const state = JSON.parse(localStorage.getItem('typewell.progress.v1'));
          if(state.records.length !== 2 || state.focus !== 'r' || state.settings.speed !== 42 || state.run.position !== 1 || !document.getElementById('keyboard-content').hidden) throw new Error('Session restore failed');
          document.getElementById('keyboard-toggle').click();
          return 'PASS: session survives reload';
        })()"""))
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 390, 'height': 844}})
        await asyncio.sleep(.3)
        print(await evaluate("""(() => {
          if(document.documentElement.scrollWidth > innerWidth) throw new Error('Mobile horizontal overflow');
          document.getElementById('start-button').click();
          const input = document.getElementById('typing-input');
          const s = JSON.parse(localStorage.getItem('typewell.progress.v1'));
          input.dispatchEvent(new InputEvent('input',{data:s.run.text[s.run.position],inputType:'insertText',bubbles:true}));
          if(JSON.parse(localStorage.getItem('typewell.progress.v1')).run.position !== s.run.position + 1) throw new Error('Mobile input failed');
          input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
          return 'PASS: mobile viewport and text input';
        })()"""))
        await screenshot('typewell-mobile.png')
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 1440, 'height': 1120}})
        await evaluate("document.getElementById('start-button').click();")
        await asyncio.sleep(.3)
        await screenshot('typewell-active.png')
        await evaluate("document.getElementById('pause').click();")
        snapshot = await evaluate("localStorage.getItem('typewell.progress.v1')")
        await command('browsingContext.close', {'context': context})
        context = (await command('browsingContext.create', {'type': 'tab'}))['context']
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        restored = await evaluate("localStorage.getItem('typewell.progress.v1')")
        assert json.loads(snapshot) == json.loads(restored), 'Progress changed after closing and reopening the tab'
        assert await evaluate("sessionStorage.getItem('typewell.session.v1') === null"), 'New tab must not depend on session storage'
        print('PASS: complete progress survives closing and reopening the tab')

        # Seed the old format from a same-origin page that has no app save handlers.
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/README.md', 'wait': 'complete'})
        await evaluate("""(() => {
          const old = JSON.parse(localStorage.getItem('typewell.progress.v1'));
          delete old.practiceDay; delete old.dailyMs;
          sessionStorage.setItem('typewell.session.v1', JSON.stringify(old));
          localStorage.removeItem('typewell.progress.v1');
        })()""")
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        print(await evaluate("""(() => {
          const state = JSON.parse(localStorage.getItem('typewell.progress.v1'));
          if (state.records.length !== 2 || state.focus !== 'r' || state.run.position !== 2 || state.settings.speed !== 42 || state.dailyMs !== state.totalMs) throw new Error('Migration lost progress');
          if (sessionStorage.getItem('typewell.session.v1') !== null) throw new Error('Legacy save not retired');
          return 'PASS: existing tab-only progress migrated without losing history, preferences, or lesson position';
        })()"""))
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/README.md', 'wait': 'complete'})
        await evaluate("""(() => {
          const state = JSON.parse(localStorage.getItem('typewell.progress.v1'));
          state.practiceDay = '2000-1-1';
          localStorage.setItem('typewell.progress.v1', JSON.stringify(state));
        })()""")
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        print(await evaluate("""(() => {
          const state = JSON.parse(localStorage.getItem('typewell.progress.v1'));
          if (state.dailyMs !== 0 || state.totalMs <= 0 || state.records.length !== 2 || state.unlocked !== 9 || state.run.position !== 2) throw new Error('Daily rollover lost progress');
          if (document.getElementById('practice-time').textContent !== '0:00') throw new Error('Daily time display');
          return 'PASS: a new day resets only the daily goal, preserving accumulated progress';
        })()"""))
        print(await evaluate("""(() => {
          const check = (value, message) => { if (!value) throw new Error(message); };
          const registry = () => JSON.parse(localStorage.getItem('typewell.profiles.v1'));
          const saved = () => JSON.parse(localStorage.getItem('typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1'));
          const open = () => document.getElementById('profile-button').click();
          const submit = name => {
            document.getElementById('profile-input').value = name;
            document.getElementById('profile-form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
          };
          open(); submit('   ');
          check(document.getElementById('profile-dialog').open && !localStorage.getItem('typewell.profiles.v1'), 'blank name must be rejected');
          submit('  Alex  ');
          check(registry().length === 1 && registry()[0].name === 'Alex', 'first profile creation');
          check(saved().unlocked === 9 && saved().records.length === 2 && saved().settings.speed === 42 && saved().run.position === 2, 'first profile retains existing progress');
          check(!localStorage.getItem('typewell.progress.v1'), 'anonymous progress transferred');
          const alexId = registry()[0].id;
          const alex = localStorage.getItem('typewell.profile.' + alexId + '.v1');
          open(); submit('Sam');
          check(registry().length === 2 && saved().unlocked === 8 && saved().records.length === 0 && saved().run.position === 0 && saved().settings.speed === 30, 'second profile starts independently');
          document.getElementById('start-button').click();
          const input = document.getElementById('typing-input');
          input.dispatchEvent(new KeyboardEvent('keydown',{key:saved().run.text[0],bubbles:true}));
          open();
          check(!document.getElementById('practice-card').classList.contains('running'), 'profile picker pauses typing');
          const samPosition = saved().run.position;
          input.dispatchEvent(new KeyboardEvent('keydown',{key:'a',bubbles:true}));
          check(saved().run.position === samPosition, 'profile name typing cannot alter lesson');
          submit(' aLeX ');
          check(registry().length === 2 && localStorage.getItem('typewell.active-profile.v1') === alexId, 'case-insensitive profile reuse');
          check(localStorage.getItem('typewell.profile.' + alexId + '.v1') === alex, 'other learner cannot modify Alex progress');
          open();
          const sam = registry().find(profile => profile.name === 'Sam');
          document.querySelector('[data-profile-id="' + sam.id + '"]').click();
          check(saved().run.position === 1 && document.getElementById('profile-name').textContent === 'Sam', 'list resumes Sam unfinished lesson');
          open(); submit('<b>Jo</b>');
          check(document.getElementById('profile-name').textContent === '<b>Jo</b>' && !document.querySelector('#profile-name b'), 'name renders as text');
          open();
          check(!document.querySelector('#profile-list b'), 'profile list safely renders names');
          submit('Alex');
          return 'PASS: named profiles, migration, isolated progress, switching, name normalization, validation, and safe rendering';
        })()"""))
        await command('browsingContext.close', {'context': context})
        context = (await command('browsingContext.create', {'type': 'tab'}))['context']
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        print(await evaluate("""(() => {
          const id = localStorage.getItem('typewell.active-profile.v1');
          const state = JSON.parse(localStorage.getItem('typewell.profile.' + id + '.v1'));
          if(document.getElementById('profile-name').textContent !== 'Alex' || state.unlocked !== 9 || state.records.length !== 2 || state.run.position !== 2) throw new Error('Named profile not restored');
          return 'PASS: reopening restores selected name and that person’s complete progress';
        })()"""))
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 390, 'height': 844}})
        await evaluate("document.getElementById('profile-button').click();")
        await asyncio.sleep(.3)
        assert await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile profile layout overflow'
        await screenshot('typewell-profiles-mobile.png')
        await evaluate("""(() => {
          document.getElementById('close-profile').click();
          document.getElementById('start-button').click();
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const run = JSON.parse(localStorage.getItem(key)).run;
          // Keep this lesson below the accuracy target to exercise manual finishing.
          for (const c of run.text.slice(run.position)) {
            if(c !== ' ') document.getElementById('typing-input').dispatchEvent(new KeyboardEvent('keydown',{key:'!',bubbles:true}));
            document.getElementById('typing-input').dispatchEvent(new KeyboardEvent('keydown',{key:c,bubbles:true}));
          }
          document.getElementById('pause').click();
          if(document.getElementById('finish-lesson').hidden) throw new Error('Mobile finish button missing');
        })()""")
        await screenshot('typewell-finish-mobile.png')
        await command('browsingContext.reload', {'context': context, 'wait': 'complete'})
        print(await evaluate("""(() => {
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const run = JSON.parse(localStorage.getItem(key)).run;
          if(run.completedWords !== 12 || run.position !== 0 || document.getElementById('finish-lesson').hidden || document.getElementById('result-dialog').open) throw new Error('Round progress not restored');
          if(document.documentElement.scrollWidth > innerWidth) throw new Error('Mobile finish layout overflow');
          document.getElementById('finish-lesson').click();
          if(!document.getElementById('result-dialog').open) throw new Error('Cannot manually finish restored practice');
          return 'PASS: unlimited round progress and finish availability survive reload; mobile manual finish works';
        })()"""))

        # Jump to the final letter, then master it and one letter pair.
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/README.md', 'wait': 'complete'})
        await evaluate("""(() => {
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const state = JSON.parse(localStorage.getItem(key));
          Object.assign(state, {unlocked: 26, focus: 'z', bank: [], run: null});
          delete state.pairs; delete state.masteredPairs;
          localStorage.setItem(key, JSON.stringify(state));
        })()""")
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 1440, 'height': 1120}})
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        print(await evaluate("""(() => {
          const check = (value, message) => { if (!value) throw new Error(message); };
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const saved = () => JSON.parse(localStorage.getItem(key));
          window.fakeTime = 1000; performance.now = () => fakeTime;
          const press = c => { fakeTime += 150; document.getElementById('typing-input').dispatchEvent(new KeyboardEvent('keydown',{key:c,bubbles:true})); };
          const master = () => {
            document.getElementById('start-button').click();
            for (let round = 0; round < 5 && saved().run; round++) for (const c of saved().run.text.slice(saved().run.position)) press(c);
            check(document.getElementById('result-dialog').open, 'fast typing completes the lesson');
          };
          check(document.getElementById('pair-strip').hidden && saved().masteredPairs.length === 0, 'older saves upgrade without pairs');
          const badge = document.getElementById('next-letter');
          check(badge.textContent.startsWith('LAST STEP: MASTER') && badge.querySelector('b').textContent === 'z' && badge.textContent.endsWith('LETTER PAIRS'), 'badge names the last letter and what it opens');
          check(document.getElementById('progress-note').textContent.endsWith('Then letter pairs begin.'), 'note says pairs come next');
          master();
          const pair = saved().focus;
          check(saved().mastered.includes('z') && TYPEWELL_PAIRS.includes(pair), 'mastering the last letter starts letter pairs');
          check(document.getElementById('result-title').textContent === 'Every letter, yours.' && document.getElementById('next-lesson').textContent.includes(pair), 'pair stage announced');
          document.getElementById('next-lesson').click();
          check(saved().bank.length === 12 && saved().bank.every(w => w.includes(pair)), 'pair bank');
          check(!document.getElementById('pair-strip').hidden && document.querySelectorAll('#pair-strip .letter').length === 40 && document.querySelector('#pair-strip .focused').textContent === pair, 'pair strip');
          check(document.getElementById('focus-letter').textContent === pair && document.getElementById('lesson-description').textContent === 'Letter pairs', 'pair focus shown');
          press('Escape');
          return 'PASS: mastering the last letter starts letter pairs, beginning with “' + pair + '”';
        })()"""))
        await screenshot('typewell-pairs.png')
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 390, 'height': 844}})
        await asyncio.sleep(.3)
        assert await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile pair strip overflow'
        await screenshot('typewell-pairs-mobile.png')
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 1440, 'height': 1120}})
        await command('browsingContext.reload', {'context': context, 'wait': 'complete'})
        print(await evaluate("""(() => {
          const check = (value, message) => { if (!value) throw new Error(message); };
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const saved = () => JSON.parse(localStorage.getItem(key));
          const pair = saved().focus;
          check(TYPEWELL_PAIRS.includes(pair) && saved().records.length > 0 && document.querySelector('#pair-strip .focused')?.textContent === pair, 'pair stage survives reload');
          window.fakeTime = 1000; performance.now = () => fakeTime;
          const press = c => { fakeTime += 150; document.getElementById('typing-input').dispatchEvent(new KeyboardEvent('keydown',{key:c,bubbles:true})); };
          document.getElementById('start-button').click();
          for (let round = 0; round < 5 && saved().run; round++) for (const c of saved().run.text.slice(saved().run.position)) press(c);
          const record = saved().records.at(-1);
          check(record.focus === pair && record.mastered && saved().masteredPairs.includes(pair), 'pair mastery recorded');
          check(saved().focus !== pair && TYPEWELL_PAIRS.includes(saved().focus) && saved().unlocked === 26, 'next weakest pair chosen');
          check(document.getElementById('result-title').textContent === 'That pair flows now.', 'pair result message');
          document.getElementById('next-lesson').click();
          check(document.querySelectorAll('#pair-strip .mastered').length === 1, 'mastered pair marked');
          return 'PASS: last letter leads to letter pairs; pair banks, strip, mastery, and next pair survive reload';
        })()"""))

        # Leave one pair to master, then move on to real sentences.
        pairs = await evaluate('JSON.stringify(TYPEWELL_PAIRS)')
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/README.md', 'wait': 'complete'})
        await evaluate("""(() => {
          const pairs = PAIRS_JSON;
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const state = JSON.parse(localStorage.getItem(key));
          Object.assign(state, {focus: pairs.at(-1), masteredPairs: pairs.slice(0, -1), bank: [], run: null});
          delete state.marks; delete state.masteredMarks; delete state.unlockedMarks;
          localStorage.setItem(key, JSON.stringify(state));
        })()""".replace('PAIRS_JSON', pairs))
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        print(await evaluate("""(() => {
          const check = (value, message) => { if (!value) throw new Error(message); };
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const saved = () => JSON.parse(localStorage.getItem(key));
          const input = document.getElementById('typing-input');
          window.fakeTime = 1000; performance.now = () => fakeTime;
          // Hold the given Shift for shifted characters, like a physical keyboard.
          const press = (c, side) => {
            const shift = side || Typewell.shiftFor(c);
            if (shift) input.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',code:shift,shiftKey:true,bubbles:true}));
            fakeTime += 150;
            input.dispatchEvent(new KeyboardEvent('keydown',{key:c,shiftKey:!!shift,bubbles:true}));
            if (shift) input.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',code:shift,bubbles:true}));
          };
          const typeAll = () => { for (let round = 0; round < 6 && saved().run; round++) for (const c of saved().run.text.slice(saved().run.position)) press(c); };
          check(saved().focus === TYPEWELL_PAIRS.at(-1) && saved().unlockedMarks === 0, 'older saves upgrade without marks');
          document.getElementById('start-button').click();
          typeAll();
          check(saved().focus === '⇧' && saved().unlockedMarks === 2 && saved().masteredPairs.length === 40, 'mastering every pair starts sentences');
          check(document.getElementById('result-title').textContent === 'On to real sentences.' && document.getElementById('next-lesson').textContent.includes('capitals'), 'sentences announced');
          document.getElementById('next-lesson').click();
          press('Escape');
          const bank = saved().bank;
          check(bank.length === 6 && bank.every(s => TYPEWELL_SENTENCES.includes(s) && /^[A-Za-z .]+$/.test(s)), 'capitals bank uses only letters and full stops');
          check(!document.getElementById('mark-strip').hidden && document.querySelectorAll('#mark-strip .letter').length === 11 && document.querySelectorAll('#mark-strip .unlocked').length === 2 && document.querySelector('#mark-strip .focused').textContent === '⇧', 'mark strip');
          check(document.getElementById('lesson-description').textContent === 'Real sentences' && saved().run.text.split(' ').length === bank.join(' ').split(' ').length, 'sentence round');
          const first = saved().run.text[0];
          const nextKeys = [...document.querySelectorAll('.key.next')].map(k => k.textContent);
          check(/[A-Z]/.test(first) && nextKeys.length === 2 && nextKeys.includes('Shift') && nextKeys.includes(first), 'keyboard shows key and opposite Shift');
          document.getElementById('start-button').click();
          press(first, Typewell.shiftFor(first) === 'ShiftLeft' ? 'ShiftRight' : 'ShiftLeft');
          check(saved().run.position === 1 && saved().run.shiftMisses === 1 && saved().run.marks['⇧'].correct === 1, 'same-hand Shift is correct but counted');
          check(document.getElementById('typing-hint').textContent.includes('Shift, with the other hand'), 'same-hand Shift hint');
          const second = saved().run.text[1];
          press(second);
          check(Typewell.shiftFor(second) || document.getElementById('typing-hint').textContent.includes('Shift, with the other hand'), 'hint stays until the next shifted key');
          check(!saved().run.letters[first] && !Object.keys(saved().run.pairs).some(p => /[A-Z]/.test(p)), 'capitals kept out of letters and pairs');
          typeAll();
          const record = saved().records.at(-1);
          check(record.focus === '⇧' && record.mastered && record.shiftMisses === 1 && record.shifted > 1, 'capitals mastered with Shift record');
          check(saved().focus === ',' && saved().unlockedMarks === 3 && saved().masteredMarks.includes('⇧'), 'next mark unlocked');
          check(document.getElementById('result-title').textContent === 'Room for one more mark.' && document.getElementById('result-detail').textContent.includes('Opposite-hand Shift'), 'mark result');
          document.getElementById('next-lesson').click();
          press('Escape');
          check(saved().bank.every(s => s.includes(',') && /^[A-Za-z .,]+$/.test(s)), 'comma bank');
          return 'PASS: last pair leads to sentences; capitals, opposite-Shift hints, mark unlocking, and sentence banks';
        })()"""))
        await screenshot('typewell-sentences.png')
        await command('browsingContext.reload', {'context': context, 'wait': 'complete'})
        print(await evaluate("""(() => {
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const state = JSON.parse(localStorage.getItem(key));
          if (state.focus !== ',' || state.unlockedMarks !== 3 || document.querySelector('#mark-strip .focused')?.textContent !== ',' || !state.run.text.includes(',')) throw new Error('Sentence stage not restored');
          return 'PASS: sentence stage survives reload';
        })()"""))

        # Jump to the last mark, then master it to reach digits in prose.
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/README.md', 'wait': 'complete'})
        await evaluate("""(() => {
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const state = JSON.parse(localStorage.getItem(key));
          // A save left in Python mode before code unlocked must come back to the guided path.
          // 0-9 is Python's most frequent unit, so the later code-mode checks still start fresh.
          Object.assign(state, {mode: 'python', focus: '0-9', bank: [], run: null, unlockedMarks: 10, tracks: {guided: {focus: ':', bank: [], run: null}}, code: {python: {unlocked: 1, mastered: []}}});
          localStorage.setItem(key, JSON.stringify(state));
        })()""")
        await command('browsingContext.navigate', {'context': context, 'url': 'http://127.0.0.1:8080/', 'wait': 'complete'})
        print(await evaluate("""(() => {
          const check = (value, message) => { if (!value) throw new Error(message); };
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const saved = () => JSON.parse(localStorage.getItem(key));
          const input = document.getElementById('typing-input');
          window.fakeTime = 1000; performance.now = () => fakeTime;
          const press = c => {
            const shift = Typewell.shiftFor(c);
            if (shift) input.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',code:shift,shiftKey:true,bubbles:true}));
            fakeTime += 150;
            input.dispatchEvent(new KeyboardEvent('keydown',{key:c,shiftKey:!!shift,bubbles:true}));
            if (shift) input.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',code:shift,bubbles:true}));
          };
          const select = document.getElementById('mode-select');
          const codeOptions = () => [...select.options].filter(o => o.value !== 'guided');
          check(saved().mode === 'guided' && saved().focus === ':' && saved().tracks.python.focus === '0-9' && saved().code.python, 'locked code mode falls back to the guided path, keeping code progress');
          check(codeOptions().every(o => o.disabled && o.textContent.endsWith('(locked)')) && select.value === 'guided', 'code options locked before step 3 is done');
          select.value = 'python'; select.dispatchEvent(new Event('change', {bubbles:true}));
          check(saved().mode === 'guided' && select.value === 'guided', 'locked code mode cannot be chosen');
          check(saved().bank.every(s => s.includes(':') && !/[0-9]/.test(s)), 'no digits before they unlock');
          document.getElementById('start-button').click();
          for (let round = 0; round < 6 && saved().run; round++) for (const c of saved().run.text.slice(saved().run.position)) press(c);
          check(saved().focus === '0-9' && saved().unlockedMarks === 11 && saved().masteredMarks.includes(':'), 'digits unlock after the last mark');
          check(document.getElementById('result-title').textContent === 'On to numbers.' && document.getElementById('next-lesson').textContent.includes('digits'), 'digits announced');
          document.getElementById('next-lesson').click();
          press('Escape');
          check(saved().bank.every(s => /[0-9]/.test(s)) && document.querySelector('#mark-strip .focused').textContent === '0-9', 'digit sentences');
          check(document.getElementById('focus-caption').textContent === 'Years, times, and amounts' && document.getElementById('next-letter').textContent === 'LAST STEP: MASTER 0-9→CODE MODE' && document.getElementById('progress-note').textContent.endsWith('Then code mode unlocks.'), 'digits labels name code mode as next');
          document.getElementById('start-button').click();
          for (let round = 0; round < 6 && saved().run; round++) for (const c of saved().run.text.slice(saved().run.position)) press(c);
          check(saved().records.at(-1).focus === '0-9' && saved().records.at(-1).mastered && saved().marks['0-9'].timed >= 10, 'digits mastered in prose');
          check(document.getElementById('result-message').textContent.includes('Code mode is now unlocked'), 'code unlock announced');
          check(Typewell.MARKS.includes(saved().focus) && saved().unlockedMarks === 11, 'everything unlocked: slowest unit next');
          document.getElementById('next-lesson').click();
          press('Escape');
          check(codeOptions().every(o => !o.disabled && !o.textContent.includes('locked')), 'code options unlocked after digits');
          check(document.getElementById('next-letter').textContent.startsWith('EVERYTHING UNLOCKED') && !document.getElementById('progress-note').textContent.includes('Then'), 'badge once everything is open');
          return 'PASS: digits in prose unlock after the last mark; code mode stays locked until then';
        })()"""))
        print(await evaluate("""(() => {
          const check = (value, message) => { if (!value) throw new Error(message); };
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const saved = () => JSON.parse(localStorage.getItem(key));
          const input = document.getElementById('typing-input');
          const select = document.getElementById('mode-select');
          const choose = mode => { select.value = mode; select.dispatchEvent(new Event('change', {bubbles:true})); };
          window.fakeTime = 1000; performance.now = () => fakeTime;
          const press = c => {
            const shift = Typewell.shiftFor(c);
            if (shift) input.dispatchEvent(new KeyboardEvent('keydown',{key:'Shift',code:shift,shiftKey:true,bubbles:true}));
            fakeTime += 150;
            input.dispatchEvent(new KeyboardEvent('keydown',{key:c === '\\n' ? 'Enter' : c,shiftKey:!!shift,bubbles:true}));
            if (shift) input.dispatchEvent(new KeyboardEvent('keyup',{key:'Shift',code:shift,bubbles:true}));
          };
          const guided = {focus: saved().focus, position: saved().run.position, text: saved().run.text};
          const python = Typewell.codeUnits(TYPEWELL_SNIPPETS.python), typescript = Typewell.codeUnits(TYPEWELL_SNIPPETS.typescript);
          choose('python');
          check(saved().mode === 'python' && saved().focus === python[0] && saved().code.python.unlocked === 1, 'Python mode starts at its most frequent symbol');
          check(saved().tracks.guided.focus === guided.focus && saved().tracks.guided.run.position === guided.position, 'guided lesson kept while coding');
          check(saved().bank.length === 2 && saved().bank.every(s => TYPEWELL_SNIPPETS.python.includes(s)) && saved().run.text.startsWith('# '), 'round of two snippets, starting with a goal comment');
          check(document.getElementById('words').classList.contains('code') && document.querySelectorAll('.code-line').length === saved().run.text.split('\\n').length && document.querySelector('.code-line.comment'), 'code rendered line by line');
          check(document.querySelectorAll('.char').length === saved().run.text.length && document.querySelectorAll('.char.newline').length === saved().run.text.split('\\n').length - 1, 'every character, including Enter, has a cursor position');
          check(!document.getElementById('code-strip').hidden && document.querySelectorAll('#code-strip .letter').length === python.length && document.getElementById('mark-strip').hidden && document.getElementById('pair-strip').hidden, 'code strip');
          check(document.getElementById('lesson-description').textContent === 'Python code' && document.getElementById('focus-letter').textContent === python[0], 'code labels');
          document.getElementById('start-button').click();
          let skipped = 0;
          for (let i = 0; i < 20000 && saved().run; i++) {
            const run = saved().run, c = run.text[run.position];
            press(c);
            const after = saved().run;
            if (c === '\\n' && after) {
              check(after.text[after.position] !== ' ', 'indentation skipped after Enter');
              if (after.position > run.position + 1) skipped++;
            }
          }
          check(skipped > 0, 'indented lines were reached');
          const record = saved().records.at(-1);
          check(record.mode === 'python' && record.focus === python[0] && record.mastered, 'symbol mastered in Python');
          check(saved().focus === python[1] && saved().code.python.unlocked === 2 && saved().code.python.mastered.includes(python[0]), 'next Python symbol');
          check(document.getElementById('result-title').textContent === 'Room for one more symbol.', 'code result');
          check(!saved().letters['\\n'] && !saved().marks['\\n'] && saved().marks['0-9']?.correct > 0, 'Enter not counted as a symbol; digits grouped');
          document.getElementById('next-lesson').click();
          press('Escape');
          choose('typescript');
          check(saved().mode === 'typescript' && saved().focus === typescript[0] && saved().tracks.python.focus === python[1], 'TypeScript keeps separate progress');
          check(saved().run.text.startsWith('// ') && document.getElementById('lesson-description').textContent === 'TypeScript code', 'TypeScript round');
          choose('guided');
          check(saved().mode === 'guided' && saved().focus === guided.focus && saved().run.text === guided.text && saved().run.position === guided.position, 'guided lesson resumes exactly');
          check(!document.getElementById('words').classList.contains('code') && !document.getElementById('mark-strip').hidden && document.getElementById('code-strip').hidden, 'guided rendering restored');
          choose('python');
          check(saved().focus === python[1] && saved().run.position === 0, 'Python resumes its next symbol');
          document.getElementById('session-tab').click();
          check([...document.querySelectorAll('#session-results td')].some(td => td.textContent.startsWith('Python ')), 'history names the language');
          document.getElementById('practice-tab').click();
          return 'PASS: Python and TypeScript code modes, goal comments, Enter and indentation, symbol progression, and switching back to the guided path';
        })()"""))
        await screenshot('typewell-code.png')
        await command('browsingContext.reload', {'context': context, 'wait': 'complete'})
        print(await evaluate("""(() => {
          const key = 'typewell.profile.' + localStorage.getItem('typewell.active-profile.v1') + '.v1';
          const state = JSON.parse(localStorage.getItem(key));
          if (state.mode !== 'python' || document.getElementById('mode-select').value !== 'python' || !document.getElementById('words').classList.contains('code')) throw new Error('Code mode not restored');
          document.getElementById('start-button').click();
          return 'PASS: code mode survives reload';
        })()"""))
        await asyncio.sleep(.3)
        await screenshot('typewell-code-active.png')
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 390, 'height': 844}})
        await asyncio.sleep(.3)
        assert await evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile code mode overflow'
        await screenshot('typewell-code-mobile.png')
        await command('browsingContext.setViewport', {'context': context, 'viewport': {'width': 1440, 'height': 1120}})
        await command('browsingContext.close', {'context': context})
        await command('session.end', {})


asyncio.run(main())
