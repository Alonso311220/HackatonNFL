"""Entrena el simulador de jugada con data/plays.csv y escribe web/model.js.

Python puro (sin numpy). Para cada resultado de la jugada se ajusta una regresion
logistica con ridge (uno contra todos):
  ok  : jugada exitosa            C : pase completo        I : incompleto
  S   : sack                      IN: intercepcion         R : corrida del QB
y una regresion lineal para las yardas esperadas.

Variables: situacion (intento, yardas, campo, cuarto, marcador, 2 minutos), play action,
formacion, cobertura de la defensa, equipo atacante y equipo defensor.
Validacion: se entrena con las semanas 1-6 y se evalua con las 7-8; luego se reentrena
con todo para exportar. Tambien exporta el perfil ofensivo y defensivo de cada equipo.
"""
import csv, json, math, re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
MIN_FORM = 30        # formaciones con menos jugadas no se modelan
MIN_COV = 150        # coberturas con menos jugadas se agrupan en "Otra"
LAMBDA = 8.0         # ridge de las variables de situacion, formacion y cobertura
LAMBDA_TEAMS = [8.0, 30.0, 100.0]  # candidatos para el ridge de los equipos
YARD_CLIP = (-15, 40)
OUTCOMES = ["C", "I", "S", "IN", "R"]

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

def parse_personnel(txt):
    d = {k: int(n) for n, k in re.findall(r"(\d+) (DL|LB|DB)", txt)}
    if set(d) == {"DL", "LB", "DB"} and sum(d.values()) == 11:
        return d["DL"], d["LB"], d["DB"]
    return None

rows = []
with open(ROOT / "data" / "plays.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        form = r["offenseFormation"]
        down = int(r["down"])
        if form in ("NA", "") or down not in (1, 2, 3, 4) or int(r["quarter"]) > 4:
            continue
        week, home = games[r["gameId"]]
        to_go = float(r["yardsToGo"])
        yl = float(r["yardlineNumber"])
        to_goal = 100 - yl if r["yardlineSide"] == r["possessionTeam"] else yl
        hs, vs = float(r["preSnapHomeScore"]), float(r["preSnapVisitorScore"])
        diff = (hs - vs) if r["possessionTeam"] == home else (vs - hs)
        q = int(r["quarter"])
        yards = float(r["playResult"])
        box = None if r["defendersInBox"] == "NA" else float(r["defendersInBox"])
        rows.append(dict(
            week=week, form=form, down=down, to_go=to_go, to_goal=to_goal, diff=diff, q=q,
            late=int(q in (2, 4) and clock_secs(r["gameClock"]) <= 120),
            pa=int(r["pff_playAction"] == "1"), cov=r["pff_passCoverage"],
            off=r["possessionTeam"], dfn=r["defensiveTeam"], res=r["passResult"],
            pers=parse_personnel(r["personnelD"]), box=box,
            yards=yards, ok=int(success(down, to_go, yards))))

cnt = Counter(r["form"] for r in rows)
FORMS = [k for k, n in cnt.most_common() if n >= MIN_FORM]
rows = [r for r in rows if r["form"] in FORMS and r["res"] in OUTCOMES]
BASE = FORMS[0]

cc = Counter(r["cov"] for r in rows)
COVS = ["Cover-3"] + [k for k, n in cc.most_common() if n >= MIN_COV and k != "Cover-3"] + ["Otra"]
for r in rows:
    if r["cov"] not in COVS:
        r["cov"] = "Otra"

TEAMS = sorted({r["off"] for r in rows} | {r["dfn"] for r in rows})
TI = {t: i for i, t in enumerate(TEAMS)}

# ---------------------------------------------------------------- variables
NB = 15
F0 = NB
C0 = F0 + len(FORMS) - 1
O0 = C0 + len(COVS) - 1
D0 = O0 + len(TEAMS)
K = D0 + len(TEAMS)

def feats(r, cov=None):
    """Variables dispersas [(indice, valor)]. Debe coincidir con feat() de web/play.js."""
    tg = min(r["to_go"], 25) / 10
    d = max(-21, min(21, r["diff"])) / 10
    down, q = r["down"], r["q"]
    x = [(0, 1.0), (4, tg), (6, r["to_goal"] / 100), (11, d)]
    if down == 2: x.append((1, 1.0))
    if down == 3: x.append((2, 1.0))
    if down == 4: x.append((3, 1.0))
    if down >= 3: x.append((5, tg))
    if r["to_goal"] <= 20: x.append((7, 1.0))
    if q == 2: x.append((8, 1.0))
    if q == 3: x.append((9, 1.0))
    if q == 4:
        x.append((10, 1.0))
        x.append((12, d))
    if r["late"]: x.append((13, 1.0))
    if r["pa"]: x.append((14, 1.0))
    if r["form"] != BASE: x.append((F0 + FORMS.index(r["form"]) - 1, 1.0))
    c = cov or r["cov"]
    if c != COVS[0]: x.append((C0 + COVS.index(c) - 1, 1.0))
    x.append((O0 + TI[r["off"]], 1.0))
    x.append((D0 + TI[r["dfn"]], 1.0))
    return x

def penalty(lam_main, lam_team, use_extra, use_teams):
    """Vector de penalizacion por variable. Una penalizacion enorme equivale a quitarla."""
    big = 1e7
    lam = [0.0] + [lam_main] * (NB - 1)
    lam += [lam_main] * (len(FORMS) - 1)
    lam += [lam_main if use_extra else big] * (len(COVS) - 1)
    lam += [lam_team if use_teams else big] * (2 * len(TEAMS))
    if not use_extra:
        lam[14] = big
    return lam

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

def dot_s(beta, x):
    return sum(beta[i] * v for i, v in x)

def fit_logit(X, y, lam):
    beta = [0.0] * K
    for _ in range(25):
        H = [[0.0] * K for _ in range(K)]
        g = [0.0] * K
        for x, yi in zip(X, y):
            p = sig(dot_s(beta, x))
            w = p * (1 - p) + 1e-9
            e = yi - p
            for a, va in x:
                g[a] += va * e
                Ha, wa = H[a], w * va
                for b, vb in x:
                    Ha[b] += wa * vb
        for a in range(1, K):
            H[a][a] += lam[a]
            g[a] -= lam[a] * beta[a]
        for a in range(K):
            if H[a][a] == 0:
                H[a][a] = 1.0
        step = solve(H, g)
        beta = [b + s for b, s in zip(beta, step)]
        if max(abs(s) for s in step) < 1e-5:
            break
    return beta

def fit_ridge(X, y, lam):
    H = [[0.0] * K for _ in range(K)]
    g = [0.0] * K
    for x, yi in zip(X, y):
        for a, va in x:
            g[a] += va * yi
            Ha = H[a]
            for b, vb in x:
                Ha[b] += va * vb
    for a in range(1, K):
        H[a][a] += lam[a]
    for a in range(K):
        if H[a][a] == 0:
            H[a][a] = 1.0
    return solve(H, g)

def auc(p, y):
    pairs = sorted(zip(p, y))
    pos = sum(y)
    neg = len(y) - pos
    rank_sum, i = 0.0, 0
    while i < len(pairs):
        j = i
        while j < len(pairs) and pairs[j][0] == pairs[i][0]:
            j += 1
        rank_sum += (i + j + 1) / 2 * sum(1 for t in pairs[i:j] if t[1] == 1)
        i = j
    return (rank_sum - pos * (pos + 1) / 2) / (pos * neg)

def logloss(p, y):
    return -sum(math.log(max(1e-9, pi if yi else 1 - pi)) for pi, yi in zip(p, y)) / len(y)

# ---------------------------------------------------------------- validacion
def target(r, t):
    return r["ok"] if t == "ok" else int(r["res"] == t)

train = [r for r in rows if r["week"] <= 6]
test = [r for r in rows if r["week"] >= 7]
Xtr, Xte = [feats(r) for r in train], [feats(r) for r in test]
print(f"formaciones {FORMS}\ncoberturas {COVS}\nentrenamiento {len(train)} · prueba {len(test)}", flush=True)

def evaluate(t, lam):
    b = fit_logit(Xtr, [target(r, t) for r in train], lam)
    p = [sig(dot_s(b, x)) for x in Xte]
    y = [target(r, t) for r in test]
    return dict(auc=round(auc(p, y), 3), logloss=round(logloss(p, y), 4))

report = {"train": len(train), "test": len(test)}
for t in ("ok", "C"):
    base_rate = sum(target(r, t) for r in train) / len(train)
    y = [target(r, t) for r in test]
    rep = {"rate": round(100 * sum(y) / len(y), 1), "baseLogloss": round(logloss([base_rate] * len(y), y), 4)}
    rep["situation"] = evaluate(t, penalty(LAMBDA, 0, False, False))
    rep["extra"] = evaluate(t, penalty(LAMBDA, 0, True, False))
    best = None
    for lt in LAMBDA_TEAMS:
        e = evaluate(t, penalty(LAMBDA, lt, True, True))
        e["lambda"] = lt
        print(t, "equipos lambda", lt, e, flush=True)
        if best is None or e["logloss"] < best["logloss"]:
            best = e
    rep["teams"] = best
    report[t] = rep
    print(t, rep, flush=True)

# ridge de los equipos: el que mejor resultó para "exito" en las semanas 7-8
lam_teams = report["ok"]["teams"]["lambda"]
LAM = penalty(LAMBDA, lam_teams, True, True)
report["lambdaTeams"] = lam_teams

by = fit_ridge(Xtr, [max(YARD_CLIP[0], min(YARD_CLIP[1], r["yards"])) for r in train], LAM)
yt = [r["yards"] for r in test]
mean = sum(r["yards"] for r in train) / len(train)
report["yards"] = dict(mae=round(sum(abs(dot_s(by, x) - v) for x, v in zip(Xte, yt)) / len(yt), 2),
                       baseMae=round(sum(abs(mean - v) for v in yt) / len(yt), 2))
print("yards", report["yards"], flush=True)

# ---------------------------------------------------------------- exportar
Xall = [feats(r) for r in rows]
coef = {}
for t in ["ok"] + OUTCOMES:
    coef[t] = [round(v, 4) for v in fit_logit(Xall, [target(r, t) for r in rows], LAM)]
    print("ajustado", t, flush=True)
coef["yards"] = [round(v, 4) for v in fit_ridge(Xall, [max(YARD_CLIP[0], min(YARD_CLIP[1], r["yards"])) for r in rows], LAM)]

# perfiles de equipo (ofensivo y defensivo) y de la liga
def profile(rs):
    n = len(rs)
    if not n:
        return None
    covs = Counter(r["cov"] for r in rs)
    pers = Counter(r["pers"] for r in rs if r["pers"])
    npers = sum(pers.values()) or 1
    boxes = [r["box"] for r in rs if r["box"] is not None]
    return dict(
        plays=n,
        success=round(100 * sum(r["ok"] for r in rs) / n, 1),
        yards=round(sum(r["yards"] for r in rs) / n, 2),
        comp=round(100 * sum(r["res"] == "C" for r in rs) / n, 1),
        sack=round(100 * sum(r["res"] == "S" for r in rs) / n, 1),
        intc=round(100 * sum(r["res"] == "IN" for r in rs) / n, 1),
        pa=round(100 * sum(r["pa"] for r in rs) / n, 1),
        box=round(sum(boxes) / len(boxes), 1) if boxes else None,
        cov={c: round(covs.get(c, 0) / n, 4) for c in COVS},
        pers=[[a, b, c, round(m / npers, 3)] for (a, b, c), m in pers.most_common(5)],
    )

profiles = {t: dict(off=profile([r for r in rows if r["off"] == t]), dfn=profile([r for r in rows if r["dfn"] == t]))
            for t in TEAMS}
league = profile(rows)

OC = {k: i for i, k in enumerate(OUTCOMES)}
plays = [[r["down"], int(r["to_go"]), int(r["to_goal"]), r["q"], int(r["diff"]), r["late"],
          FORMS.index(r["form"]), r["ok"], int(r["yards"]), OC[r["res"]]] for r in rows]

dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
(ROOT / "web" / "model.js").write_text(
    f"// Generado por build_model.py. No editar a mano.\n"
    f"const MODEL_FORMS = {dump(FORMS)};\n"
    f"const MODEL_BASE = {dump(BASE)};\n"
    f"const MODEL_COVS = {dump(COVS)};\n"
    f"const MODEL_TEAMS = {dump(TEAMS)};\n"
    f"const MODEL_OUTCOMES = {dump(OUTCOMES)};\n"
    f"const MODEL_COEF = {dump(coef)};\n"
    f"const MODEL_REPORT = {dump(report)};\n"
    f"const TEAM_PROFILE = {dump(profiles)};\n"
    f"const LEAGUE_PROFILE = {dump(league)};\n"
    f"// down, yardas por recorrer, yardas a la zona, cuarto, diferencia, 2 min, formacion, exito, yardas, resultado\n"
    f"const MODEL_PLAYS = {dump(plays)};\n", encoding="utf-8")
print("web/model.js escrito:", len(rows), "jugadas", flush=True)

test_row = dict(down=3, to_go=7, to_goal=40, q=4, diff=-3, late=0, pa=0, form="SHOTGUN", cov="Cover-3", off="KC", dfn="BUF")
x = feats(test_row)
print("TEST", {t: round(sig(dot_s(coef[t], x)), 4) for t in ["ok"] + OUTCOMES}, round(dot_s(coef["yards"], x), 3), flush=True)
