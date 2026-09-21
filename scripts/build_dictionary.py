#!/usr/bin/env python3
"""Create a static browser asset from the machine's system word dictionary."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', nargs='?', default='/usr/share/dict/words')
args = parser.parse_args()
words = sorted({clean for word in Path(args.source).read_text().splitlines()
                if (clean := re.sub('[^a-z]', '', word.lower()))})
target = ROOT / 'data' / 'words.js'
target.parent.mkdir(exist_ok=True)
target.write_text('// Generated from /usr/share/dict/words; lowercase ASCII letters only.\n'
                  + 'window.TYPEWELL_WORDS=' + json.dumps(words, separators=(',', ':')) + ';\n')
print(f'Wrote {len(words):,} unique words to {target}')
