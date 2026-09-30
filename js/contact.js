/* =============================================================
   BINOMAR GROUP — the postcard (contact section)
   -------------------------------------------------------------
   The message side posts the postcard to our own mailer
   (/api/postcard — the Node sidecar in ./mailer, relayed over
   Gmail SMTP): the name, reply address, message and an optional
   paperclip attachment land directly in the group inbox — the
   visitor needs no mail app. If the mailer can't be reached we
   fall back to a mailto: draft so nothing is lost. The postcard
   lands with a little theatre the first time it scrolls into
   view (style.css: .postcard.landed); the address side's copy
   buttons put the email or phone on the clipboard.
   ============================================================= */
const TO = 'binomargroup0@gmail.com';
const ENDPOINT = '/api/postcard';               /* our own mailer (./mailer), proxied by nginx */
const MAX_FILE_BYTES = 5 * 1024 * 1024;         /* FormSubmit's attachment ceiling */

const card = document.getElementById('postcard');
const form = document.getElementById('postcardForm');
const note = document.getElementById('postcardNote');
const sendBtn = document.getElementById('postcardSend');
const sendLabel = sendBtn ? sendBtn.querySelector('.pc-send-label') : null;
const clip = document.getElementById('postcardClip');
const fileInput = document.getElementById('postcardFile');
const fileChip = document.getElementById('postcardFileName');
const fileNameEl = document.getElementById('postcardFileNameText');
const fileX = document.getElementById('postcardFileX');
const NOTE_DEFAULT = note ? note.textContent : '';

/* ---- landing: once, when it first comes into view ---- */
if (card) {
  if (!window.IntersectionObserver || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    card.classList.add('landed');
  } else {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { card.classList.add('landed'); io.disconnect(); }
    }, { threshold: 0.25 });
    io.observe(card);
  }
}

/* ---- the paperclip: pick a file, wear its name on a chip ---- */
function currentFile() {
  return (fileInput && fileInput.files && fileInput.files[0]) || null;
}

function prettySize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function showFile(file) {
  if (!fileChip || !fileNameEl) return;
  fileChip.hidden = !file;
  fileNameEl.textContent = file ? file.name + ' · ' + prettySize(file.size) : '';
}

function clearFile() {
  if (fileInput) fileInput.value = '';
  showFile(null);
}

if (clip && fileInput) {
  clip.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = currentFile();
    if (!file) { showFile(null); return; }
    if (file.size > MAX_FILE_BYTES) {
      clearFile();
      say('That file is ' + prettySize(file.size) + ' — a postcard can carry at most 5 MB. Try a smaller one.', true);
      return;
    }
    showFile(file);
    say('Attached ' + file.name + ' — it travels with the postcard.');
    setTimeout(() => { if (note && !note.classList.contains('bad')) say(NOTE_DEFAULT); }, 6000);
  });
}
if (fileX) fileX.addEventListener('click', clearFile);

/* ---- sending: straight to the group inbox via FormSubmit ---- */
function say(text, bad) {
  if (!note) return;
  note.textContent = text;
  note.classList.toggle('bad', !!bad);
}

/* the fallback: a ready-made draft in the visitor's own mail app */
function mailtoFallback(name, reply, message) {
  const subject = 'A postcard from ' + name;
  const body = message + '\n\n— ' + name + (reply ? '\nWrite back to: ' + reply : '') +
    '\n\n(sent from the Binomar Group website)';
  location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
}

if (form) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = form.elements.name.value.trim();
    const reply = form.elements.reply.value.trim();
    const message = form.elements.message.value.trim();
    if (!name || !message) {
      say(!name ? 'Sign the postcard with your name first.' : 'The postcard is still blank — add a message.', true);
      (!name ? form.elements.name : form.elements.message).focus();
      return;
    }
    const file = currentFile();

    /* everything the postcard carries — the mailer builds the email,
       sets the subject and Reply-To, and checks the honeypot */
    const fd = new FormData();
    fd.append('name', name);
    fd.append('reply', reply);
    fd.append('message', message);
    if (file) fd.append('attachment', file, file.name);
    if (form.elements._honey) fd.append('_honey', form.elements._honey.value);

    if (sendBtn) { sendBtn.disabled = true; sendBtn.classList.add('sending'); }
    if (sendLabel) sendLabel.textContent = 'Sealing…';
    say('Sealing the postcard…');

    try {
      const res = await fetch(ENDPOINT, { method: 'POST', body: fd, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        let why = '';
        try { why = (await res.json()).error || ''; } catch (e) { /* not JSON */ }
        throw new Error(why || ('HTTP ' + res.status));
      }

      card.classList.remove('sent');
      void card.offsetWidth;                       // restart the stamp animation
      card.classList.add('sent');
      say(file ? "Postcard sent — it just landed in our inbox with your attachment. We'll write back soon."
               : "Postcard sent — it just landed in our inbox. We'll write back soon.");
      form.reset();
      showFile(null);
      setTimeout(() => say(NOTE_DEFAULT), 9000);
    } catch (err) {
      /* the post box was unreachable (offline, or the mailer down):
         hand the visitor a mailto: draft so nothing is lost */
      mailtoFallback(name, reply, message);
      say("We couldn't post it directly, so your email app opened with the postcard written out — re-attach the file there if it didn't travel, then send.", true);
      setTimeout(() => say(NOTE_DEFAULT), 12000);
    } finally {
      if (sendBtn) { sendBtn.disabled = false; sendBtn.classList.remove('sending'); }
      if (sendLabel) sendLabel.textContent = 'Send the postcard';
    }
  });
  /* clear a complaint as soon as they start fixing it */
  form.addEventListener('input', () => { if (note && note.classList.contains('bad')) say(NOTE_DEFAULT); });
}

/* ---- copy buttons ---- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    /* older browsers / insecure origins: the hidden-textarea fallback */
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

for (const btn of document.querySelectorAll('.pc-copy')) {
  btn.addEventListener('click', async () => {
    const ok = await copyText(btn.dataset.copy || '');
    btn.textContent = ok ? 'Copied' : 'Copy failed';
    btn.classList.toggle('done', ok);
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1800);
  });
}
