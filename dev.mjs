/* =============================================================
   BINOMAR GROUP — one-command local dev (npm run dev)
   -------------------------------------------------------------
   Starts BOTH:
     • the site           http://localhost:8080   (server.mjs)
     • the postcard mailer :8081                  (mailer/server.mjs)
   and pipes their output into this one terminal. Ctrl+C stops both.

   Where do postcards go?
     • mailer/.env contains SMTP_PASS=<Gmail App Password> → REAL mail,
       through Gmail, into binomargroup0@gmail.com.
     • otherwise → a throwaway Ethereal test account: no real mail is
       sent, and the mailer prints a preview URL for every postcard.

   Tip: BINOMAR_NO_OPEN=1 stops it opening the browser window.
   ============================================================= */
import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/* mailer/.env — simple KEY=VALUE lines, never committed (.gitignore) */
const env = { ...process.env };
const envFile = join(root, 'mailer', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || !m[2] || m[1] in env) continue;
    /* Gmail displays app passwords in groups of four with spaces —
       the spaces are cosmetic, so strip them for SMTP */
    env[m[1]] = m[1] === 'SMTP_PASS' ? m[2].replace(/\s+/g, '') : m[2];
  }
}

const real = !!env.SMTP_PASS;
if (!real) env.SMTP_ETHEREAL = '1';

console.log('─'.repeat(64));
console.log('  Binomar local dev');
console.log('  site   → http://localhost:8080');
console.log('  mailer → :8081   (POST /api/postcard)');
console.log('  postcards: ' + (real
  ? 'REAL — through Gmail to ' + (env.MAIL_TO || env.SMTP_USER || 'binomargroup0@gmail.com')
  : 'Ethereal test account (no real mail is sent)'));
if (!real) console.log('  real mail: put SMTP_PASS=<Gmail App Password> in mailer/.env');
console.log('─'.repeat(64));

/* pre-flight: both ports must be free — explain instead of stack-tracing */
const portFree = (port) => new Promise((resolve) => {
  const probe = netServer();
  probe.once('error', () => resolve(false));
  probe.once('listening', () => probe.close(() => resolve(true)));
  probe.listen(port);
});
for (const port of [8080, 8081]) {
  if (!(await portFree(port))) {
    console.error('\nPort ' + port + ' is already in use. If another "node server.mjs" is\n' +
      'still running in another terminal, stop it there with Ctrl+C first,\n' +
      'then run  npm run dev  again.');
    process.exit(1);
  }
}

const procs = [];
function start(name, args, cwd, childEnv) {
  const p = spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push({ name, p });
  const pending = { out: '', err: '' };
  const hook = (stream, key) => stream.on('data', (d) => {
    pending[key] += d;
    const lines = pending[key].split('\n');
    pending[key] = lines.pop();
    for (const l of lines) if (l.trim()) console.log('[' + name + '] ' + l.trimEnd());
  });
  hook(p.stdout, 'out');
  hook(p.stderr, 'err');
}

start('site',   ['server.mjs'], root,               process.env);
start('mailer', ['server.mjs'], join(root, 'mailer'), env);

/* Ctrl+C — or one child dying — stops everything */
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  console.log('\nstopping…');
  for (const { p } of procs) { try { p.kill(); } catch (e) { /* already gone */ } }
  setTimeout(() => process.exit(0), 400);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const { name, p } of procs) {
  p.on('exit', () => { if (!stopping) { console.log('[' + name + '] exited — stopping everything'); stop(); } });
}

/* open the site in the default browser unless told not to */
if (!process.env.BINOMAR_NO_OPEN) {
  setTimeout(() => {
    if (stopping) return;
    const url = 'http://localhost:8080';
    const child = process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' })
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore' });
    child.on('error', () => { /* opening the browser is a nicety, never fatal */ });
  }, 1200);
}
