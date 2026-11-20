from pathlib import Path
root = Path(__file__).parent
app = root / "app.js"
t = app.read_text(encoding="utf-8")
start = t.index("  /* puntos: dependen de dónde esté el balón */")
end = t.index("/* ---------- paso 2: tiempo ---------- */")
new = (root / "_new_flow.js").read_text(encoding="utf-8")
t = t[:start] + new + t[end:]
t = t.replace('ezRival.classList.toggle("on", state.phase === "td");', 'ezRival.classList.toggle("on", state.phase === "after");')
app.write_text(t, encoding="utf-8")
print("ok", len(t))
