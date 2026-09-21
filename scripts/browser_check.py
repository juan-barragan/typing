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
          const {ORDER, makeBank, makeLesson, prepareRun, qualifies, speed, accuracy} = Typewell;
          check(new Set(ORDER).size === 26, 'alphabet');
          for (let n = 8; n <= 26; n++) {
            const focus = ORDER[n-1], bank = makeBank(TYPEWELL_WORDS,n,focus,() => .4);
            check(bank.length === 12 && new Set(bank).size === 12, '12 distinct words at stage ' + n);
            check(bank.every(w => [...w].every(c => ORDER.slice(0,n).includes(c))), 'locked letter at stage ' + n);
            const lesson = makeLesson(bank);
            check(lesson.split(' ').length === 12, '12-word round');
            check([...lesson].filter(c => c === focus).length * 3 >= 10, 'insufficient focus opportunities ' + focus);
            check(bank.every(w => lesson.split(' ').filter(x => x === w).length === 1), 'one complete bank per round');
          }
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
          return 'PASS: dictionary, all 19 unlock stages, coverage, lesson repetition, metric math, promotion gates';
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
          for(let round = 0; round < 3; round++) for (const c of saved().run.text) press(c);
          check(saved().run.completedWords === 48 && !document.getElementById('result-dialog').open, 'no three-round cap');
          check(saved().run.text.trim().split(' ').length === 12 && document.querySelectorAll('.word').length <= 13, 'unlimited practice keeps bounded text');
          press('Escape');
          document.getElementById('finish-lesson').click();
          check(document.getElementById('result-dialog').open && saved().records[0].words === 48, 'manual finish while paused');
          check(saved().records.length === 1 && saved().unlocked === 8, 'failed accuracy blocks unlock');
          document.getElementById('next-lesson').click();
          check(saved().bank.join(',') === bank, 'bank persists until mastery');
          for(let round = 0; round < 3; round++) for (const c of saved().run.text) press(c);
          for(const c of saved().run.text.slice(0,2)) press(c);
          document.getElementById('finish-lesson').click();
          check(saved().records[1].words === 36, 'manual finish during a later round');
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
          check(registry().length === 2 && saved().unlocked === 8 && saved().records.length === 0 && saved().run.position === 0 && saved().settings.speed === 35, 'second profile starts independently');
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
          for (const c of run.text.slice(run.position)) document.getElementById('typing-input').dispatchEvent(new KeyboardEvent('keydown',{key:c,bubbles:true}));
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
        await command('browsingContext.close', {'context': context})
        await command('session.end', {})


asyncio.run(main())
