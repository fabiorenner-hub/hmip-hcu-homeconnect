'use strict';

module.exports = `
(function () {
  const STR = {
    de: {
      'hero.title': 'Setup-Assistent',
      'hero.lede': 'In drei kurzen Schritten ist dein Home Connect Account mit deiner HCU verbunden. Diese Seite ist nur sichtbar, solange die Anmeldung noch fehlt.',
      'step1.title': 'Client ID besorgen',
      'step1.intro': 'Du brauchst eine kostenlose Home Connect Developer Application. Sie ist in 2 Minuten angelegt.',
      'step1.s1a': 'Öffne',
      'step1.s1b': 'und melde dich mit deinem Home Connect Account an (oder erstelle einen).',
      'step1.s2a': 'Klicke auf',
      'step1.s3': 'Fülle das Formular so aus:',
      'step1.appname': 'beliebig, z.B.',
      'step1.must': '(unbedingt!)',
      'step1.account': 'deine eigene Home Connect E-Mail',
      'step1.redirect': 'leer lassen',
      'step1.s4a': 'Klicke auf',
      'step1.s4b': 'und kopiere die angezeigte',
      'step1.s4c': '(64 Hex-Zeichen, Großbuchstaben). Das Client Secret brauchst du nicht.',
      'step1.cta': 'Developer-Portal öffnen ↗',
      'step2.title': 'Client ID einfügen',
      'step2.intro': 'Füge die kopierte Client ID hier ein. Sie wird im Plugin-State gespeichert und nur an api.home-connect.com gesendet.',
      'step2.label': 'Client ID (64 Zeichen)',
      'step2.cta': 'Speichern und anmelden',
      'step2.saved': '✓ Client ID gespeichert. Schritt 3 ist jetzt aktiv.',
      'step3.title': 'Bei Home Connect anmelden',
      'step3.intro': 'Öffne den Anmeldelink und bestätige den Zugriff für die HCU. Du kannst auch den QR-Code mit dem Handy scannen — beides funktioniert.',
      'step3.openLink': 'Anmeldelink öffnen ↗',
      'step3.afterApprove': 'Nach dem Klick auf Allow bei Home Connect aktualisiert sich diese Seite automatisch.',
      'step3.waiting': 'Warte auf deine Bestätigung im Browser…',
      'step3.errorPrefix': 'Fehler:',
      'step3.retry': 'Erneut versuchen',
      'done.title': 'Du bist angemeldet',
      'done.body': 'Deine Home Connect Geräte erscheinen jetzt in der Homematic IP App. Diese Setup-Seite wird gleich abgeschaltet.',
      'done.dashboard': 'Wenn du das optionale Diagnose-Dashboard aktiviert hast, erreichst du es unter Port 8123.',
      'footer.help': 'Hilfe?',
      'footer.troubleshooting': 'Troubleshooting',
      'footer.issues': 'Issue melden',
      'footer.hcdocs': 'Home Connect API Docs ↗',
      err_invalid: 'Client ID muss exakt 64 Zeichen lang und alphanumerisch sein.',
      err_save: 'Speichern fehlgeschlagen.',
    },
    en: {
      'hero.title': 'Setup wizard',
      'hero.lede': 'Three short steps and your Home Connect account is connected to your HCU. This page is only visible while the login is incomplete.',
      'step1.title': 'Get a Client ID',
      'step1.intro': 'You need a free Home Connect Developer Application. It takes about 2 minutes to set up.',
      'step1.s1a': 'Open',
      'step1.s1b': 'and sign in with your Home Connect account (or create one).',
      'step1.s2a': 'Click',
      'step1.s3': 'Fill in the form like this:',
      'step1.appname': 'anything, e.g.',
      'step1.must': '(required!)',
      'step1.account': 'your own Home Connect e-mail',
      'step1.redirect': 'leave empty',
      'step1.s4a': 'Click',
      'step1.s4b': 'and copy the shown',
      'step1.s4c': '(64 hex characters, uppercase). You do not need the Client Secret.',
      'step1.cta': 'Open developer portal ↗',
      'step2.title': 'Paste the Client ID',
      'step2.intro': 'Paste the Client ID here. It is stored in the plugin state and only sent to api.home-connect.com.',
      'step2.label': 'Client ID (64 characters)',
      'step2.cta': 'Save and sign in',
      'step2.saved': '✓ Client ID saved. Step 3 is now active.',
      'step3.title': 'Sign in to Home Connect',
      'step3.intro': 'Open the login link and confirm access for the HCU. You can also scan the QR code with your phone — both work.',
      'step3.openLink': 'Open login link ↗',
      'step3.afterApprove': 'After clicking Allow at Home Connect, this page refreshes automatically.',
      'step3.waiting': 'Waiting for your approval in the browser…',
      'step3.errorPrefix': 'Error:',
      'step3.retry': 'Try again',
      'done.title': 'You are signed in',
      'done.body': 'Your Home Connect appliances now appear in the Homematic IP app. This setup page will shut down shortly.',
      'done.dashboard': 'If you enabled the optional diagnostic dashboard, it lives on port 8123.',
      'footer.help': 'Need help?',
      'footer.troubleshooting': 'Troubleshooting',
      'footer.issues': 'Report an issue',
      'footer.hcdocs': 'Home Connect API docs ↗',
      err_invalid: 'Client ID must be exactly 64 alphanumeric characters.',
      err_save: 'Saving failed.',
    },
  };

  let currentLang = (navigator.language || 'de').toLowerCase().startsWith('en') ? 'en' : 'de';

  function t(key) { return (STR[currentLang] && STR[currentLang][key]) || STR.en[key] || key; }

  function applyI18n() {
    document.documentElement.dataset.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.getAttribute('data-i18n');
      const val = t(k);
      if (val) el.textContent = val;
    });
    document.querySelectorAll('.lang button').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === currentLang);
    });
  }

  document.querySelectorAll('.lang button').forEach(b => {
    b.addEventListener('click', () => { currentLang = b.dataset.lang; applyI18n(); });
  });

  applyI18n();

  /* ---- state sync ---- */
  const els = {
    step1: document.getElementById('step-1'),
    step2: document.getElementById('step-2'),
    step3: document.getElementById('step-3'),
    stepDone: document.getElementById('step-done'),
    awaiting: document.getElementById('awaiting'),
    qrImg: document.getElementById('qr-img'),
    verifyLink: document.getElementById('verify-link'),
    verifyText: document.getElementById('verify-link-text'),
    pending: document.getElementById('status-pending'),
    err: document.getElementById('status-err'),
    errMsg: document.getElementById('status-err-msg'),
    retry: document.getElementById('retry-btn'),
    form: document.getElementById('client-id-form'),
    input: document.getElementById('client-id'),
    counter: document.getElementById('client-id-counter'),
    okHint: document.getElementById('client-id-ok'),
    errHint: document.getElementById('client-id-err'),
  };

  function setStage(state) {
    const stage = state.stage || 'enter-client-id';
    [els.step1, els.step2, els.step3, els.stepDone].forEach(s => {
      const stages = (s.dataset.stageActive || '').split(/\\s+/);
      s.classList.toggle('dim', !stages.includes(stage));
    });
    els.stepDone.style.display = stage === 'done' ? '' : 'none';

    if (state.verificationUrl && !state.loggedIn) {
      els.awaiting.hidden = false;
      els.verifyLink.href = state.verificationUrl;
      els.verifyText.textContent = state.verificationUrl;
      fetch('/api/qr').then(r => r.ok && r.json()).then(d => { if (d && d.qr) els.qrImg.src = d.qr; });
      els.pending.hidden = false;
    } else {
      els.awaiting.hidden = true;
      els.pending.hidden = true;
    }

    if (state.lastError) {
      els.err.hidden = false;
      els.errMsg.textContent = state.lastError;
    } else {
      els.err.hidden = true;
    }

    if (state.clientIdSet) {
      els.input.value = '*'.repeat(state.clientIdLength || 0);
      updateCounter();
    }

    if (state.loggedIn) {
      // We trigger one more refresh; the server will close the WS shortly.
      setTimeout(() => location.reload(), 5000);
    }
  }

  function updateCounter() {
    const len = els.input.value.length;
    els.counter.textContent = len + ' / 64';
    els.counter.classList.toggle('ok', len === 64);
  }

  els.input.addEventListener('input', () => {
    els.input.classList.remove('invalid');
    els.errHint.hidden = true;
    updateCounter();
  });

  els.form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const clientId = els.input.value.trim();
    if (clientId.length !== 64 || !/^[A-Za-z0-9]+$/.test(clientId)) {
      els.input.classList.add('invalid');
      els.errHint.textContent = t('err_invalid');
      els.errHint.hidden = false;
      return;
    }
    try {
      const res = await fetch('/api/client-id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || t('err_save'));
      els.okHint.hidden = false;
    } catch (e) {
      els.errHint.textContent = e.message || t('err_save');
      els.errHint.hidden = false;
    }
  });

  els.retry.addEventListener('click', async () => {
    await fetch('/api/reset', { method: 'POST' });
  });

  function connectWs() {
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(proto + '://' + location.host + '/ws');
      ws.onmessage = ev => {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === 'state') setStage(m.state);
        } catch {}
      };
      ws.onclose = () => setTimeout(connectWs, 1500);
    } catch {
      setTimeout(connectWs, 1500);
    }
  }

  // initial pull + websocket subscribe
  fetch('/api/state').then(r => r.json()).then(setStage).catch(() => {});
  connectWs();
})();
`;
