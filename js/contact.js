/* =============================================================
   BINOMAR GROUP — the postcard (contact section)
   -------------------------------------------------------------
   The message side writes the postcard into the visitor's own
   email app (mailto: — no server, nothing stored here); the
   address side's copy buttons put the email or phone on the
   clipboard. The postcard lands with a little theatre the first
   time it scrolls into view (style.css: .postcard.landed).
   ============================================================= */
const TO = 'binomargroup0@gmail.com';

const card = document.getElementById('postcard');
const form = document.getElementById('postcardForm');
const note = document.getElementById('postcardNote');
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

/* ---- sending: compose the email in the visitor's own mail app ---- */
function say(text, bad) {
  if (!note) return;
  note.textContent = text;
  note.classList.toggle('bad', !!bad);
}

if (form) {
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = form.elements.name.value.trim();
    const reply = form.elements.reply.value.trim();
    const message = form.elements.message.value.trim();
    if (!name || !message) {
      say(!name ? 'Sign the postcard with your name first.' : 'The postcard is still blank — add a message.', true);
      (!name ? form.elements.name : form.elements.message).focus();
      return;
    }
    const subject = 'A postcard from ' + name;
    const body = message + '\n\n— ' + name + (reply ? '\nWrite back to: ' + reply : '') +
      '\n\n(sent from the Binomar Group website)';
    location.href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    card.classList.remove('sent');
    void card.offsetWidth;                       // restart the stamp animation
    card.classList.add('sent');
    say('Your email app should open with the postcard ready to send.');
    setTimeout(() => say(NOTE_DEFAULT), 7000);
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
