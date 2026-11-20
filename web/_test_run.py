import json, re, subprocess, html
from pathlib import Path

root = Path(__file__).parent
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
src = (root / "index.html").read_text(encoding="utf-8")

probe = """<script>
const errs = []; window.addEventListener('error', e => errs.push(e.message));
const out = {};
const snap = () => ({
  label: document.querySelector('#roadmapLabel').textContent,
  done: [...document.querySelectorAll('#nav a')].map(a => a.classList.contains('done') ? 1 : 0).join(''),
  ball: document.querySelector('#progressBall').style.left
});
const go = id => { document.documentElement.style.scrollBehavior = 'auto';
  const el = document.getElementById(id); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 40);
  out.y = (out.y||[]).concat(Math.round(scrollY)); window.dispatchEvent(new Event('scroll')); };
setTimeout(() => go('step-4'), 200);
setTimeout(() => { out.at4 = snap(); go('step-6'); }, 600);
setTimeout(() => { out.at6 = snap(); go('step-2'); }, 1000);
setTimeout(() => { out.back2 = snap(); go('step-1'); }, 1400);
setTimeout(() => { out.back1 = snap(); window.scrollTo(0, document.documentElement.scrollHeight); }, 1800);
setTimeout(() => { out.end = snap(); go('step-1'); }, 2200);
setTimeout(() => {
  out.backFromEnd = snap();
  const f = document.getElementById('driveField');
  document.querySelector('#zoneTabs button[data-key=red]').click();
  out.focus = f.dataset.focus; out.zoneInfo = document.getElementById('zoneInfo').textContent.slice(0, 40);
  document.querySelectorAll('#downBtns button')[1].click();
  out.status = document.getElementById('downStatus').textContent;
  out.attempts = [...document.querySelectorAll('#attempts li')].map(l => l.className || '-').join(',');
  out.gain = document.getElementById('gainText').textContent;
  out.zones = document.querySelectorAll('#zoneTabs button').length;
  out.areas = f.querySelectorAll('.area').length;
  out.errs = errs;
  document.body.dataset.probe = JSON.stringify(out);
}, 2700);
</script>"""

shim = "<script>window.requestAnimationFrame = cb => setTimeout(cb, 0);</script>"
src = src.replace('<script src="data.js">', shim + '<script src="data.js">')
(root / "_t.html").write_text(src.replace("</body>", probe + "</body>"), encoding="utf-8")
dom = subprocess.run([edge, "--headless=new", "--disable-gpu", "--no-first-run", "--window-size=1200,800",
                      "--virtual-time-budget=6000", "--dump-dom", (root / "_t.html").as_uri()],
                     capture_output=True, timeout=60).stdout.decode("utf-8", "replace")
m = re.search(r'data-probe="([^"]*)"', dom)
res = html.unescape(m.group(1)) if m else "SIN RESULTADO"
(root / "_test_result.json").write_text(res, encoding="utf-8")
print(res)
