import html, re, subprocess
from pathlib import Path

root = Path(__file__).parent
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
src = (root / "index.html").read_text(encoding="utf-8")

probe = """<script>(() => {
const errs = []; window.addEventListener('error', e => errs.push(e.message));
const out = {};
const q = s => document.querySelector(s);
const opts = () => [...document.querySelectorAll('#playOptions .opt')];
const pick = name => { const b = opts().find(o => o.textContent.startsWith(name)); if (!b) throw new Error('no option ' + name); b.click(); return b; };
const go = name => { pick(name); q('#confirmPlay').click(); };
const state = () => ({
  status: q('#downStatus').textContent, title: q('#pickTitle').textContent, score: q('#scoreTotal').textContent,
  confirmDisabled: q('#confirmPlay').disabled,
  locked: opts().filter(o => o.disabled).map(o => o.querySelector('strong').textContent),
  n: opts().length, msg: q('#downMsg').textContent.slice(0, 60)
});
setTimeout(() => {
  try {
    out.start = state();
    pick('Corrida'); out.pickedEnablesConfirm = !q('#confirmPlay').disabled;
    q('#confirmPlay').click(); out.afterRun = state();
    go('Pase incompleto'); go('Pase incompleto'); out.at4far = state();
    q('#scoreReset').click();
    go('Pase profundo'); go('Pase profundo');
    go('Pase incompleto'); go('Pase incompleto'); go('Pase incompleto');
    out.fgNear = state();
    go('Gol de campo'); out.afterFG = state();
    q('#scoreReset').click();
    go('Pase profundo'); go('Pase profundo'); go('Pase profundo');
    out.td = state();
    go('Conversi'); out.afterTwo = state();
    q('#scoreReset').click();
    go('Pase incompleto'); go('Pase incompleto'); go('Pase incompleto');
    go('Despeje'); out.afterPunt = state();
  } catch (e) { out.crash = String(e) + ' @ ' + String(e.stack || '').slice(0, 300); }
  out.errs = errs;
  document.body.dataset.probe = JSON.stringify(out);
}, 400);
})();</script>"""

shim = "<script>window.requestAnimationFrame = cb => setTimeout(cb, 0);</script>"
src = src.replace('<script src="data.js">', shim + '<script src="data.js">')
(root / "_t.html").write_text(src.replace("</body>", probe + "</body>"), encoding="utf-8")
dom = subprocess.run([edge, "--headless=new", "--disable-gpu", "--no-first-run", "--window-size=1000,900",
                      "--virtual-time-budget=4000", "--dump-dom", (root / "_t.html").as_uri()],
                     capture_output=True, timeout=60).stdout.decode("utf-8", "replace")
m = re.search(r'data-probe="([^"]*)"', dom)
(root / "_test_flow_result.json").write_text(html.unescape(m.group(1)) if m else "SIN RESULTADO", encoding="utf-8")
