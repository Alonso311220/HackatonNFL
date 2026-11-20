import re, subprocess
from pathlib import Path

root = Path(__file__).parent
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
src = (root / "index.html").read_text(encoding="utf-8")
catch = "<script>window.__errs=[];window.addEventListener('error',e=>{window.__errs.push(e.message+' L'+e.lineno);document.documentElement.dataset.errs=JSON.stringify(window.__errs);});</script>"
(root / "_t2.html").write_text(src.replace("<head>", "<head>" + catch, 1), encoding="utf-8")
dom = subprocess.run([edge, "--headless=new", "--disable-gpu", "--no-first-run", "--window-size=1000,900",
                      "--virtual-time-budget=3000", "--dump-dom", (root / "_t2.html").as_uri()],
                     capture_output=True, timeout=60).stdout.decode("utf-8", "replace")
lines = [
    "dom bytes: %d" % len(dom),
    "errs: " + (re.search(r'data-errs="([^"]*)"', dom).group(1) if 'data-errs' in dom else "ninguno"),
    "opciones: %d" % dom.count('class="opt"'),
    "titulo: " + (re.search(r'id="pickTitle"[^>]*>([^<]*)', dom).group(1) if 'pickTitle' in dom else "?"),
]
(root / "_test_load_result.txt").write_text("\n".join(lines), encoding="utf-8")
