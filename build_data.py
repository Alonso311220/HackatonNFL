"""Calcula estadisticas a partir de data/plays.csv y escribe web/data.js
para que web/index.html funcione abriendolo directamente (sin servidor).

Genera:
  FORMATION_DATA : estadisticas por cuarto y formacion
  TEAM_DATA      : estadisticas por equipo y formacion (todos los cuartos)
  TEAMS          : nombre, conferencia y division de cada equipo
"""
import csv, json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
MIN_PLAYS = 30  # menos jugadas que esto = muestra pequena

# Abreviaturas tal como aparecen en plays.csv (LA = Rams).
TEAMS = {
    "BUF": ("Buffalo Bills", "AFC", "Este"), "MIA": ("Miami Dolphins", "AFC", "Este"),
    "NE": ("New England Patriots", "AFC", "Este"), "NYJ": ("New York Jets", "AFC", "Este"),
    "BAL": ("Baltimore Ravens", "AFC", "Norte"), "CIN": ("Cincinnati Bengals", "AFC", "Norte"),
    "CLE": ("Cleveland Browns", "AFC", "Norte"), "PIT": ("Pittsburgh Steelers", "AFC", "Norte"),
    "HOU": ("Houston Texans", "AFC", "Sur"), "IND": ("Indianapolis Colts", "AFC", "Sur"),
    "JAX": ("Jacksonville Jaguars", "AFC", "Sur"), "TEN": ("Tennessee Titans", "AFC", "Sur"),
    "DEN": ("Denver Broncos", "AFC", "Oeste"), "KC": ("Kansas City Chiefs", "AFC", "Oeste"),
    "LV": ("Las Vegas Raiders", "AFC", "Oeste"), "LAC": ("Los Angeles Chargers", "AFC", "Oeste"),
    "DAL": ("Dallas Cowboys", "NFC", "Este"), "NYG": ("New York Giants", "NFC", "Este"),
    "PHI": ("Philadelphia Eagles", "NFC", "Este"), "WAS": ("Washington Football Team", "NFC", "Este"),
    "CHI": ("Chicago Bears", "NFC", "Norte"), "DET": ("Detroit Lions", "NFC", "Norte"),
    "GB": ("Green Bay Packers", "NFC", "Norte"), "MIN": ("Minnesota Vikings", "NFC", "Norte"),
    "ATL": ("Atlanta Falcons", "NFC", "Sur"), "CAR": ("Carolina Panthers", "NFC", "Sur"),
    "NO": ("New Orleans Saints", "NFC", "Sur"), "TB": ("Tampa Bay Buccaneers", "NFC", "Sur"),
    "ARI": ("Arizona Cardinals", "NFC", "Oeste"), "LA": ("Los Angeles Rams", "NFC", "Oeste"),
    "SF": ("San Francisco 49ers", "NFC", "Oeste"), "SEA": ("Seattle Seahawks", "NFC", "Oeste"),
}

def success(down, to_go, yards):
    # Criterio estandar: 1.er down >=40% de lo que falta, 2.o >=60%, 3.o y 4.o todo.
    need = {1: 0.4, 2: 0.6}.get(down, 1.0) * to_go
    return yards >= need

def new():
    return dict(n=0, yards=0.0, ok=0, comp=0, sack=0)

def add(s, r, yards):
    s["n"] += 1
    s["yards"] += yards
    s["ok"] += success(int(r["down"]), float(r["yardsToGo"]), yards)
    s["comp"] += r["passResult"] == "C"
    s["sack"] += r["passResult"] == "S"

def pack(s):
    n = s["n"]
    return dict(
        plays=n,
        avgYards=round(s["yards"] / n, 2),
        successRate=round(100 * s["ok"] / n, 1),
        completionRate=round(100 * s["comp"] / n, 1),
        sackRate=round(100 * s["sack"] / n, 1),
    )

by_quarter = defaultdict(new)
by_team = defaultdict(new)
team_total = defaultdict(int)
unknown = set()

with open(ROOT / "data" / "plays.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        form = r["offenseFormation"]
        if form in ("NA", ""):
            continue
        yards = float(r["playResult"])
        add(by_quarter[(int(r["quarter"]), form)], r, yards)
        team = r["possessionTeam"]
        if team not in TEAMS:
            unknown.add(team)
            continue
        add(by_team[(team, form)], r, yards)
        team_total[team] += 1

if unknown:
    raise SystemExit(f"Equipos sin metadatos: {sorted(unknown)}")

formation_rows = [
    dict(quarter=q, formation=form, small=s["n"] < MIN_PLAYS, **pack(s))
    for (q, form), s in sorted(by_quarter.items())
]
team_rows = [
    dict(team=t, formation=form, share=round(100 * s["n"] / team_total[t], 1), **pack(s))
    for (t, form), s in sorted(by_team.items())
]
teams_meta = {k: dict(name=v[0], conf=v[1], div=v[2]) for k, v in TEAMS.items()}

out = ROOT / "web"
out.mkdir(exist_ok=True)
dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
(out / "data.js").write_text(
    f"const MIN_PLAYS = {MIN_PLAYS};\n"
    f"const FORMATION_DATA = {dump(formation_rows)};\n"
    f"const TEAM_DATA = {dump(team_rows)};\n"
    f"const TEAMS = {dump(teams_meta)};\n", encoding="utf-8")
print(f"{len(formation_rows)} filas por cuarto, {len(team_rows)} por equipo, {len(teams_meta)} equipos")
