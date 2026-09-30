/* =============================================================
   BINOMAR GROUP — the postcard mailer (sidecar service)
   -------------------------------------------------------------
   One job: POST /api/postcard takes the contact postcard —
   name, reply address, message and an optional paperclip
   attachment — and relays it into the group inbox over Gmail
   SMTP (nodemailer). It sits behind the nginx proxy in the
   compose network and is never exposed to the internet.

   Environment variables
     SMTP_USER      Gmail account that sends   (default binomargroup0@gmail.com)
     SMTP_PASS      its 16-character Google App Password — required to send
     MAIL_TO        inbox that receives        (default: SMTP_USER)
     PORT           listen port                (default 8081)
     ALLOW_ORIGINS  comma-separated origins allowed to POST
                    (default https://binomargroup.com,http://localhost:8080)
     RATE_PER_HOUR  posts allowed per IP per hour   (default 5)
     DAILY_CAP      posts allowed globally per day  (default 100)
     SMTP_ETHEREAL  "1" = send through a throwaway Ethereal test account (dev)

   Local run:   cd mailer  →  npm install  →  SMTP_ETHEREAL=1 node server.mjs
   ============================================================= */
import { createServer } from 'node:http';
import nodemailer from 'nodemailer';
import Busboy from 'busboy';

const SMTP_USER = process.env.SMTP_USER || 'binomargroup0@gmail.com';
const MAIL_TO = process.env.MAIL_TO || SMTP_USER;
const PORT = Number(process.env.PORT) || 8081;
const ALLOW_ORIGINS = (process.env.ALLOW_ORIGINS ||
  'https://binomargroup.com,http://localhost:8080,http://localhost:8081')
  .split(',').map((s) => s.trim()).filter(Boolean);
const RATE_PER_HOUR = Number(process.env.RATE_PER_HOUR) || 5;
const DAILY_CAP = Number(process.env.DAILY_CAP) || 100;

const MAX_FILE_BYTES = 5 * 1024 * 1024;      /* matches the 5 MB the client enforces */
const MAX_BODY_BYTES = 12 * 1024 * 1024;     /* multipart headroom over one 5 MB file */
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
  '.heic', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip']);
const EMAIL_RE = /^\S+@\S+\.\S+$/;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/* ---- the transport: Gmail SMTP, or Ethereal when testing ---- */
let transporter = null;

async function makeTransport() {
  if (transporter) return transporter;
  if (process.env.SMTP_ETHEREAL === '1') {
    const test = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email', port: 587, secure: false,
      auth: { user: test.user, pass: test.pass }
    });
    console.log('[mailer] SMTP_ETHEREAL=1 — using throwaway test account ' + test.user);
    return transporter;
  }
  if (!process.env.SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000, greetingTimeout: 12000, socketTimeout: 20000
  });
  return transporter;
}

/* ---- rate limiting: small in-memory windows (single process, low traffic) ---- */
const perIp = new Map();       /* ip -> [timestamps] */
const globalToday = [];        /* [timestamps] */
let globalDay = new Date().getDate();

function overLimit(ip) {
  const now = Date.now();
  if (globalDay !== new Date().getDate()) { globalDay = new Date().getDate(); globalToday.length = 0; }
  while (globalToday.length && now - globalToday[0] > DAY) globalToday.shift();
  if (globalToday.length >= DAILY_CAP) return 'we have reached today\u2019s postcard limit — please email us directly';

  const hits = (perIp.get(ip) || []).filter((t) => now - t < HOUR);
  if (hits.length >= RATE_PER_HOUR) { perIp.set(ip, hits); return 'too many postcards from your address just now — try again in a while'; }
  hits.push(now);
  globalToday.push(now);
  perIp.set(ip, hits);
  return null;
}

/* ---- helpers ---- */
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clientIp(req) {
  const xf = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket.remoteAddress || 'unknown';
}

/* ---- multipart: pull the fields and (at most) one attachment ---- */
function parsePostcard(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_BYTES, files: 2, fields: 16, fieldSize: 8192 } });
    } catch (e) {
      return reject(new Error('the postcard must arrive as multipart/form-data'));
    }
    const fields = {};
    let file = null;
    let truncated = false;
    let done = false;
    const finish = (err) => { if (!done) { done = true; err ? reject(err) : resolve({ fields, file, truncated }); } };

    bb.on('field', (name, val) => { if (Object.keys(fields).length < 16) fields[name] = val; });
    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('limit', () => { truncated = true; });
      stream.on('close', () => {
        if (info.filename && !file) file = { filename: info.filename, mime: info.mimeType, data: Buffer.concat(chunks) };
      });
    });
    bb.on('error', (e) => finish(new Error('could not read the postcard: ' + (e && e.message))));
    bb.on('finish', () => finish());
    req.pipe(bb);
  });
}

/* ---- the server ---- */
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return json(res, 200, {
        ok: true, service: 'binomar-mailer',
        configured: !!(process.env.SMTP_PASS || process.env.SMTP_ETHEREAL === '1')
      });
    }
    if (url.pathname !== '/api/postcard') return json(res, 404, { ok: false, error: 'not found' });
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'POST only' });

    /* same-origin guard: browsers always send Origin with a fetch POST.
       No Origin (curl, monitors) passes — the rate limits do the guarding. */
    const origin = req.headers.origin;
    if (origin && !ALLOW_ORIGINS.includes(origin)) {
      return json(res, 403, { ok: false, error: 'this postbox only accepts mail from the Binomar site' });
    }

    const len = Number(req.headers['content-length'] || 0);
    if (len > MAX_BODY_BYTES) return json(res, 413, { ok: false, error: 'the postcard is too heavy — the attachment limit is 5 MB' });

    const limited = overLimit(clientIp(req));
    if (limited) return json(res, 429, { ok: false, error: limited });

    const { fields, file, truncated } = await parsePostcard(req);

    /* the honeypot: a field humans never see. Filled = bot — wave it
       through with a fake success so it never retries */
    if ((fields._honey || '').trim()) return json(res, 200, { ok: true });

    const name = String(fields.name || '').trim().slice(0, 80);
    const reply = String(fields.reply || '').trim().slice(0, 120);
    const message = String(fields.message || '').trim().slice(0, 2000);
    if (!name || !message) return json(res, 400, { ok: false, error: 'the postcard needs a name and a message' });

    let attachment = null;
    if (file) {
      if (truncated || file.data.length > MAX_FILE_BYTES) {
        return json(res, 413, { ok: false, error: 'the attachment is over 5 MB — please attach a smaller file' });
      }
      const dot = file.filename.lastIndexOf('.');
      const ext = dot === -1 ? '' : file.filename.slice(dot).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return json(res, 415, { ok: false, error: "that file type can't travel by postcard — images, PDF, documents or zip only" });
      }
      attachment = { filename: file.filename.slice(0, 120), content: file.data, contentType: file.mime || 'application/octet-stream' };
    }

    const tx = await makeTransport();
    if (!tx) {
      console.error('[mailer] refusing to send: SMTP_PASS is not set');
      return json(res, 500, { ok: false, error: 'the postbox is not configured yet — please email us directly' });
    }

    const text = message + '\n\n— ' + name +
      (EMAIL_RE.test(reply) ? '\nWrite back to: ' + reply : '') + '\n\n(sent from the Binomar Group website)';
    const html = `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;background:#101d3f;color:#e8eefc;padding:28px 32px;border-radius:6px;border:2px solid #e3bd63">
    <p style="font-style:italic;font-size:22px;color:#e3bd63;margin:0 0 18px">Greetings from the summit,</p>
    <table style="width:100%;font-size:15px;line-height:1.7" cellpadding="0" cellspacing="0">
      <tr><td style="color:#8fa3c8;width:120px;vertical-align:top">Name</td><td>${esc(name)}</td></tr>
      ${reply ? `<tr><td style="color:#8fa3c8;vertical-align:top">Write back to</td><td>${esc(reply)}</td></tr>` : ''}
      <tr><td style="color:#8fa3c8;vertical-align:top">Message</td><td style="white-space:pre-wrap">${esc(message)}</td></tr>
      ${attachment ? `<tr><td style="color:#8fa3c8;vertical-align:top">Attached</td><td>${esc(attachment.filename)}</td></tr>` : ''}
    </table>
    <p style="color:#8fa3c8;font-size:12px;margin:22px 0 0">Sent from the Binomar Group website</p>
  </div>`;

    const info = await tx.sendMail({
      from: '"Binomar website" <' + SMTP_USER + '>',
      to: MAIL_TO,
      ...(EMAIL_RE.test(reply) ? { replyTo: reply } : {}),
      subject: 'A postcard from ' + name,
      text: text,
      html: html,
      ...(attachment ? { attachments: [attachment] } : {})
    });

    console.log('[mailer] postcard from ' + name + ' delivered (' + info.messageId + ')' +
      (attachment ? ' with ' + attachment.filename : '') +
      (process.env.SMTP_ETHEREAL === '1' ? '\n        preview: ' + nodemailer.getTestMessageUrl(info) : ''));
    return json(res, 200, { ok: true });
  } catch (err) {
    const msg = (err && err.message) || String(err);
    console.error('[mailer] ' + msg);
    if (/EAUTH|invalid login|bad credentials/i.test(msg)) {
      return json(res, 502, { ok: false, error: 'the postbox rejected our key — the Gmail App Password (SMTP_PASS) needs checking' });
    }
    return json(res, 500, { ok: false, error: 'the postcard could not be posted just now — please try again in a minute' });
  }
}).listen(PORT, () => {
  console.log('Binomar mailer listening on :' + PORT +
    '  → ' + (process.env.SMTP_ETHEREAL === '1' ? 'Ethereal (test account)' : MAIL_TO));
});

