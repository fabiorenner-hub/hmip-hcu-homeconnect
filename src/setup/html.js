'use strict';

/**
 * Renders the static HTML shell of the setup wizard.
 * All UI logic lives in app.js, all styling in style.js.
 */

module.exports = function renderHtml() {
	return `<!doctype html>
<html lang="auto" data-lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Home Connect Plugin – Setup</title>
<link rel="stylesheet" href="/style.css" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
</head>
<body>

<header class="topbar">
  <a href="https://github.com/fabiorenner-hub/hmip-hcu-homeconnect" target="_blank" rel="noopener" class="brand">
    <img src="/icon.svg" alt="" width="32" height="32"/>
    <span>Home Connect Plugin</span>
  </a>
  <nav class="lang">
    <button data-lang="de" type="button">DE</button>
    <button data-lang="en" type="button">EN</button>
  </nav>
</header>

<main>
  <h1 data-i18n="hero.title">Setup-Assistent</h1>
  <p class="lede" data-i18n="hero.lede">In drei kurzen Schritten ist dein Home Connect Account mit deiner HCU verbunden. Diese Seite ist nur sichtbar, solange die Anmeldung noch fehlt.</p>

  <ol class="steps" id="steps">

    <li class="step" id="step-1" data-stage-active="enter-client-id sign-in awaiting-approval done">
      <div class="step-num">1</div>
      <div class="step-body">
        <h2 data-i18n="step1.title">Client ID besorgen</h2>
        <p data-i18n="step1.intro">Du brauchst eine kostenlose Home Connect Developer Application. Sie ist in 2 Minuten angelegt.</p>
        <ol class="substeps">
          <li><span data-i18n="step1.s1a">Öffne</span> <a href="https://developer.home-connect.com/applications" target="_blank" rel="noopener">developer.home-connect.com/applications</a> <span data-i18n="step1.s1b">und melde dich mit deinem Home Connect Account an (oder erstelle einen).</span></li>
          <li><span data-i18n="step1.s2a">Klicke auf</span> <code>Register Application</code>.</li>
          <li><span data-i18n="step1.s3">Fülle das Formular so aus:</span>
            <ul class="form-hints">
              <li><strong>Application ID:</strong> <span data-i18n="step1.appname">beliebig, z.B.</span> <code>HCU Plugin</code></li>
              <li><strong>OAuth Flow:</strong> <code>Device Flow</code> <span class="must" data-i18n="step1.must">(unbedingt!)</span></li>
              <li><strong>Home Connect User Account for Testing:</strong> <span data-i18n="step1.account">deine eigene Home Connect E-Mail</span></li>
              <li><strong>Success Redirect:</strong> <span data-i18n="step1.redirect">leer lassen</span></li>
            </ul>
          </li>
          <li><span data-i18n="step1.s4a">Klicke auf</span> <code>Save</code> <span data-i18n="step1.s4b">und kopiere die angezeigte</span> <strong>Client ID</strong> <span data-i18n="step1.s4c">(64 Hex-Zeichen, Großbuchstaben). Das Client Secret brauchst du nicht.</span></li>
        </ol>
        <a class="btn primary" href="https://developer.home-connect.com/applications" target="_blank" rel="noopener" data-i18n="step1.cta">Developer-Portal öffnen ↗</a>
      </div>
    </li>

    <li class="step" id="step-2" data-stage-active="enter-client-id sign-in awaiting-approval done">
      <div class="step-num">2</div>
      <div class="step-body">
        <h2 data-i18n="step2.title">Client ID einfügen</h2>
        <p data-i18n="step2.intro">Füge die kopierte Client ID hier ein. Sie wird verschlüsselt im Plugin-State gespeichert und nur an api.home-connect.com gesendet.</p>
        <form id="client-id-form" autocomplete="off">
          <label for="client-id" data-i18n="step2.label">Client ID (64 Zeichen)</label>
          <input id="client-id" name="clientId" type="text" inputmode="latin" autocapitalize="characters" spellcheck="false"
            pattern="[A-Fa-f0-9]{64}" placeholder="64 Zeichen Hex (A-F, 0-9), Großbuchstaben" required>
          <div class="counter" id="client-id-counter">0 / 64</div>
          <button class="btn primary" type="submit" data-i18n="step2.cta">Speichern und anmelden</button>
        </form>
        <div class="hint ok" id="client-id-ok" hidden data-i18n="step2.saved">✓ Client ID gespeichert. Schritt 3 ist jetzt aktiv.</div>
        <div class="hint err" id="client-id-err" hidden></div>
      </div>
    </li>

    <li class="step" id="step-3" data-stage-active="sign-in awaiting-approval done">
      <div class="step-num">3</div>
      <div class="step-body">
        <h2 data-i18n="step3.title">Bei Home Connect anmelden</h2>
        <p data-i18n="step3.intro">Öffne den Anmeldelink und bestätige den Zugriff für die HCU. Du kannst auch den QR-Code mit dem Handy scannen — beides funktioniert.</p>

        <div class="awaiting" id="awaiting" hidden>
          <div class="qr">
            <img id="qr-img" alt="QR Code" />
          </div>
          <div class="link-box">
            <a id="verify-link" href="#" target="_blank" rel="noopener" class="btn primary big" data-i18n="step3.openLink">Anmeldelink öffnen ↗</a>
            <code id="verify-link-text"></code>
            <p class="muted" data-i18n="step3.afterApprove">Nach dem Klick auf <code>Allow</code> bei Home Connect aktualisiert sich diese Seite automatisch.</p>
          </div>
        </div>

        <div class="status pending" id="status-pending" hidden>
          <span class="dot"></span>
          <span data-i18n="step3.waiting">Warte auf deine Bestätigung im Browser…</span>
        </div>

        <div class="status err" id="status-err" hidden>
          <strong data-i18n="step3.errorPrefix">Fehler:</strong>
          <span id="status-err-msg"></span>
          <button class="btn ghost" id="retry-btn" type="button" data-i18n="step3.retry">Erneut versuchen</button>
        </div>
      </div>
    </li>

    <li class="step done" id="step-done" data-stage-active="done">
      <div class="step-num">✓</div>
      <div class="step-body">
        <h2 data-i18n="done.title">Du bist angemeldet</h2>
        <p data-i18n="done.body">Deine Home Connect Geräte erscheinen jetzt in der Homematic IP App. Diese Setup-Seite wird gleich abgeschaltet.</p>
        <p class="muted" data-i18n="done.dashboard">Wenn du das optionale Diagnose-Dashboard aktiviert hast, erreichst du es unter Port 8123.</p>
      </div>
    </li>
  </ol>

  <footer>
    <small>
      <span data-i18n="footer.help">Hilfe?</span>
      <a href="https://github.com/fabiorenner-hub/hmip-hcu-homeconnect#troubleshooting" target="_blank" rel="noopener" data-i18n="footer.troubleshooting">Troubleshooting</a>
      ·
      <a href="https://github.com/fabiorenner-hub/hmip-hcu-homeconnect/issues" target="_blank" rel="noopener" data-i18n="footer.issues">Issue melden</a>
      ·
      <a href="https://api-docs.home-connect.com/authorization" target="_blank" rel="noopener" data-i18n="footer.hcdocs">Home Connect API Docs ↗</a>
    </small>
  </footer>
</main>

<script src="/app.js"></script>
</body>
</html>
`;
};
