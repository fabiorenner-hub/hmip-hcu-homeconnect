'use strict';

module.exports = `
:root {
  --bg: #f5f7fb;
  --card: #ffffff;
  --ink: #1d2533;
  --ink-soft: #5b6478;
  --muted: #8b94a7;
  --primary: #00467e; /* eQ-3 blue */
  --primary-h: #003a6a;
  --accent: #ff8a00;
  --ok: #2e8b57;
  --err: #c0392b;
  --line: #e3e7ef;
  --line-strong: #d3d9e6;
  --code: #f0f2f7;
  --shadow: 0 2px 8px rgba(20, 30, 50, 0.06);
  --radius: 14px;
  --gap: 24px;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--primary); }
a:hover { color: var(--primary-h); }

code {
  background: var(--code);
  padding: 1px 6px;
  border-radius: 5px;
  font: 13px/1 ui-monospace, 'Cascadia Mono', Consolas, monospace;
  color: var(--ink);
  word-break: break-all;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: var(--card);
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  text-decoration: none;
  color: var(--ink);
}

.lang button {
  background: transparent;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  padding: 4px 10px;
  margin-left: 4px;
  color: var(--ink-soft);
  cursor: pointer;
  font-size: 13px;
}
.lang button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

main {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

h1 {
  font-size: 28px;
  margin: 0 0 8px;
}
.lede {
  color: var(--ink-soft);
  margin: 0 0 28px;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}

.step {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 16px;
  background: var(--card);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow);
  border: 1px solid var(--line);
  transition: opacity .18s, transform .18s;
}

.step.dim {
  opacity: .4;
  pointer-events: none;
}

.step-num {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step.done .step-num {
  background: var(--ok);
}

.step h2 {
  margin: 0 0 8px;
  font-size: 20px;
}

.substeps {
  margin: 16px 0;
  padding-left: 20px;
}
.substeps li {
  margin-bottom: 8px;
}

.form-hints {
  margin: 8px 0 4px;
  padding-left: 20px;
}
.form-hints li {
  margin-bottom: 4px;
  color: var(--ink-soft);
}
.form-hints strong {
  color: var(--ink);
}

.must {
  color: var(--err);
  font-weight: 600;
}

.btn {
  display: inline-block;
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 15px;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background .15s, transform .15s;
}
.btn:active { transform: translateY(1px); }
.btn.primary {
  background: var(--primary);
  color: white;
}
.btn.primary:hover {
  background: var(--primary-h);
  color: white;
}
.btn.ghost {
  background: transparent;
  border-color: var(--line-strong);
  color: var(--ink);
}
.btn.ghost:hover {
  background: var(--code);
}
.btn.big {
  padding: 12px 22px;
  font-size: 16px;
}

#client-id-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
#client-id-form label {
  font-size: 13px;
  color: var(--ink-soft);
}
#client-id-form input {
  font: 14px/1.4 ui-monospace, 'Cascadia Mono', Consolas, monospace;
  padding: 11px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--bg);
  color: var(--ink);
  letter-spacing: 0.5px;
}
#client-id-form input:focus {
  outline: 2px solid var(--primary);
  outline-offset: 1px;
  border-color: var(--primary);
  background: white;
}
#client-id-form input.invalid {
  border-color: var(--err);
}
#client-id-form button {
  align-self: flex-start;
  margin-top: 6px;
}
.counter {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.counter.ok { color: var(--ok); }

.hint {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
}
.hint.ok { background: #e6f4ec; color: var(--ok); border: 1px solid #cce6d6; }
.hint.err { background: #fbeaea; color: var(--err); border: 1px solid #f5cbcb; }

.awaiting {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 24px;
  align-items: center;
  margin-top: 16px;
}
.qr img {
  border-radius: 12px;
  border: 1px solid var(--line);
  background: white;
}
.link-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.link-box code {
  font-size: 12px;
  padding: 8px 10px;
  word-break: break-all;
}
.muted { color: var(--ink-soft); font-size: 14px; }

.status {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.status.pending {
  background: #fff7e6;
  color: #8c5b00;
  border: 1px solid #ffe2a8;
}
.status.err {
  background: #fbeaea;
  color: var(--err);
  border: 1px solid #f5cbcb;
  flex-wrap: wrap;
}
.status .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f1a93a;
  box-shadow: 0 0 0 0 rgba(241,169,58,.6);
  animation: pulse 1.4s infinite;
}
@keyframes pulse {
  0%   { box-shadow: 0 0 0 0 rgba(241,169,58,.7); }
  70%  { box-shadow: 0 0 0 10px rgba(241,169,58,0); }
  100% { box-shadow: 0 0 0 0 rgba(241,169,58,0); }
}

.step.done .step-body p { color: var(--ink-soft); }

footer {
  margin-top: 32px;
  text-align: center;
  color: var(--muted);
}
footer a { color: var(--ink-soft); }

@media (max-width: 600px) {
  main { padding: 24px 16px 48px; }
  .step { padding: 16px; grid-template-columns: 40px 1fr; }
  .step-num { width: 32px; height: 32px; font-size: 15px; }
  .awaiting { grid-template-columns: 1fr; }
  .qr { display: flex; justify-content: center; }
}
`;
