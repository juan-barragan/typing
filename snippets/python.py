# Python practice snippets for code mode. Each "# %%" starts a snippet whose
# first line is a comment stating its goal. Standard library only; every
# snippet must stand alone. Rebuild with: python3 scripts/build_snippets.py

# %%
# Load a JSON config file, falling back to defaults for missing keys
import json
from pathlib import Path

DEFAULTS = {"host": "localhost", "port": 8080, "debug": False}

def load_config(path: str) -> dict:
    file = Path(path)
    if not file.exists():
        return dict(DEFAULTS)
    return {**DEFAULTS, **json.loads(file.read_text())}

# %%
# Retry a flaky function with exponential backoff
import time
from functools import wraps

def retry(attempts=3, delay=0.5):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(attempts):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    if attempt == attempts - 1:
                        raise
                    time.sleep(delay * 2 ** attempt)
        return wrapper
    return decorator

# %%
# Measure how long a block of code takes with a context manager
import time
from contextlib import contextmanager

@contextmanager
def timer(label: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"{label}: {elapsed * 1000:.1f} ms")

# %%
# Split a list into fixed-size batches, e.g. for bulk API calls
def batches(items: list, size: int) -> list[list]:
    return [items[i:i + size] for i in range(0, len(items), size)]

print(batches([1, 2, 3, 4, 5, 6, 7], 3))  # [[1, 2, 3], [4, 5, 6], [7]]

# %%
# Find the 10 most common words in a text file
import re
from collections import Counter

def top_words(path: str, n: int = 10) -> list[tuple[str, int]]:
    with open(path, encoding="utf-8") as file:
        words = re.findall(r"[a-z']+", file.read().lower())
    return Counter(words).most_common(n)

# %%
# Group records by a key, e.g. orders by customer
from collections import defaultdict

def group_by(records: list[dict], key: str) -> dict[str, list[dict]]:
    groups = defaultdict(list)
    for record in records:
        groups[record[key]].append(record)
    return dict(groups)

# %%
# Build a small command-line tool with flags and a positional argument
import argparse

parser = argparse.ArgumentParser(description="Resize images.")
parser.add_argument("folder", help="folder containing the images")
parser.add_argument("-w", "--width", type=int, default=800)
parser.add_argument("--dry-run", action="store_true")
args = parser.parse_args()
print(f"Resizing {args.folder} to {args.width}px (dry run: {args.dry_run})")

# %%
# Find every file with a given extension under a folder, largest first
from pathlib import Path

def find_files(root: str, suffix: str = ".log") -> list[Path]:
    files = [p for p in Path(root).rglob(f"*{suffix}") if p.is_file()]
    return sorted(files, key=lambda p: p.stat().st_size, reverse=True)

# %%
# Read a CSV file into a list of dictionaries, converting numbers
import csv

def read_rows(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    for row in rows:
        row["price"] = float(row["price"])
        row["quantity"] = int(row["quantity"])
    return rows

# %%
# Write a list of dictionaries to a CSV file with a header row
import csv

def write_rows(path: str, rows: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

# %%
# Define a data class that validates its fields on creation
from dataclasses import dataclass, field

@dataclass
class Product:
    name: str
    price: float
    tags: list[str] = field(default_factory=list)

    def __post_init__(self):
        if self.price < 0:
            raise ValueError(f"price must be >= 0, got {self.price}")

# %%
# Cache an expensive recursive function so each value is computed once
from functools import lru_cache

@lru_cache(maxsize=None)
def fibonacci(n: int) -> int:
    return n if n < 2 else fibonacci(n - 1) + fibonacci(n - 2)

print(fibonacci(80))  # 23416728348467685

# %%
# Download JSON from an API using only the standard library
import json
from urllib.request import Request, urlopen

def get_json(url: str, token: str | None = None) -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urlopen(Request(url, headers=headers), timeout=10) as response:
        return json.load(response)

# %%
# Turn a title into a URL-friendly slug: "Hello, World!" -> "hello-world"
import re
import unicodedata

def slugify(title: str) -> str:
    text = unicodedata.normalize("NFKD", title)
    text = text.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")

# %%
# Check whether a string looks like an email address
import re

EMAIL = re.compile(r"^[\w.+-]+@[\w-]+(\.[\w-]+)+$")

def is_email(text: str) -> bool:
    return EMAIL.match(text.strip()) is not None

# %%
# Merge settings: later sources override earlier ones
defaults = {"theme": "light", "font_size": 14, "autosave": True}
user = {"font_size": 16}
cli = {"theme": "dark"}

settings = defaults | user | cli
print(settings)  # {'theme': 'dark', 'font_size': 16, 'autosave': True}

# %%
# Remove duplicates from a list while keeping the original order
def unique(items: list) -> list:
    return list(dict.fromkeys(items))

print(unique([3, 1, 3, 2, 1]))  # [3, 1, 2]

# %%
# Format a byte count as a human-readable size, e.g. 1536 -> "1.5 KB"
def human_size(size: float) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    return f"{size:.1f} {units[index]}"

# %%
# Format a duration in seconds as H:MM:SS for logs and progress bars
def duration(seconds: int) -> str:
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return "%d:%02d:%02d" % (hours, minutes, secs)

print(duration(3725))  # 1:02:05

# %%
# Count the days between two ISO dates, e.g. for a deadline reminder
from datetime import date

def days_between(start: str, end: str) -> int:
    return (date.fromisoformat(end) - date.fromisoformat(start)).days

print(days_between("2024-01-15", "2024-03-01"))  # 46

# %%
# Run many async downloads, but at most 5 at a time
import asyncio

async def fetch_all(urls: list[str], fetch, limit: int = 5) -> list:
    semaphore = asyncio.Semaphore(limit)

    async def worker(url: str):
        async with semaphore:
            return await fetch(url)

    return await asyncio.gather(*(worker(url) for url in urls))

# %%
# Configure logging once, with timestamps and log levels
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)
log.info("Server started on port %d", 8080)

# %%
# Read typed settings from environment variables with defaults
import os

DEBUG = os.environ.get("DEBUG", "0") == "1"
PORT = int(os.environ.get("PORT", "8000"))
HOSTS = [h for h in os.environ.get("HOSTS", "").split(",") if h]

# %%
# Compute a file's SHA-256 without loading it all into memory
import hashlib

def sha256(path: str, chunk_size: int = 1 << 16) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        while chunk := file.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()

# %%
# Map a score to a letter grade with a sorted list of thresholds
from bisect import bisect

def grade(score: float) -> str:
    thresholds = [60, 70, 80, 90]
    return "FDCBA"[bisect(thresholds, score)]

print([grade(s) for s in (55, 70, 89.5, 100)])  # ['F', 'C', 'B', 'A']

# %%
# Keep a moving average of the last N measurements
from collections import deque

class MovingAverage:
    def __init__(self, size: int):
        self.values: deque[float] = deque(maxlen=size)

    def add(self, value: float) -> float:
        self.values.append(value)
        return sum(self.values) / len(self.values)

# %%
# Represent a fixed set of states with an enum
from enum import Enum

class Status(Enum):
    PENDING = "pending"
    PAID = "paid"
    REFUNDED = "refunded"

status = Status("paid")
print(status.name, status is Status.PAID)  # PAID True

# %%
# Compare each item with the next one, e.g. to find price changes
from itertools import pairwise

prices = [100, 104, 101, 110]
changes = [b - a for a, b in pairwise(prices)]
print(changes)  # [4, -3, 9]

# %%
# Test a function with the built-in unittest framework
import unittest

def add(a: int, b: int) -> int:
    return a + b

class AddTest(unittest.TestCase):
    def test_adds_numbers(self):
        self.assertEqual(add(2, 3), 5)

if __name__ == "__main__":
    unittest.main()

# %%
# Store user permissions as bit flags and combine them
from enum import Flag, auto

class Perm(Flag):
    READ = auto()
    WRITE = auto()
    DELETE = auto()

editor = Perm.READ | Perm.WRITE
print(Perm.WRITE in editor, Perm.DELETE in editor)  # True False
print(editor & ~Perm.WRITE)  # Perm.READ

# %%
# Transpose a table: turn rows into columns
rows = [
    ["name", "age", "city"],
    ["Ada", 36, "London"],
    ["Alan", 41, "Wilmslow"],
]
columns = list(zip(*rows))
print(columns[0])  # ('name', 'Ada', 'Alan')

# %%
# Scan a huge log file line by line without loading it into memory
def errors(path: str):
    with open(path, encoding="utf-8") as file:
        for number, line in enumerate(file, start=1):
            if "ERROR" in line:
                yield number, line.rstrip()

for number, line in errors("app.log"):
    print(f"{number:>6}: {line}")

# %%
# Convert user input to a number safely, with a clear error message
def parse_amount(text: str) -> float:
    try:
        amount = float(text.replace(",", ""))
    except ValueError:
        raise ValueError(f"not a number: {text!r}") from None
    if amount <= 0:
        raise ValueError("amount must be positive")
    return round(amount, 2)

# %%
# Order tasks so each one runs after its dependencies
from graphlib import TopologicalSorter

deps = {
    "deploy": {"test", "build"},
    "test": {"build"},
    "build": {"install"},
}
print(list(TopologicalSorter(deps).static_order()))
# ['install', 'build', 'test', 'deploy']

# %%
# Show a progress percentage on one line while processing items
items = list(range(250))
for done, item in enumerate(items, start=1):
    percent = done * 100 // len(items)
    print(f"\rProcessing... {percent:3d}% ({done}/{len(items)})", end="")
print()

# %%
# Check that a JSON payload field has the expected type
from typing import Any

def require(payload: dict[str, Any], key: str, kind: type) -> Any:
    value = payload.get(key)
    if not isinstance(value, kind):
        name = kind.__name__
        raise TypeError(f"{key!r} must be {name}, got {value!r}")
    return value

# %%
# Convert a 0-1 intensity into a hex color channel, clamping bad input
def to_channel(value: float, low: float = 0.0, high: float = 1.0) -> int:
    clamped = max(low, min(high, value))
    return round((clamped - low) / (high - low) * 255)

print(f"#{to_channel(1):02x}{to_channel(0.5):02x}{to_channel(0):02x}")

# %%
# Run a shell command and capture its output safely
import subprocess

result = subprocess.run(
    ["git", "log", "--oneline", "-5"],
    capture_output=True, text=True, check=False,
)
if result.returncode != 0:
    print("git failed:", result.stderr.strip())
else:
    print(result.stdout)
