"""Entrena el predictor de jugada con data/plays.csv y escribe web/model.js.

Python puro (sin numpy). Modelos (todos con las mismas variables de entrada):
  success  : regresion logistica, P(jugada exitosa)
  complete : regresion logistica, P(pase completo)
  sack     : regresion logistica, P(sack)
  yards    : regresion lineal con ridge, yardas esperadas
Validacion: se entrena con semanas 1-6 y se evalua con semanas 7-8.
Luego se reentrena con todo para exportar.
"""
import csv, json, math
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
MIN_FORM = 30        # formaciones con menos jugadas no se modelan
LAMBDA = 8.0         # ridge
YARD_CLIP = (-15, 40)

# ---------------------------------------------------------------- datos
games = {}
with open(ROOT / "data" / "games.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        games[r["gameId"]] = (int(r["week"]), r["homeTeamAbbr"])

def clock_secs(c):
    m, s = c.split(":")[:2]
    return int(m) * 60 + int(s)

def success(down, to_go, yards):
    need = {1: 0.4, 2: 0.6}.get(down, 1.0) * to_go
    return yards >= need

rows = []
with open(ROOT / "data" / "plays.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        form = r["offenseFormation"]
        down = int(r["down"])
        if form in ("NA", "") or down not in (1, 2, 3, 4):
            continue
        week, home = games[r["gameId"]]
        to_go = float(r["yardsToGo"])
        yl = float(r["yardlineNumber"])
        to_goal = 100 - yl if r["yardlineSide"] == r["possessionTeam"] else yl
        hs, vs = float(r["preSnapHomeScore"]), float(r["preSnapVisitorScore"])
        diff = (hs - vs) if r["possessionTeam"] == home else (vs - hs)
        q = int(r["quarter"])
        if q > 4:
            continue
        secs = clock_secs(r["gameClock"])
        yards = float(r["playResult"])
        rows.append(dict(
            week=week, form=form, down=down, to_go=to_go, to_goal=to_goal, diff=diff, q=q,
            late=int(q in (2, 4) and secs <= 120), yards=yards,
            ok=int(success(down, to_go, yards)),
            comp=int(r["passResult"] == "C"), sack=int(r["passResult"] == "S")))

cnt = Counter(r["form"] for r in rows)
FORMS = [k for k, n in cnt.most_common() if n >= MIN_FORM]
rows = [r for r in rows if r["form"] in FORMS]
BASE = FORMS[0]  # formacion de referencia (la mas usada)

# ---------------------------------------------------------------- variables
NAMES = (["bias", "down2", "down3", "down4", "toGo", "toGoLate", "toGoal", "redZone",
          "q2", "q3", "q4", "diff", "diffQ4", "late"]
         + [f"form:{k}" for k in FORMS if k != BASE])

def feats(down, to_go, to_goal, q, diff, late, form):
    tg = min(to_go, 25) / 10
    d = max(-21, min(21, diff)) / 10
    x = [1.0, down == 2, down == 3, down == 4, tg, tg * (down >= 3), to_goal / 100, to_goal <= 20,
         q == 2, q == 3, q == 4, d, d * (q == 4), late]
    x += [form == k for k in FORMS if k != BASE]
    return [float(v) for v in x]

def X_of(rs):
    return [feats(r["down"], r["to_go"], r["to_goal"], r["q"], r["diff"], r["late"], r["form"]) for r in rs]

# ---------------------------------------------------------------- algebra
def solve(A, b):
    n = len(b)
    M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda i: abs(M[i][c]))
        M[c], M[p] = M[p], M[c]
        piv = M[c][c]
        for j in range(c, n + 1):
            M[c][j] /= piv
        for i in range(n):
            if i != c and M[i][c]:
                k = M[i][c]
                for j in range(c, n + 1):
                    M[i][j] -= k * M[c][j]
    return [M[i][n] for i in range(n)]

def sig(z):
    return 1 / (1 + math.exp(-max(-30, min(30, z))))

def fit_logit(X, y):
    n, k = len(X), len(X[0])
    beta = [0.0] * k
    for _ in range(30):
        p = [sig(sum(b * v for b, v in zip(beta, x))) for x in X]
        H = [[0.0] * k for _ in range(k)]
        g = [0.0] * k
        for x, pi, yi in zip(X, p, y):
            w = pi * (1 - pi) + 1e-9
            for a in range(k):
                if x[a] == 0:
                    continue
                g[a] += x[a] * (yi - pi)
                xa = x[a] * w
                Ha = H[a]
                for b in range(k):
                    Ha[b] += xa * x[b]
        for a in range(1, k):
            H[a][a] += LAMBDA
            g[a] -= LAMBDA * beta[a]
        step = solve(H, g)
        beta = [b + s for b, s in zip(beta, step)]
        if max(abs(s) for s in step) < 1e-6:
            break
    return beta

def fit_ridge(X, y):
    k = len(X[0])
    H = [[0.0] * k for _ in range(k)]
    g = [0.0] * k
    for x, yi in zip(X, y):
        for a in range(k):
            if x[a] == 0:
                continue
            g[a] += x[a] * yi
            for b in range(k):
                H[a][b] += x[a] * x[b]
    for a in range(1, k):
        H[a][a] += LAMBDA
    return solve(H, g)

def lin(beta, x):
    return sum(b * v for b, v in zip(beta, x))

def auc(p, y):
    pairs = sorted(zip(p, y))
    pos = sum(y)
    neg = len(y) - pos
    rank_sum, i = 0.0, 0
    while i < len(pairs):
        j = i
        while j < len(pairs) and pairs[j][0] == pairs[i][0]:
            j += 1
        avg = (i + j + 1) / 2
        rank_sum += avg * sum(1 for t in pairs[i:j] if t[1] == 1)
        i = j
    return (rank_sum - pos * (pos + 1) / 2) / (pos * neg)

def logloss(p, y):
    return -sum(math.log(max(1e-9, pi if yi else 1 - pi)) for pi, yi in zip(p, y)) / len(y)

# ---------------------------------------------------------------- validacion
TARGETS = ["ok", "comp", "sack"]
train = [r for r in rows if r["week"] <= 6]
test = [r for r in rows if r["week"] >= 7]
Xtr, Xte = X_of(train), X_of(test)
report = {"train": len(train), "test": len(test)}
print(f"formaciones: {FORMS}\nentrenamiento {len(train)} · prueba {len(test)}")
for t in TARGETS:
    b = fit_logit(Xtr, [r[t] for r in train])
    p = [sig(lin(b, x)) for x in Xte]
    y = [r[t] for r in test]
    base = sum(r[t] for r in train) / len(train)
    rep = dict(auc=round(auc(p, y), 3), logloss=round(logloss(p, y), 4),
               baseLogloss=round(logloss([base] * len(y), y), 4), rate=round(100 * sum(y) / len(y), 1))
    report[t] = rep
    print(t, rep)
by = fit_ridge(Xtr, [max(YARD_CLIP[0], min(YARD_CLIP[1], r["yards"])) for r in train])
yt = [r["yards"] for r in test]
mean = sum(r["yards"] for r in train) / len(train)
mae = sum(abs(lin(by, x) - v) for x, v in zip(Xte, yt)) / len(yt)
mae0 = sum(abs(mean - v) for v in yt) / len(yt)
report["yards"] = dict(mae=round(mae, 2), baseMae=round(mae0, 2))
print("yards", report["yards"])

# ---------------------------------------------------------------- exportar
Xall = X_of(rows)
coef = {t: [round(v, 4) for v in fit_logit(Xall, [r[t] for r in rows])] for t in TARGETS}
coef["yards"] = [round(v, 4) for v in fit_ridge(Xall, [max(YARD_CLIP[0], min(YARD_CLIP[1], r["yards"])) for r in rows])]

fi = {k: i for i, k in enumerate(FORMS)}
plays = [[r["down"], int(r["to_go"]), int(r["to_goal"]), r["q"], int(r["diff"]), r["late"],
          fi[r["form"]], r["ok"], int(r["yards"])] for r in rows]

dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
(ROOT / "web" / "model.js").write_text(
    f"const MODEL_FORMS = {dump(FORMS)};\n"
    f"const MODEL_BASE = {dump(BASE)};\n"
    f"const MODEL_COEF = {dump(coef)};\n"
    f"const MODEL_REPORT = {dump(report)};\n"
    f"// down, yardas por recorrer, yardas a la zona, cuarto, diferencia, 2 min, formacion, exito, yardas\n"
    f"const MODEL_PLAYS = {dump(plays)};\n", encoding="utf-8")
print("web/model.js escrito:", len(rows), "jugadas")
# caso de prueba para comparar con la version JS
x = feats(3, 7, 40, 4, -3, 0, "SHOTGUN")
print("TEST", {t: round(sig(lin(coef[t], x)), 4) for t in TARGETS}, round(lin(coef["yards"], x), 3))
