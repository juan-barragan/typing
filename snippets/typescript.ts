// TypeScript practice snippets for code mode. Each "// %%" starts a snippet
// whose first line is a comment stating its goal. Browser and standard
// library only; every snippet must stand alone and pass `tsc --strict`.
// Rebuild with: python3 scripts/build_snippets.py

// %%
// Debounce a function so it only runs once the user stops typing
function debounce<A extends unknown[]>(fn: (...args: A) => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

const search = debounce((query: string) => console.log(`Searching ${query}`));

// %%
// Throttle scroll handling to at most once every 100 ms
function throttle<A extends unknown[]>(fn: (...args: A) => void, ms = 100) {
  let last = 0;
  return (...args: A): void => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

window.addEventListener("scroll", throttle(() => console.log(scrollY)));

// %%
// Fetch JSON with a timeout so a slow server can't hang the app
async function getJson<T>(url: string, timeoutMs = 5000): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return (await response.json()) as T;
}

// %%
// Retry an async operation with exponential backoff
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await task();
    } catch (error) {
      if (i >= attempts - 1) throw error;
      await sleep(2 ** i * 500);
    }
  }
}

// %%
// Group items by a computed key, e.g. orders by status
function groupBy<T, K extends PropertyKey>(
  items: T[],
  key: (item: T) => K,
): Record<K, T[]> {
  const groups = {} as Record<K, T[]>;
  for (const item of items) {
    (groups[key(item)] ??= []).push(item);
  }
  return groups;
}

// %%
// Check at runtime that unknown API data has the shape you expect
interface User {
  id: number;
  name: string;
  email?: string;
}

function isUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "number" && typeof v.name === "string";
}

// %%
// Return errors as values with a discriminated union instead of throwing
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function parsePort(text: string): Result<number> {
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: `invalid port: "${text}"` };
  }
  return { ok: true, value: port };
}

const parsed = parsePort("8080");
console.log(parsed.ok ? parsed.value : parsed.error);

// %%
// Format prices for the user's locale and currency
const price = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

console.log(price.format(1234.5)); // "$1,234.50"

// %%
// Read and update query string parameters in the current URL
const params = new URLSearchParams(location.search);
const page = Number(params.get("page") ?? "1");
const tags = params.getAll("tag");

params.set("page", String(page + 1));
history.replaceState(null, "", `${location.pathname}?${params}`);
console.log({ page, tags });

// %%
// Remove duplicates by a key, keeping the last occurrence
function uniqueBy<T, K>(items: T[], key: (item: T) => K): T[] {
  return [...new Map(items.map((item): [K, T] => [key(item), item])).values()];
}

const accounts = [{ id: 1, n: "a" }, { id: 2, n: "b" }, { id: 1, n: "c" }];
console.log(uniqueBy(accounts, (a) => a.id)); // ids 1 ("c") and 2

// %%
// Split an array into chunks of a given size
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

console.log(chunk([1, 2, 3, 4, 5], 2)); // [[1, 2], [3, 4], [5]]

// %%
// A tiny typed event emitter for decoupling parts of an app
type Events = { login: { user: string }; logout: undefined };

class Emitter<E extends Record<string, unknown>> {
  #handlers: { [K in keyof E]?: ((payload: E[K]) => void)[] } = {};

  on<K extends keyof E>(event: K, handler: (payload: E[K]) => void) {
    (this.#handlers[event] ??= []).push(handler);
  }

  emit<K extends keyof E>(event: K, payload: E[K]) {
    this.#handlers[event]?.forEach((handler) => handler(payload));
  }
}

const bus = new Emitter<Events>();
bus.on("login", ({ user }) => console.log(`Hello, ${user}`));

// %%
// Save and load typed values in localStorage as JSON
function store<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function restore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

// %%
// Count the whole days between two dates, ignoring daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(start: Date, end: Date): number {
  const utc = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(end) - utc(start)) / DAY_MS);
}

console.log(daysBetween(new Date(2024, 0, 15), new Date(2024, 2, 1))); // 46

// %%
// Capitalize the first letter of every word in a title
function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

console.log(titleCase("the QUICK brown fox")); // "The Quick Brown Fox"

// %%
// Pick a subset of an object's keys with full type safety
function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) result[key] = obj[key];
  return result;
}

const member = { id: 7, name: "Ada", password: "secret" };
console.log(pick(member, ["id", "name"])); // { id: 7, name: "Ada" }

// %%
// Run tasks in parallel and report which ones failed
async function runAll(tasks: (() => Promise<unknown>)[]) {
  const results = await Promise.allSettled(tasks.map((task) => task()));
  const failed = results.filter((r) => r.status === "rejected");
  const ok = results.length - failed.length;
  console.log(`${ok} ok, ${failed.length} failed`);
  return results;
}

// %%
// Memoize a slow single-argument function with a Map cache
function memoize<A, R>(fn: (arg: A) => R): (arg: A) => R {
  const cache = new Map<A, R>();
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg));
    return cache.get(arg)!;
  };
}

const square = memoize((n: number) => n * n);
console.log(square(12)); // 144, computed once

// %%
// Generate a range of numbers lazily, like Python's range()
function* range(start: number, end: number, step = 1): Generator<number> {
  for (let i = start; step > 0 ? i < end : i > end; i += step) yield i;
}

console.log([...range(0, 10, 3)]); // [0, 3, 6, 9]

// %%
// Define allowed values once and derive their type with "as const"
const ROLES = ["viewer", "editor", "admin"] as const;
type Role = (typeof ROLES)[number];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

const role: Role = isRole("editor") ? "editor" : "viewer";

// %%
// Hide internal state with private fields and expose a read-only getter
class Counter {
  #count = 0;

  get value(): number {
    return this.#count;
  }

  increment(by = 1): this {
    this.#count += by;
    return this;
  }
}

console.log(new Counter().increment().increment(5).value); // 6

// %%
// Sort records by several keys: last name, then first name, then age
interface Person {
  first: string;
  last: string;
  age: number;
}

const byName = (a: Person, b: Person): number =>
  a.last.localeCompare(b.last) ||
  a.first.localeCompare(b.first) ||
  a.age - b.age;

const people: Person[] = [{ first: "Ada", last: "Lovelace", age: 36 }];
people.sort(byName);

// %%
// Store feature flags as bits and test them with bitwise operators
enum Flag {
  Read = 1 << 0,
  Write = 1 << 1,
  Admin = 1 << 2,
}

let flags = Flag.Read | Flag.Write;
flags &= ~Flag.Write;
console.log((flags & Flag.Read) !== 0, (flags & Flag.Write) !== 0);
console.log(flags ^ Flag.Admin); // 5: Read plus Admin

// %%
// Build typed CSS class names with template literal types
type Size = "sm" | "md" | "lg";
type Tone = "red" | "blue";
type ClassName = `btn-${Size}-${Tone}`;

function button(size: Size, tone: Tone): ClassName {
  return `btn-${size}-${tone}`;
}

console.log(button("md", "blue")); // "btn-md-blue"

// %%
// Sum and average a list of numbers with reduce
const scores = [72, 88, 95, 61];
const total = scores.reduce((sum, n) => sum + n, 0);
const average = scores.length ? total / scores.length : 0;
console.log(`total ${total}, average ${average.toFixed(1)}`); // 316, 79.0

// %%
// Make the compiler check that a switch handles every case
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "square":
      return shape.side ** 2;
    default: {
      const unreachable: never = shape;
      throw new Error(`unknown shape: ${JSON.stringify(unreachable)}`);
    }
  }
}

// %%
// Escape user text before inserting it into HTML
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

// %%
// Read nested optional settings safely with ?. and ??
interface Config {
  server?: { port?: number; host?: string };
  retries?: number;
}

function describeConfig(config: Config): string {
  const port = config.server?.port ?? 3000;
  const host = config.server?.host ?? "localhost";
  return `${host}:${port} (retries: ${config.retries ?? 0})`;
}

// %%
// Count how often each word appears in a text
function wordCounts(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const word of text.toLowerCase().match(/[a-z']+/g) ?? []) {
    counts[word] = (counts[word] ?? 0) + 1;
  }
  return counts;
}

// %%
// Run async jobs with at most N in flight at the same time
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// %%
// Copy text to the clipboard and report whether it worked
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("Copy failed:", error);
    return false;
  }
}

// %%
// Make every property of a nested object read-only
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

const theme: DeepReadonly<{ ui: { mode: string } }> = {
  ui: { mode: "dark" },
};
// theme.ui.mode = "light"; // error: mode is read-only

// %%
// Wait for an element to appear in the page, e.g. after rendering
function waitFor(selector: string, timeoutMs = 3000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`timed out waiting for ${selector}`));
    }, timeoutMs);
  });
}

// %%
// Validate a password and collect readable error messages
interface Rule {
  test: (value: string) => boolean;
  message: string;
}

const passwordRules: Rule[] = [
  { test: (v) => v.length >= 12, message: "at least 12 characters" },
  { test: (v) => /\d/.test(v), message: "a number" },
  { test: (v) => /[^A-Za-z0-9]/.test(v), message: "a symbol like ! or #" },
];

const problems = (value: string) =>
  passwordRules.filter((r) => !r.test(value)).map((r) => r.message);
