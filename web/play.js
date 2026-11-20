"use strict";
/* Paso 7: simulador de jugada.
   Usa los datos globales de data.js / model.js y las utilidades de app.js ($, h, s, tabGroup,
   FORMATIONS, OFF_LINE, ROLES, TEAMS, teamLogo, selectedTeam, setTeam, teamListeners). */
(function simulator() {
  /* ============================ constantes ============================ */
  const S = 11, LAT = 26.65, VW = 880, VH = Math.round(2 * LAT * S), WIN_BACK = 15;
  const T_SET = 1700, T_SNAP = 2800;               // ms: jugadores en su sitio / snap
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const ease = u => u * u * (3 - 2 * u);
  const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const OUT_NAME = { C: "Pase completo", I: "Pase incompleto", S: "Captura (sack)", IN: "Intercepción", R: "Corrida del quarterback" };
  const COV_INFO = {
    "Cover-3": "Tres defensores cuidan el fondo del campo y los demás protegen zonas cortas.",
    "Cover-1": "Cada defensor marca a un receptor y un safety vigila el fondo.",
    "Cover-2": "Dos safeties se reparten la mitad profunda del campo; los esquineros cubren la zona corta.",
    "Quarters": "Cuatro defensores se reparten el fondo en cuartos; se reacciona a las rutas.",
    "Cover-6": "Mezcla: un lado defiende en cuartos y el otro en Cover 2.",
    "Red Zone": "Cobertura compacta cerca de la zona de anotación: casi no hay espacio atrás.",
    "Cover-0": "Todos marcan a un receptor sin ayuda profunda. Es arriesgada y suele llevar presión extra.",
    "2-Man": "Dos safeties vigilan el fondo y los demás marcan hombre a hombre.",
    "Otra": "Una cobertura poco común (se dibuja como Cover 3).",
  };
  const MAN_COV = new Set(["Cover-1", "Cover-0", "2-Man"]);

  /* ============================ modelo ============================ */
  const NF = MODEL_FORMS.length, NC = MODEL_COVS.length, NT = MODEL_TEAMS.length;
  const F0 = 15, C0 = F0 + NF - 1, O0 = C0 + NC - 1, D0 = O0 + NT, KK = D0 + NT;
  const TI = Object.fromEntries(MODEL_TEAMS.map((t, i) => [t, i]));
  const sig = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  const dot = (b, x) => { let a = 0; for (let i = 0; i < x.length; i++) if (x[i]) a += b[i] * x[i]; return a; };

  // Debe coincidir con feats() de build_model.py
  function feat(sit, form, cov, off, dfn, tm = { off: true, dfn: true }) {
    const x = new Array(KK).fill(0);
    const tg = Math.min(sit.toGo, 25) / 10, d = Math.max(-21, Math.min(21, sit.diff)) / 10;
    x[0] = 1;
    if (sit.down === 2) x[1] = 1;
    if (sit.down === 3) x[2] = 1;
    if (sit.down === 4) x[3] = 1;
    x[4] = tg;
    if (sit.down >= 3) x[5] = tg;
    x[6] = sit.toGoal / 100;
    if (sit.toGoal <= 20) x[7] = 1;
    if (sit.q === 2) x[8] = 1;
    if (sit.q === 3) x[9] = 1;
    if (sit.q === 4) { x[10] = 1; x[12] = d; }
    x[11] = d;
    if (sit.late && (sit.q === 2 || sit.q === 4)) x[13] = 1;
    if (sit.pa) x[14] = 1;
    const fi = MODEL_FORMS.indexOf(form); if (fi > 0) x[F0 + fi - 1] = 1;
    const ci = MODEL_COVS.indexOf(cov); if (ci > 0) x[C0 + ci - 1] = 1;
    if (tm.off) x[O0 + TI[off]] = 1;
    if (tm.dfn) x[D0 + TI[dfn]] = 1;
    return x;
  }
  const outProbs = x => {
    const raw = MODEL_OUTCOMES.map(o => sig(dot(MODEL_COEF[o], x)));
    const t = raw.reduce((a, b) => a + b, 0);
    return raw.map(v => v / t);
  };
  const defProfile = d => (TEAM_PROFILE[d] && TEAM_PROFILE[d].dfn) || LEAGUE_PROFILE;
  const offProfile = d => (TEAM_PROFILE[d] && TEAM_PROFILE[d].off) || LEAGUE_PROFILE;
  function covMix(dfn, sit) {
    const w = MODEL_COVS.map(c => defProfile(dfn).cov[c] || 0);
    if (sit.toGoal > 25) { const i = MODEL_COVS.indexOf("Red Zone"); if (i >= 0) w[i] = 0; }
    const t = w.reduce((a, b) => a + b, 0) || 1;
    return w.map(v => v / t);
  }
  // Probabilidades antes del snap: se promedian las coberturas que suele usar la defensa.
  function predict(sit, form, off, dfn, tm) {
    const mix = covMix(dfn, sit);
    let ok = 0, yards = 0; const p = [0, 0, 0, 0, 0];
    mix.forEach((w, ci) => {
      if (!w) return;
      const x = feat(sit, form, MODEL_COVS[ci], off, dfn, tm);
      ok += w * sig(dot(MODEL_COEF.ok, x));
      yards += w * dot(MODEL_COEF.yards, x);
      outProbs(x).forEach((v, k) => { p[k] += w * v; });
    });
    return { ok, yards, p };
  }
  const pick = (w, rng) => { let u = rng() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < w.length; i++) { u -= w[i]; if (u <= 0) return i; } return w.length - 1; };

  const POOLS = MODEL_OUTCOMES.map((_, oi) => MODEL_PLAYS.filter(p => p[9] === oi));
  function sampleYards(oi, sit, rng) {
    const P = POOLS[oi];
    const tries = [
      p => p[0] === sit.down && Math.abs(p[1] - sit.toGo) <= 3 && Math.abs(p[2] - sit.toGoal) <= 20,
      p => p[0] === sit.down && Math.abs(p[1] - sit.toGo) <= 4,
      p => Math.abs(p[1] - sit.toGo) <= 5,
    ];
    for (const f of tries) { const pool = P.filter(f); if (pool.length >= 15) return pool[Math.floor(rng() * pool.length)][8]; }
    return P[Math.floor(rng() * P.length)][8];
  }
  const needYards = sit => ({ 1: 0.4, 2: 0.6 }[sit.down] || 1) * sit.toGo;

  function samplePers(dfn, rng, mostLikely) {
    const list = defProfile(dfn).pers.length ? defProfile(dfn).pers : LEAGUE_PROFILE.pers;
    const i = mostLikely ? 0 : pick(list.map(p => p[3]), rng);
    return { dl: list[i][0], lb: list[i][1], db: list[i][2] };
  }
  function sampleResult(sit, form, off, dfn, rng) {
    const mix = covMix(dfn, sit), ci = pick(mix, rng), cov = MODEL_COVS[ci];
    const probs = outProbs(feat(sit, form, cov, off, dfn));
    const oi = pick(probs, rng), outcome = MODEL_OUTCOMES[oi];
    const los = 100 - sit.toGoal;
    let yards = 0, td = false, safety = false;
    if (outcome === "C" || outcome === "S" || outcome === "R") yards = sampleYards(oi, sit, rng);
    if ((outcome === "C" || outcome === "R") && yards >= sit.toGoal) { td = true; yards = sit.toGoal; }
    if (outcome === "S" || yards < 0) {
      if (los + yards <= 0) { yards = -los; safety = outcome === "S" || outcome === "R"; }
    }
    return { cov, outcome, probs, prob: probs[oi], yards, td, safety, pers: samplePers(dfn, rng),
      success: td || (outcome !== "I" && outcome !== "IN" && yards >= needYards(sit)) };
  }
  function previewResult(sit, dfn) {
    const mix = covMix(dfn, sit);
    return { cov: MODEL_COVS[mix.indexOf(Math.max(...mix))], outcome: "C", yards: Math.min(8, sit.toGoal), td: false,
      safety: false, pers: samplePers(dfn, null, true), preview: true };
  }

  /* ============================ animación: utilidades ============================ */
  function posAt(kf, t) {
    if (t <= kf[0].t) return { x: kf[0].x, y: kf[0].y };
    const L = kf[kf.length - 1];
    if (t >= L.t) return { x: L.x, y: L.y };
    let i = 1; while (kf[i].t < t) i++;
    const a = kf[i - 1], b = kf[i];
    let u = (t - a.t) / (b.t - a.t || 1); if (b.e) u = ease(u);
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) };
  }
  function hold(kf, t) { const L = kf[kf.length - 1]; if (t > L.t) kf.push({ t, x: L.x, y: L.y }); }
  function goTo(kf, t0, t1, x, y, e) { hold(kf, t0); kf.push({ t: Math.max(t1, kf[kf.length - 1].t + 1), x, y, e }); }
  function pursue(kf, t0, tEnd, tx, ty, speed = 7.5) {
    hold(kf, t0);
    const L = kf[kf.length - 1];
    if (tEnd <= L.t) return;
    const d = Math.hypot(tx - L.x, ty - L.y), tt = L.t + d / speed * 1000;
    if (tt <= tEnd) { kf.push({ t: tt, x: tx, y: ty }); kf.push({ t: tEnd, x: tx, y: ty }); }
    else { const f = (tEnd - L.t) * speed / 1000 / d; kf.push({ t: tEnd, x: L.x + (tx - L.x) * f, y: L.y + (ty - L.y) * f }); }
  }
  const pathLen = pts => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
  const lat = xp => (xp - 50) * 0.533;                                  // % de ancho -> yardas laterales
  const dep = yp => 0.5 + Math.max(0, yp - 29.5) * 0.62;                // yardas detrás de la línea
  const spread = (n, w) => n <= 0 ? [] : n === 1 ? [0] : Array.from({ length: n }, (_, i) => -w + 2 * w * i / (n - 1));
  const sgn = v => (v < 0 ? -1 : 1);

  /* ============================ plan de la jugada ============================ */
  function buildPlan(ctx) {
    const { sit, form, res, rng } = ctx;
    const los = 100 - sit.toGoal;
    const F = FORMATIONS[form];
    const players = [];
    const mk = (side, role, label, ax, ay, extra = {}) => {
      const p = { id: players.length, side, role, label, ax, ay, kf: [], ...extra };
      players.push(p); return p;
    };

    /* ---- ataque ---- */
    const offSpecs = [...OFF_LINE, ...F.players];
    offSpecs.forEach(([role, label, xp, yp]) => mk("off", role, label, los - dep(yp), lat(xp)));
    const qb = players.find(p => p.role === "QB");
    const underCenter = los - qb.ax < 2.6;
    const recs = players.filter(p => ["WR", "TE", "RB"].includes(p.role));
    const pocket = { x: qb.ax - (underCenter ? 5.4 : 1.3), y: qb.ay };
    const teSide = sgn((players.find(p => p.role === "TE") || { ay: 1 }).ay);

    /* ---- defensa ---- */
    const defs = buildDefense(res.pers, res.cov, recs, los, teSide);
    defs.forEach(d => players.push(Object.assign(d, { id: players.length, kf: [] })));

    /* ---- posiciones iniciales y alineación ---- */
    const offs = players.filter(p => p.side === "off"), dfs = players.filter(p => p.side === "def");
    offs.forEach((p, i) => { p.kf = [{ t: 0, x: los - 13, y: (i - 5) * 1.5 }, { t: T_SET, x: p.ax, y: p.ay, e: true }, { t: T_SNAP, x: p.ax, y: p.ay }]; });
    dfs.forEach((p, i) => { p.kf = [{ t: 0, x: los + 13 + (i % 2) * 2, y: (i - dfs.length / 2) * 1.7 }, { t: T_SET, x: p.ax, y: p.ay, e: true }, { t: T_SNAP, x: p.ax, y: p.ay }]; });

    /* ---- resultado ---- */
    const o = res.outcome, isPass = o === "C" || o === "I" || o === "IN";
    const finalX = clamp(los + res.yards, -3, res.td ? 102.5 : 100);
    let target = null, catchPt = null, T_throw = 0, T_catch = 0, T_end = 0, routes = [], cues = [];
    const routeEndT = {};

    // rutas: la que recibe el pase se calcula para llegar al punto exacto
    const eligible = recs.filter(r => !(ctx.sit.pa && r.role === "RB"));
    let D = 0;
    if (isPass) {
      if (o === "C") { const yac = res.yards > 4 ? clamp(res.yards * 0.28, 0, 9) : 0; D = res.yards - yac; if (D < -1) D = res.yards; }
      else D = sit.down >= 3 ? clamp(sit.toGo + Math.round(rng() * 7 - 2), 3, 28) : Math.round(5 + rng() * 15);
      D = Math.round(clamp(D, -6, Math.max(1, sit.toGoal - 1)));
      const wts = (eligible.length ? eligible : recs).map(r => {
        if (D <= 2) return { WR: 1, TE: 2, RB: 3 }[r.role];
        if (D <= 8) return { WR: 2, TE: 2, RB: ctx.sit.pa ? 0 : 0.6 }[r.role];
        return { WR: 3, TE: 1, RB: 0 }[r.role];
      });
      const pool = eligible.length ? eligible : recs;
      target = pool[pick(wts.some(v => v > 0) ? wts : wts.map(() => 1), rng)];
    }
    const sorted = [...recs].sort((a, b) => Math.abs(b.ay) - Math.abs(a.ay));
    const PRESET = [16, 10, 7, 5, 12];
    recs.forEach(r => {
      const side = sgn(r.ay === 0 ? (rng() < 0.5 ? -1 : 1) : r.ay);
      const isTarget = r === target;
      let d, type;
      if (isTarget) d = D;
      else if (r.role === "RB") d = 2;
      else if (r.role === "TE") d = 6 + Math.round(rng() * 3);
      else d = PRESET[sorted.indexOf(r) % PRESET.length] + Math.round(rng() * 2);
      type = d <= 2 ? "flat" : d <= 5 ? (rng() < 0.5 ? "slant" : "out") : d <= 12 ? ["out", "curl", "in"][Math.floor(rng() * 3)] : d <= 20 ? ["in", "post", "corner"][Math.floor(rng() * 3)] : (rng() < 0.6 ? "go" : "post");
      if (r.role === "RB" && !isTarget) type = "flat";
      const pts = routePoints(r, d, type, side, los);
      r.route = { pts, type, depth: d, side, isTarget };
      if (ctx.sit.pa && r.role === "RB" && !isTarget) r.route = null;
    });

    // tiempos del lanzamiento
    if (isPass) {
      const rp = target.route.pts, len = pathLen(rp);
      const arr = T_SNAP + 100 + Math.max(len / 8 * 1000, 900);
      catchPt = rp[rp.length - 1];
      const dist = Math.hypot(catchPt.x - pocket.x, catchPt.y - pocket.y);
      const flight = clamp(dist / 20 * 1000, 380, 1800);
      T_throw = Math.max(T_SNAP + 1400, arr - flight);
      T_catch = T_throw + flight;
    }
    const T_sack = T_SNAP + 2300 + Math.round(rng() * 600);
    const T_scr = T_SNAP + 1800 + Math.round(rng() * 400);

    /* ---- línea ofensiva, QB y corredores ---- */
    const dropEnd = T_SNAP + (underCenter ? 1000 : 600);
    qb.kf.push({ t: T_SNAP + 150, x: qb.ax, y: qb.ay });
    qb.kf.push({ t: dropEnd, x: pocket.x, y: pocket.y, e: true });
    offs.filter(p => p.role === "OL").forEach((p, i) => {
      goTo(p.kf, T_SNAP + 100, T_SNAP + 700, p.ax - 0.9 - (i === 2 ? 0.3 : 0), p.ay, true);
    });
    offs.filter(p => p.role === "FB").forEach(p => goTo(p.kf, T_SNAP + 150, T_SNAP + 800, p.ax + 0.8, p.ay + (p.ay >= 0 ? 1 : -1) * 0.8, true));
    offs.filter(p => p.role === "RB" && !p.route).forEach(p => {
      if (ctx.sit.pa) { goTo(p.kf, T_SNAP + 250, T_SNAP + 850, los + 0.8, qb.ay + 1.2, true); goTo(p.kf, T_SNAP + 1100, T_SNAP + 1800, los - 1.2, p.ay + (p.ay >= 0 ? 2.2 : -2.2), true); }
      else goTo(p.kf, T_SNAP + 200, T_SNAP + 800, p.ax, p.ay, true);
    });

    /* ---- receptores ---- */
    recs.forEach(r => {
      if (!r.route) return;
      const pts = [{ x: r.ax, y: r.ay }, ...r.route.pts];
      let t = T_SNAP + 100;
      hold(r.kf, t);
      for (let i = 1; i < pts.length; i++) {
        t += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / 8 * 1000;
        r.kf.push({ t, x: pts[i].x, y: pts[i].y });
      }
      routeEndT[r.id] = t;
      r.route.full = pts; r.route.len = pathLen(pts);
      r.route.t0 = T_SNAP + 100; r.route.t1 = t;
    });

    /* ---- qué pasa con el balón y con el portador ---- */
    let carrier = null, carrierKf = null, resolveT, ballPieces = [], endNote = "", yacPath = null;
    const finalY = (base) => clamp(base, -24, 24);
    if (o === "C") {
      carrier = target; resolveT = T_catch;
      const sideSign = target.route.side, fy = finalY(catchPt.y + sideSign * clamp((finalX - catchPt.x) * 0.25, 0, 5));
      const dRun = Math.hypot(finalX - catchPt.x, fy - catchPt.y);
      const tRun = Math.max(res.td || dRun > 1 ? dRun / 7.2 * 1000 : 0, 350);
      hold(target.kf, T_catch);
      goTo(target.kf, T_catch + 1, T_catch + tRun, finalX, fy);
      T_end = T_catch + tRun + 450;
      yacPath = { x: finalX, y: fy };
      endNote = res.td ? "¡Touchdown!" : "Lo tumban en la yarda " + yardLabel(finalX);
    } else if (o === "I") {
      resolveT = T_catch; T_end = T_catch + 1300;
      hold(target.kf, T_catch + 400);
    } else if (o === "IN") {
      resolveT = T_catch; T_end = T_catch + 1700;
    } else if (o === "S") {
      resolveT = T_sack; T_end = T_sack + 900;
      goTo(qb.kf, dropEnd, T_sack, finalX, pocket.y + 0.6, true);
    } else { // R
      resolveT = T_scr;
      const dir = sgn(qb.ay || (rng() < 0.5 ? -1 : 1)) * (rng() < 0.5 ? -1 : 1);
      const fy = finalY(pocket.y + dir * clamp(Math.abs(finalX - pocket.x) * 0.45, 2, 10));
      const dRun = Math.hypot(finalX - pocket.x, fy - pocket.y), tRun = Math.max(dRun / 6.8 * 1000, 500);
      goTo(qb.kf, dropEnd, T_scr, pocket.x, pocket.y);
      goTo(qb.kf, T_scr + 1, T_scr + tRun, finalX, fy);
      T_end = T_scr + tRun + 500;
      carrier = qb; yacPath = { x: finalX, y: fy };
      endNote = res.td ? "¡Touchdown!" : "Lo frenan en la yarda " + yardLabel(finalX);
    }
    hold(qb.kf, T_end + 1500);

    /* ---- defensa en movimiento ---- */
    const man = []; // para dibujar las líneas de marca
    dfs.forEach(d => planDefender(d));
    function planDefender(d) {
      const kf = d.kf;
      if (d.mode === "rush") {
        const tx = pocket.x + 1.3 + Math.abs(d.ay) * 0.12, ty = pocket.y + d.ay * 0.32;
        const tArr = (o === "S" ? T_sack : T_SNAP + 1700 + (Math.abs(d.ay) % 3) * 140);
        goTo(kf, T_SNAP + 120, tArr, tx, ty, true);
      } else if (d.mode === "zone") {
        const dist = Math.hypot(d.zx - d.ax, d.zy - d.ay);
        const tArr = T_SNAP + 200 + Math.max(dist / 6.2 * 1000, 700);
        goTo(kf, T_SNAP + 200, tArr, d.zx, d.zy, true);
        if (isPass) {
          const shade = { x: lerp(d.zx, catchPt.x, 0.45), y: lerp(d.zy, catchPt.y, 0.45) };
          goTo(kf, Math.max(T_throw, tArr), T_catch, shade.x, shade.y, true);
        } else hold(kf, tArr);
      } else if (d.mode === "man") {
        const r = d.man;
        man.push({ d, r });
        if (r.route) {
          const stop = isPass ? T_catch : Math.max(resolveT, T_SNAP + 2200);
          for (let t = T_SNAP + 150; t <= stop; t += 120) {
            const rp = posAt(r.kf, t - 260);
            const deep = rp.x - los > 6;
            kf.push({ t, x: rp.x + (deep ? 0.9 : 0.5), y: rp.y - sgn(rp.y) * 0.8 });
          }
        } else hold(kf, T_SNAP + 1500);
      }
    }
    // interceptor / defensor que desvía el pase
    if (o === "IN" || o === "I") {
      const near = [...dfs].filter(d => d.mode !== "rush").sort((a, b) => {
        const pa = posAt(a.kf, T_catch - 250), pb = posAt(b.kf, T_catch - 250);
        return Math.hypot(pa.x - catchPt.x, pa.y - catchPt.y) - Math.hypot(pb.x - catchPt.x, pb.y - catchPt.y);
      })[0];
      if (near) {
        near.isPlaymaker = true;
        near.kf = near.kf.filter(k => k.t <= T_catch - 250);
        const gx = o === "IN" ? catchPt.x : catchPt.x - 0.3;
        goTo(near.kf, T_catch - 250, T_catch, gx, catchPt.y, true);
        if (o === "IN") goTo(near.kf, T_catch + 1, T_end, Math.max(los - 4, catchPt.x - 7), catchPt.y + sgn(catchPt.y) * 3);
        else hold(near.kf, T_end);
      }
    }
    // persecución final hacia el portador / punto del tackle
    const tackleAt = { x: finalX, y: o === "S" ? pocket.y + 0.6 : yacPath ? yacPath.y : catchPt ? catchPt.y : pocket.y };
    if (o === "C" || o === "R" || o === "S") {
      const order = [...dfs].sort((a, b) => {
        const pa = posAt(a.kf, resolveT), pb = posAt(b.kf, resolveT);
        return Math.hypot(pa.x - tackleAt.x, pa.y - tackleAt.y) - Math.hypot(pb.x - tackleAt.x, pb.y - tackleAt.y);
      });
      order.forEach((d, i) => {
        const ang = i * 2.4, rad = i === 0 ? 0.9 : 0.9 + i * 0.28;
        const tx = tackleAt.x + (i === 0 ? 0.9 : Math.cos(ang) * rad), ty = tackleAt.y + (i === 0 ? 0 : Math.sin(ang) * rad);
        const sp = i === 0 ? 11 : 7.8;
        pursue(d.kf, resolveT, T_end - (i === 0 ? 120 : 0), tx, ty, sp);
      });
    } else if (o === "I") {
      dfs.filter(d => !d.isPlaymaker).forEach(d => hold(d.kf, T_end));
    } else if (o === "IN") {
      const pm = dfs.find(d => d.isPlaymaker);
      dfs.filter(d => d !== pm).forEach(d => hold(d.kf, T_end));
      // la ofensiva persigue al interceptor
      offs.filter(p => p.role !== "OL").forEach(p => pursue(p.kf, T_catch, T_end, catchPt.x - 5, catchPt.y, 6.5));
    }
    [...players].forEach(p => hold(p.kf, T_end + 1500));

    /* ---- el balón ---- */
    const ctr = offs.find(p => p.role === "OL" && Math.abs(p.ay) < 0.1) || offs.find(p => p.role === "OL");
    const ballKf = [];
    const bAt = (t) => {
      // devuelve {x,y,z}
      if (t < T_SNAP) { const p = posAt(ctr.kf, t); return { x: p.x + 0.6, y: p.y, z: 0 }; }
      const tIn = T_SNAP + (underCenter ? 150 : 380);
      if (t < tIn) { const a = posAt(ctr.kf, T_SNAP), b = posAt(qb.kf, tIn), u = (t - T_SNAP) / (tIn - T_SNAP);
        return { x: lerp(a.x + 0.6, b.x, u), y: lerp(a.y, b.y, u), z: underCenter ? 0 : Math.sin(u * Math.PI) * 0.6 }; }
      if (isPass) {
        if (t < T_throw) { const p = posAt(qb.kf, t); return { x: p.x, y: p.y, z: 0 }; }
        if (t < T_catch) { const a = posAt(qb.kf, T_throw), u = (t - T_throw) / (T_catch - T_throw);
          const land = (o === "I") ? { x: catchPt.x + (rng.land > 0 ? 2.2 : -1.6), y: catchPt.y + 0.8 } : catchPt;
          return { x: lerp(a.x, land.x, u), y: lerp(a.y, land.y, u), z: Math.sin(u * Math.PI) * clamp(Math.hypot(land.x - a.x, land.y - a.y) / 10, 0.5, 3.2) }; }
        if (o === "C") { const p = posAt(target.kf, t); return { x: p.x, y: p.y, z: 0 }; }
        if (o === "IN") { const pm = dfs.find(d => d.isPlaymaker), p = pm ? posAt(pm.kf, t) : catchPt; return { x: p.x, y: p.y, z: 0 }; }
        // incompleto: rebota y se detiene
        const land = { x: catchPt.x + (rng.land > 0 ? 2.2 : -1.6), y: catchPt.y + 0.8 };
        const u = clamp((t - T_catch) / 500, 0, 1);
        return { x: land.x + (rng.land > 0 ? 0.9 : -0.6) * u, y: land.y, z: Math.abs(Math.sin(u * Math.PI * 2)) * 0.6 * (1 - u) };
      }
      const c = carrier ? posAt(carrier.kf, t) : posAt(qb.kf, t);
      return { x: c.x, y: c.y, z: 0 };
    };
    rng.land = rng() < 0.55 ? 1 : -1;

    /* ---- narración ---- */
    const covName = res.cov, persTxt = `${res.pers.dl}-${res.pers.lb}-${res.pers.db}`;
    const tgtTxt = target ? `${ROLES[target.role].name.replace(/ \(.*\)/, "")} (${target.label})` : "";
    cues = [
      { t: 0, text: `Los jugadores se acomodan: ${TEAMS[ctx.off].name} ataca con ${F.name}${ctx.sit.pa ? " (play action)" : ""} y ${TEAMS[ctx.dfn].name} defiende con ${persTxt} (${res.pers.dl} de línea, ${res.pers.lb} linebackers, ${res.pers.db} defensas).` },
      { t: T_SET, text: `La defensa muestra ${covName}. ${COV_INFO[covName] || ""}` },
      { t: T_SNAP, text: ctx.sit.pa ? "Snap. El quarterback finge la entrega al corredor (play action) para que los linebackers den un paso hacia el frente." : "Snap: el centro entrega el balón al quarterback." },
      { t: T_SNAP + 900, text: "La línea ofensiva bloquea, los receptores corren sus rutas y la defensa cae a su cobertura." },
    ];
    if (isPass) {
      cues.push({ t: T_throw, text: `Lanzamiento de ${Math.max(0, Math.round(Math.abs(catchPt.x - los)))} yardas hacia ${tgtTxt}.` });
      if (o === "C") cues.push({ t: T_catch, text: `¡Completo! ${res.td ? "Sigue corriendo hasta la zona de anotación." : `Gana ${res.yards >= 0 ? res.yards : 0} yardas en total.`}` });
      if (o === "I") cues.push({ t: T_catch, text: ["El defensor desvía el balón.", "El receptor no logra atraparlo.", "El pase se va fuera de su alcance."][Math.floor(rng() * 3)] });
      if (o === "IN") cues.push({ t: T_catch, text: "¡Intercepción! Un defensor atrapa el balón y la posesión cambia de equipo." });
    } else if (o === "S") cues.push({ t: T_sack - 500, text: "La presión llega antes de que el quarterback encuentre a un receptor libre." });
    else cues.push({ t: T_scr, text: "El quarterback ve el pase cerrado y decide correr con el balón." });
    cues.push({ t: T_end, text: resultText(ctx, res, endNote) });

    // elementos del campo
    const fd = Math.min(100, los + sit.toGo);
    return { players, bAt, qb, recs, target, man, routes: recs.filter(r => r.route && r.route.full), los, fd, finalX, endNote,
      T_set: T_SET, T_snap: T_SNAP, T_throw, T_catch, T_end, T_total: T_end + 1500, cues, pocket, catchPt, res, carrier };
  }

  function yardLabel(x) { return x <= 50 ? `${Math.round(x)} propia` : `${Math.round(100 - x)} rival`; }
  function resultText(ctx, res, endNote) {
    const o = res.outcome, y = res.yards;
    if (o === "C") return res.td ? "Touchdown por pase." : `Pase completo de ${y} yardas. ${endNote}.`;
    if (o === "I") return "Pase incompleto: el reloj se detiene y no se avanza. Se pierde un intento.";
    if (o === "IN") return "Intercepción: el balón cambia de equipo.";
    if (o === "S") return res.safety ? "Captura dentro de su propia zona de anotación: safety (2 puntos para la defensa)." : `Captura: el quarterback pierde ${-y} yardas.`;
    return res.td ? "Touchdown corriendo." : `Corrida del quarterback de ${y} yardas. ${endNote}.`;
  }

  /* ---- rutas ---- */
  function routePoints(r, d, type, s_, los) {
    const x0 = r.ax, y0 = r.ay, X = los + d, cl = y => clamp(y, -25, 25);
    const P = (x, y) => ({ x, y: cl(y) });
    switch (type) {
      case "flat": return [P(Math.min(x0 + 0.5, los + Math.max(d, 0) * 0.5), y0 + s_ * 4), P(X, y0 + s_ * 9)];
      case "slant": return [P(Math.max(x0 + 1, los + 1.2), y0), P(X, y0 - s_ * Math.max(2, d * 0.6))];
      case "out": return [P(X, y0), P(X, y0 + s_ * 4.5)];
      case "in": return [P(X, y0), P(X, y0 - s_ * 6)];
      case "curl": return [P(X + 2.2, y0 + s_ * 0.5), P(X, y0 - s_ * 1.4)];
      case "post": return [P(los + d * 0.65, y0), P(X, y0 - s_ * Math.max(3, d * 0.33))];
      case "corner": return [P(los + d * 0.65, y0), P(X, y0 + s_ * Math.max(3, d * 0.33))];
      default: return [P(los + d * 0.5, y0 + s_ * 0.4), P(X, y0 + s_ * 1.2)];     // go
    }
  }

  /* ---- defensa: alineación y cobertura ---- */
  function buildDefense(pers, cov, recs, los, teSide) {
    const D = [];
    const add = (role, label, dx, y, mode, extra = {}) => D.push({ side: "def", role, label, ax: los + dx, ay: y, mode, ...extra });
    const zone = (dx, y, r) => ({ zx: los + dx, zy: y, zr: r });
    const widest = [...recs].sort((a, b) => Math.abs(b.ay) - Math.abs(a.ay));
    const man = MAN_COV.has(cov), c = cov === "Otra" ? "Cover-3" : cov;
    const cbN = Math.max(1, pers.db - 2), sN = pers.db - cbN;
    const avail = [...widest];
    const takeFor = pref => { // saca de la lista al receptor preferido
      const i = avail.findIndex(r => pref.includes(r.role)); const k = i < 0 ? 0 : i;
      return avail.splice(k, 1)[0];
    };

    // línea defensiva
    spread(pers.dl, pers.dl >= 4 ? 4.4 : 3.4).forEach(y => add("DL", "DL", 1.0, y, "rush"));

    // esquineros
    const cbSides = [];
    for (let i = 0; i < cbN; i++) {
      const r = avail[0] || widest[i % widest.length] || { ay: i % 2 ? 18 : -18 };
      const side = sgn(r.ay === 0 ? (i % 2 ? 1 : -1) : r.ay);
      const press = man && (c !== "2-Man" || true);
      const depth = c === "Red Zone" ? 3 : man ? 1.4 : c === "Cover-2" ? 5 : 7;
      const slot = i >= 2;
      if (man) { const rr = takeFor(["WR", "TE", "RB"]); add("CB", "CB", slot ? 4 : depth, rr.ay * 0.97, "man", { man: rr }); cbSides.push(sgn(rr.ay)); }
      else {
        if (avail.length) avail.shift();
        let z;
        if (slot) z = zone(4, side * 12, 4.5);
        else if (c === "Cover-3") z = zone(15, side * 16, 8);
        else if (c === "Cover-2") z = zone(5, side * 15, 5);
        else if (c === "Quarters") z = zone(12, side * 16, 7);
        else if (c === "Cover-6") z = side < 0 ? zone(12, -16, 7) : zone(5, 15, 5);
        else if (c === "Red Zone") z = zone(3, side * 14, 4.5);
        else z = zone(15, side * 16, 8);
        add("CB", "CB", slot ? 4.5 : depth, (r.ay || side * 18) * 0.97, "zone", z);
      }
    }
    // safeties
    for (let i = 0; i < sN; i++) {
      const left = i === 0, side = left ? -1 : 1, sideTE = teSide;
      if (c === "Cover-1" && i === 0) add("S", "S", 12, 0, "zone", zone(15, 0, 9));
      else if (c === "Cover-1" || c === "Cover-0") { const rr = takeFor(["TE", "RB", "WR"]); add("S", "S", c === "Cover-0" ? 4 : 6, (rr ? rr.ay : sideTE * 6) * 0.8, rr ? "man" : "zone", rr ? { man: rr } : zone(6, sideTE * 8, 5)); }
      else if (c === "2-Man") add("S", "S", 13, side * 9, "zone", zone(15, side * 9, 8));
      else if (c === "Cover-3") { if (i === 0) add("S", "S", 12, 0, "zone", zone(15, 0, 9)); else add("S", "S", 6, sideTE * 8, "zone", zone(6, sideTE * 9, 5)); }
      else if (c === "Cover-2") add("S", "S", 13, side * 9, "zone", zone(15, side * 9, 8));
      else if (c === "Quarters") add("S", "S", 9, side * 6, "zone", zone(11, side * 6, 6.5));
      else if (c === "Cover-6") add("S", "S", 11, side * 8, "zone", side < 0 ? zone(11, -6, 6.5) : zone(15, 9, 8));
      else if (c === "Red Zone") add("S", "S", 5, side * 5, "zone", zone(5, side * 5, 4.5));
    }
    // linebackers
    const lbY = spread(pers.lb, pers.lb >= 3 ? 7 : 3.5);
    lbY.forEach((y, i) => {
      if (man) {
        if (c === "Cover-0" && i === Math.floor(lbY.length / 2)) { add("LB", "LB", 3.5, y, "rush"); return; }
        const rr = avail.length ? takeFor(["RB", "TE", "WR"]) : null;
        if (rr) add("LB", "LB", 4.5, y, "man", { man: rr });
        else add("LB", "LB", 4.5, y, "zone", zone(7, y, 4.5));
      } else {
        const dd = c === "Red Zone" ? 4 : c === "Cover-2" ? 9 : c === "Quarters" ? 6 : 8;
        const mid = c === "Cover-2" && lbY.length >= 3 && i === Math.floor(lbY.length / 2);
        add("LB", "LB", 4.5, y, "zone", zone(mid ? 13 : dd, mid ? 0 : y * 0.9, mid ? 6 : 4.5));
      }
    });
    return D;
  }

  /* ============================ dibujo ============================ */
  const L = { camX: 0 };
  const px = x => (x - L.camX) * S, py = y => (y + LAT) * S;

  function drawField(svg, los, fd) {
    svg.replaceChildren();
    L.camX = los - WIN_BACK;
    const x0 = Math.max(-10, L.camX), x1 = Math.min(110, L.camX + VW / S);
    const rect = (a, b, cls) => svg.append(s("rect", { x: px(a), y: 0, width: px(b) - px(a), height: VH, class: cls }));
    svg.append(s("rect", { x: 0, y: 0, width: VW, height: VH, class: "sf-out" }));
    rect(x0, x1, "sf-grass");
    for (let a = Math.ceil(x0 / 10) * 10; a < x1; a += 10) { if (a < 0 || a >= 100) continue; rect(a, Math.min(a + 5, x1), "sf-stripe"); }
    if (x0 < 0) rect(x0, Math.min(0, x1), "sf-ez own");
    if (x1 > 100) rect(Math.max(100, x0), x1, "sf-ez rival");
    const tx = (x, y, t, cls, extra = {}) => { const e = s("text", { x, y, class: cls, ...extra }); e.textContent = t; return e; };
    if (x0 < -1) svg.append(tx(px(-5), py(0), "TU ZONA DE ANOTACIÓN", "sf-ezt", { transform: `rotate(-90 ${px(-5)} ${py(0)})` }));
    if (x1 > 101) svg.append(tx(px(105), py(0), "ZONA DE ANOTACIÓN RIVAL", "sf-ezt", { transform: `rotate(90 ${px(105)} ${py(0)})` }));
    for (let a = Math.ceil(x0 / 5) * 5; a <= x1; a += 5) {
      if (a < 0 || a > 100) continue;
      svg.append(s("line", { x1: px(a), x2: px(a), y1: 0, y2: VH, class: a % 100 === 0 ? "sf-goal" : a % 10 === 0 ? "sf-l10" : "sf-l5" }));
      if (a % 10 === 0 && a > 0 && a < 100) {
        const n = String(a <= 50 ? a : 100 - a);
        svg.append(tx(px(a), py(-17), n, "sf-num"), tx(px(a), py(17), n, "sf-num", { transform: `rotate(180 ${px(a)} ${py(17)})` }));
      }
    }
    for (let a = Math.ceil(x0); a <= x1; a++) {
      if (a <= 0 || a >= 100 || a % 5 === 0) continue;
      [-3.1, 3.1, -25.6, 25.6].forEach(y => svg.append(s("line", { x1: px(a), x2: px(a), y1: py(y) - 3, y2: py(y) + 3, class: "sf-hash" })));
    }
    svg.append(s("line", { x1: 0, x2: VW, y1: py(-LAT), y2: py(-LAT), class: "sf-side" }), s("line", { x1: 0, x2: VW, y1: py(LAT), y2: py(LAT), class: "sf-side" }));
  }

  /* ============================ interfaz ============================ */
  const svg = $("simField");
  svg.setAttribute("viewBox", `0 0 ${VW} ${VH}`);
  const ui = { form: "SHOTGUN", pa: false, down: 1, q: 1 };
  let plan = null, anim = { t: 0, playing: false, last: 0, speed: 1, raf: 0, doneShown: false };
  let layers = null, entities = [], lastRes = null, mounted = null;

  const readSit = () => {
    const toGoal = Number($("simGoal").value);
    return { down: ui.down, q: ui.q, toGo: Math.min(Number($("simToGo").value), toGoal), toGoal, diff: Number($("simDiff").value),
      late: $("simLate").checked && (ui.q === 2 || ui.q === 4), pa: ui.pa };
  };
  const teams = () => ({ off: $("simOff").value, dfn: $("simDef").value });

  function mount(p) {
    plan = p;
    drawField(svg, p.los, p.fd);
    const g = n => { const e = s("g", { class: n }); svg.append(e); return e; };
    layers = { over: g("l-over"), zones: g("l-zones"), routes: g("l-routes"), man: g("l-man"), def: g("l-def"), off: g("l-off"), ball: g("l-ball"), hud: g("l-hud") };
    // líneas de referencia
    const losL = s("line", { x1: px(p.los), x2: px(p.los), y1: 0, y2: VH, class: "sim-los" });
    const fdL = s("line", { x1: px(p.fd), x2: px(p.fd), y1: 0, y2: VH, class: "sim-fd" });
    const losT = s("text", { x: px(p.los), y: 16, class: "sim-lbl los" }); losT.textContent = "Línea de golpeo";
    const fdT = s("text", { x: px(Math.min(p.fd, p.los + 60)), y: 16, class: "sim-lbl fd" }); fdT.textContent = p.fd >= 100 ? "Meta: zona de anotación" : "Meta: 1.er down";
    if (Math.abs(px(Math.min(p.fd, p.los + 60)) - px(p.los)) < 150) fdT.setAttribute("y", 32); // evita que las etiquetas se encimen
    layers.over.append(losL, fdL, losT, fdT);
    const gain = s("rect", { y: 0, height: VH, class: "sim-gain", x: px(p.los), width: 0 });
    layers.over.append(gain);
    const spot = s("line", { y1: 0, y2: VH, class: "sim-spot", x1: px(p.finalX), x2: px(p.finalX), opacity: 0 });
    const spotT = s("text", { y: VH - 10, class: "sim-spott", opacity: 0 });
    layers.over.append(spot, spotT);
    // zonas y marcas
    entities = [];
    p.players.filter(d => d.side === "def" && d.mode === "zone").forEach(d => {
      const e = s("ellipse", { cx: px(d.zx), cy: py(d.zy), rx: d.zr * S, ry: d.zr * S * 0.82, class: "sim-zone" });
      layers.zones.append(e); d.zoneEl = e;
    });
    p.man.forEach(m => { const l = s("line", { class: "sim-man" }); layers.man.append(l); m.el = l; });
    p.routes.forEach(r => {
      const pts = r.route.full, dstr = pts.map((q, i) => `${i ? "L" : "M"}${px(q.x).toFixed(1)} ${py(q.y).toFixed(1)}`).join(" ");
      const e = s("path", { d: dstr, class: "sim-route" + (r.route.isTarget ? " tgt" : "") });
      const len = pts.slice(1).reduce((a, q, i) => a + Math.hypot(px(q.x) - px(pts[i].x), py(q.y) - py(pts[i].y)), 0);
      e.style.strokeDasharray = len; e.style.strokeDashoffset = len; r.routeEl = e; r.routeLen = len;
      layers.routes.append(e);
    });
    p.players.forEach(d => {
      const gEl = s("g", { class: `simp ${d.side}${d.role === "QB" ? " qb" : ""}${d.role === "OL" ? " ol" : ""}` });
      const c = s("circle", { r: 0.95 * S }), t = s("text", {}); t.textContent = d.label;
      gEl.append(c, t); (d.side === "off" ? layers.off : layers.def).append(gEl); d.el = gEl;
    });
    const sh = s("ellipse", { rx: 6, ry: 3, class: "sim-shadow" }), b = s("g", { class: "sim-ball" }, s("ellipse", { rx: 7.5, ry: 4.6 }), s("path", { d: "M-3.5 0H3.5M-1.4 -2V2M1.4 -2V2", class: "lace" }));
    layers.ball.append(sh, b); p.ballEl = b; p.shadowEl = sh; p.gainEl = gain; p.spotEl = spot; p.spotT = spotT;
  }

  function renderAt(t) {
    if (!plan) return;
    const fade = clamp(t / 500, 0, 1);
    plan.players.forEach(d => {
      const q = posAt(d.kf, t);
      d.el.setAttribute("transform", `translate(${px(q.x).toFixed(1)} ${py(q.y).toFixed(1)})`);
      d.el.style.opacity = fade;
    });
    const showCov = $("simShowCov").checked;
    plan.players.forEach(d => { if (d.zoneEl) { d.zoneEl.style.opacity = showCov ? clamp((t - plan.T_set + 300) / 500, 0, 1) * (t > plan.T_catch + 200 && plan.T_catch ? 0.15 : 1) : 0; } });
    plan.man.forEach(m => {
      const a = posAt(m.d.kf, t), b = posAt(m.r.kf, t);
      m.el.setAttribute("x1", px(a.x)); m.el.setAttribute("y1", py(a.y)); m.el.setAttribute("x2", px(b.x)); m.el.setAttribute("y2", py(b.y));
      m.el.style.opacity = showCov ? clamp((t - plan.T_set) / 500, 0, 1) * 0.9 : 0;
    });
    plan.routes.forEach(r => {
      const f = clamp((t - r.route.t0) / (r.route.t1 - r.route.t0), 0, 1);
      r.routeEl.style.strokeDashoffset = r.routeLen * (1 - f);
      r.routeEl.style.opacity = t >= r.route.t0 ? 1 : 0;
    });
    const bp = plan.bAt(t);
    plan.ballEl.setAttribute("transform", `translate(${px(bp.x).toFixed(1)} ${(py(bp.y) - bp.z * 9).toFixed(1)}) scale(${(1 + bp.z * 0.16).toFixed(2)})`);
    plan.shadowEl.setAttribute("transform", `translate(${px(bp.x).toFixed(1)} ${py(bp.y).toFixed(1)})`);
    plan.shadowEl.style.opacity = bp.z > 0.1 ? 0.35 : 0;
    // avance en el campo y marca final
    const cx = plan.carrier || plan.qb;
    const xNow = plan.res.preview || t < plan.T_snap ? plan.los : (t >= plan.T_end ? plan.finalX : clamp(posAt(cx.kf, t).x, plan.los, 110));
    if (plan.res.outcome === "C" || plan.res.outcome === "R") {
      const xs = Math.min(plan.los, xNow), wdt = Math.abs(xNow - plan.los);
      plan.gainEl.setAttribute("x", px(xs)); plan.gainEl.setAttribute("width", wdt * S);
      plan.gainEl.style.opacity = t > plan.T_catch || plan.res.outcome === "R" ? 0.85 : 0;
    } else plan.gainEl.style.opacity = 0;
    const done = !plan.res.preview && t >= plan.T_end;
    plan.spotEl.style.opacity = done ? 1 : 0;
    plan.spotT.style.opacity = done ? 1 : 0;
    if (done) {
      const y = plan.res.outcome === "I" || plan.res.outcome === "IN" ? 0 : plan.res.yards;
      plan.spotT.textContent = plan.res.outcome === "I" ? "Sin avance" : plan.res.outcome === "IN" ? "Cambio de posesión" : `${y > 0 ? "+" : ""}${y} yd`;
      plan.spotT.setAttribute("x", px(plan.res.outcome === "IN" ? plan.catchPt.x : plan.finalX) + 6);
      plan.spotEl.setAttribute("x1", px(plan.res.outcome === "IN" ? plan.catchPt.x : plan.finalX));
      plan.spotEl.setAttribute("x2", px(plan.res.outcome === "IN" ? plan.catchPt.x : plan.finalX));
    }
    // narración
    let cue = plan.cues[0];
    plan.cues.forEach(c => { if (c.t <= t) cue = c; });
    $("simCaption").textContent = cue.text;
    $("simScrub").value = t;
  }

  /* ---- reproducción ---- */
  function loop(now) {
    if (!anim.playing) return;
    const dt = (now - anim.last) * anim.speed; anim.last = now;
    anim.t = Math.min(plan.T_total, anim.t + dt);
    renderAt(anim.t);
    if (anim.t >= plan.T_total) { pause(); finish(); return; }
    if (!anim.doneShown && anim.t >= plan.T_end) finish();
    anim.raf = requestAnimationFrame(loop);
  }
  function play() {
    if (!plan || plan.res.preview) return;
    if (anim.t >= plan.T_total) { anim.t = 0; anim.doneShown = false; hideResult(); }
    anim.playing = true; anim.last = performance.now();
    $("simPlay").textContent = "❚❚ Pausa"; anim.raf = requestAnimationFrame(loop);
  }
  function pause() { anim.playing = false; cancelAnimationFrame(anim.raf); $("simPlay").textContent = "▶ Reproducir"; }
  function seek(t) { anim.t = t; renderAt(t); if (t < plan.T_end) { anim.doneShown = false; hideResult(); } else finish(); }

  /* ---- resultado ---- */
  const hideResult = () => { $("simResult").hidden = true; };
  function nextSituation(sit, res) {
    const o = res.outcome;
    if (res.td) return { reset: true, text: "Touchdown. Empieza un ataque nuevo desde su yarda 25." };
    if (o === "IN") return { reset: true, text: "La defensa recupera el balón. Empieza un ataque nuevo (en el simulador reiniciamos en la yarda 25)." };
    if (res.safety) return { reset: true, text: "Safety: la defensa anota 2 puntos y recibe el balón." };
    const gain = (o === "C" || o === "R" || o === "S") ? res.yards : 0;
    const toGoal = clamp(sit.toGoal - gain, 1, 99);
    if (gain >= sit.toGo) return { reset: false, down: 1, toGo: Math.min(10, toGoal), toGoal, text: "¡Primer down! Reciben 4 intentos nuevos." };
    if (sit.down === 4) return { reset: true, text: "No lograron el primer down en el 4.º intento: el balón pasa al rival (reiniciamos en la yarda 25)." };
    return { reset: false, down: sit.down + 1, toGo: clamp(sit.toGo - gain, 1, 20), toGoal, text: `Siguiente: ${sit.down + 1}.º intento y ${clamp(sit.toGo - gain, 1, 20)} yardas por recorrer.` };
  }
  function finish() {
    if (anim.doneShown || !plan || plan.res.preview) return;
    anim.doneShown = true;
    const res = plan.res, sit = lastRes.sit, o = res.outcome, nx = nextSituation(sit, res);
    const rows = [
      h("h3", {}, `${OUT_NAME[o]}${res.td ? " · ¡TOUCHDOWN!" : ""}`),
      h("p", {}, resultText({ sit }, res, plan.endNote)),
      h("p", { class: "note" }, `Según el modelo, este resultado tenía una probabilidad del ${(100 * res.prob).toFixed(0)} % ` +
        `(cobertura sorteada: ${res.cov}). La jugada ${res.success ? "cuenta como exitosa" : "no cuenta como exitosa"} para el criterio del paso 6.`),
      h("p", { class: "next" }, nx.text),
      h("div", { class: "btns" },
        h("button", { onclick: () => { applyNext(nx); runPlay(); } }, "Continuar: siguiente jugada ▶"),
        h("button", { class: "ghost", onclick: () => applyNext(nx) }, "Solo actualizar la situación"),
        h("button", { class: "ghost", onclick: () => { anim.t = 0; anim.doneShown = false; hideResult(); play(); } }, "↺ Ver otra vez")),
    ];
    $("simResult").replaceChildren(...rows);
    $("simResult").className = "sim-result " + (res.td || (o === "C" && res.success) ? "good" : o === "IN" || o === "S" ? "bad" : "mid");
    $("simResult").hidden = false;
  }
  function applyNext(nx) {
    hideResult();
    if (nx.reset) { ui.down = 1; ui.q = ui.q; $("simToGo").value = 10; $("simGoal").value = 75; }
    else { ui.down = nx.down; $("simToGo").value = nx.toGo; $("simGoal").value = nx.toGoal; }
    syncTabs(); refresh();
  }

  /* ---- ejecutar ---- */
  function runPlay() {
    pause(); hideResult();
    const sit = readSit(), tm = teams(), rng = mulberry32((Math.random() * 2 ** 31) | 0);
    const res = sampleResult(sit, ui.form, tm.off, tm.dfn, rng);
    lastRes = { sit, tm, res };
    mount(buildPlan({ sit, form: ui.form, off: tm.off, dfn: tm.dfn, res, rng }));
    anim.t = 0; anim.doneShown = false;
    $("simScrub").max = plan.T_total; $("simScrub").disabled = false;
    renderAt(0); play();
    $("simStage").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* ---- vista previa (alineación antes del snap) ---- */
  function preview() {
    pause(); hideResult();
    const sit = readSit(), tm = teams();
    const res = previewResult(sit, tm.dfn);
    lastRes = { sit, tm, res };
    mount(buildPlan({ sit, form: ui.form, off: tm.off, dfn: tm.dfn, res, rng: mulberry32(7) }));
    anim.t = T_SET; anim.doneShown = false;
    $("simScrub").max = plan.T_total; $("simScrub").value = T_SET; $("simScrub").disabled = true;
    renderAt(T_SET);
    $("simCaption").textContent = `Así se alinean antes del snap: ${TEAMS[tm.off].name} con ${FORMATIONS[ui.form].name}${sit.pa ? " (play action)" : ""} frente a ${TEAMS[tm.dfn].name} (${res.pers.dl}-${res.pers.lb}-${res.pers.db}, ${res.cov} como cobertura más probable). Pulsa «Ejecutar jugada».`;
  }

  /* ============================ paneles de datos ============================ */
  const pct = v => (100 * v).toFixed(0) + " %";
  const cmp = (v, lg, goodHigh, unit = "") => {
    const d = v - lg, good = goodHigh ? d >= 0 : d <= 0;
    return h("span", { class: "cmp " + (Math.abs(d) < 0.5 ? "eq" : good ? "up" : "down") }, `${v.toFixed(1)}${unit} (liga ${lg.toFixed(1)}${unit})`);
  };
  function teamCard(prefix, abbr, side) {
    const box = $(prefix + "Stats"); box.replaceChildren();
    const lg = LEAGUE_PROFILE;
    if (side === "off") {
      const o = offProfile(abbr), fav = TEAM_DATA.filter(r => r.team === abbr).sort((a, b) => b.share - a.share)[0];
      box.append(
        h("div", { class: "stat" }, h("b", {}, "Éxito en sus pases: "), cmp(o.success, lg.success, true, " %")),
        h("div", { class: "stat" }, h("b", {}, "Yardas por jugada: "), cmp(o.yards, lg.yards, true)),
        h("div", { class: "stat" }, h("b", {}, "Pases completos: "), cmp(o.comp, lg.comp, true, " %")),
        h("div", { class: "stat" }, h("b", {}, "Capturas recibidas: "), cmp(o.sack, lg.sack, false, " %")),
        h("div", { class: "stat" }, h("b", {}, "Usa play action: "), cmp(o.pa, lg.pa, true, " %")),
        fav ? h("div", { class: "stat" }, h("b", {}, "Formación favorita: "), `${label(fav.formation)} (${fav.share.toFixed(0)} %)`) : "");
    } else {
      const dd = defProfile(abbr), covs = Object.entries(dd.cov).sort((a, b) => b[1] - a[1]).slice(0, 4);
      box.append(
        h("div", { class: "stat" }, h("b", {}, "Éxito que permite: "), cmp(dd.success, lg.success, false, " %")),
        h("div", { class: "stat" }, h("b", {}, "Yardas que permite: "), cmp(dd.yards, lg.yards, false)),
        h("div", { class: "stat" }, h("b", {}, "Capturas que logra: "), cmp(dd.sack, lg.sack, true, " %")),
        h("div", { class: "stat" }, h("b", {}, "Intercepciones: "), cmp(dd.intc, lg.intc, true, " %")),
        h("div", { class: "stat" }, h("b", {}, "Alineación típica: "), dd.pers.length ? `${dd.pers[0][0]}-${dd.pers[0][1]}-${dd.pers[0][2]} (${(100 * dd.pers[0][3]).toFixed(0)} %)` : "—"),
        h("div", { class: "covbars" }, h("b", {}, "Coberturas que más usa:"),
          ...covs.map(([c, v]) => h("div", { class: "covrow" }, h("span", {}, c), h("div", { class: "track" }, h("div", { class: "fill", style: `width:${(100 * v).toFixed(0)}%` })), h("span", { class: "val" }, pct(v))))));
    }
  }

  function renderPrediction() {
    const sit = readSit(), tm = teams();
    const base = predict(sit, ui.form, tm.off, tm.dfn);
    const none = predict(sit, ui.form, tm.off, tm.dfn, { off: false, dfn: false });
    const onlyOff = predict(sit, ui.form, tm.off, tm.dfn, { off: true, dfn: false });
    const effO = 100 * (onlyOff.ok - none.ok), effD = 100 * (base.ok - onlyOff.ok);
    const sign = v => (v >= 0 ? "+" : "") + v.toFixed(1);
    const out = $("simPred"); out.replaceChildren(
      h("div", { class: "bigstat" },
        h("div", {}, h("span", { class: "big" }, pct(base.ok)), h("small", {}, "probabilidad de éxito")),
        h("div", {}, h("span", { class: "big" }, base.yards.toFixed(1)), h("small", {}, "yardas esperadas"))),
      h("p", { class: "note" }, `Efecto de los equipos sobre el éxito, frente a un equipo promedio: ataque de ${TEAMS[tm.off].name} ${sign(effO)} pts, defensa de ${TEAMS[tm.dfn].name} ${sign(effD)} pts.`),
      h("p", { class: "note small" }, "Posibles resultados de la jugada:"));
    const names = { C: "Completo", I: "Incompleto", S: "Sack", IN: "Intercepción", R: "Corre el QB" };
    MODEL_OUTCOMES.forEach((k, i) => out.append(h("div", { class: "crow slim" + (k === "IN" || k === "S" ? " bad" : "") },
      h("div", { class: "name" }, names[k]), h("div", { class: "track" }, h("div", { class: "fill", style: `width:${(100 * base.p[i]).toFixed(1)}%` })), h("div", { class: "val" }, (100 * base.p[i]).toFixed(1) + " %"))));

    // comparación de formaciones
    const cmpBox = $("simCompare"); cmpBox.replaceChildren(h("h3", {}, "Comparación de formaciones en esta situación"));
    const all = MODEL_FORMS.map(f => ({ f, p: predict(sit, f, tm.off, tm.dfn) })).sort((a, b) => b.p.ok - a.p.ok);
    all.forEach((r, i) => cmpBox.append(h("div", { class: "crow" + (i === 0 ? " best" : "") + (r.f === ui.form ? " sel" : "") },
      h("div", { class: "name" }, label(r.f) + (r.f === ui.form ? " ◂" : "")),
      h("div", { class: "track", style: "height:20px" }, h("div", { class: "fill", style: `width:${(100 * r.p.ok).toFixed(1)}%` })),
      h("div", { class: "val" }, pct(r.p.ok)),
      h("div", { class: "meta" }, `${r.p.yards.toFixed(1)} yardas esperadas · ${(100 * r.p.p[0]).toFixed(0)} % completo · ${(100 * r.p.p[2]).toFixed(0)} % sack`))));
    const spread_ = 100 * (all[0].p.ok - all[all.length - 1].p.ok);
    cmpBox.append(h("p", { class: "note" }, spread_ < 4 ? `La diferencia entre la mejor y la peor formación es de solo ${spread_.toFixed(1)} puntos: aquí la formación casi no cambia el resultado.` : `La mejor formación supera a la peor por ${spread_.toFixed(1)} puntos de éxito.`));

    // jugadas reales parecidas
    const near = (dy, dg) => MODEL_PLAYS.filter(p => p[0] === sit.down && Math.abs(p[1] - sit.toGo) <= dy && Math.abs(p[2] - sit.toGoal) <= dg);
    let sim = near(2, 15), wide = false;
    if (sim.length < 30) { sim = near(4, 30); wide = true; }
    const box = $("simNear"); box.replaceChildren(h("h3", {}, "¿Y qué pasó en la vida real?"));
    if (!sim.length) box.append(h("p", {}, "No hay jugadas parecidas en los datos."));
    else {
      const ok = 100 * sim.reduce((a, p) => a + p[7], 0) / sim.length, yd = sim.reduce((a, p) => a + p[8], 0) / sim.length;
      const comp = 100 * sim.filter(p => p[9] === 0).length / sim.length, sack = 100 * sim.filter(p => p[9] === 2).length / sim.length;
      box.append(h("p", {}, `En ${sim.length} jugadas reales de ${sit.down}.º intento con ${wide ? "entre " + Math.max(1, sit.toGo - 4) + " y " + (sit.toGo + 4) : "casi " + sit.toGo} yardas por recorrer y posición parecida: ` +
        `${ok.toFixed(0)} % de éxito, ${yd.toFixed(1)} yardas por jugada, ${comp.toFixed(0)} % de pases completos y ${sack.toFixed(0)} % de sacks.` + (sim.length < 30 ? " Son pocas jugadas: tómalo con cautela." : "")));
    }
    const R = MODEL_REPORT, helps = R.ok.teams.logloss < R.ok.extra.logloss - 0.002;
    $("simNote").textContent =
      `Qué tan confiable es: el modelo se entrenó con las semanas 1 a 6 y se probó con las semanas 7 y 8 (${R.test} jugadas que no había visto). ` +
      `Para «éxito» logra un AUC de ${R.ok.teams.auc} (0.5 es adivinar y 1 es acertar siempre). ` +
      `${helps ? "Conocer a los equipos mejora un poco la predicción" : "Conocer a los equipos casi no mejora la predicción"}: el efecto de cada equipo se reduce a propósito para no dar de más a muestras pequeñas (solo 8 semanas). ` +
      `El azar pesa mucho en una jugada. Son probabilidades, no promesas. Solo hay jugadas de pase de 2021 (no hay corridas del corredor). ` +
      `El camino de cada jugador en la animación es ilustrativo: los datos fijan el resultado (tipo de jugada, yardas, cobertura y alineación defensiva), no los movimientos.`;
  }

  /* ---- simular muchas jugadas ---- */
  function runBatch() {
    const sit = readSit(), tm = teams(), N = 300, rng = mulberry32((Math.random() * 2 ** 31) | 0);
    const cnt = { C: 0, I: 0, S: 0, IN: 0, R: 0 }, bins = [0, 0, 0, 0, 0, 0]; let ok = 0, ys = 0, td = 0, fd = 0;
    for (let i = 0; i < N; i++) {
      const r = sampleResult(sit, ui.form, tm.off, tm.dfn, rng);
      cnt[r.outcome]++; ok += r.success; ys += r.yards; td += r.td; fd += r.td || r.yards >= sit.toGo;
      const y = r.yards; bins[y < -4 ? 0 : y <= 0 ? 1 : y <= 4 ? 2 : y <= 9 ? 3 : y <= 19 ? 4 : 5]++;
    }
    const labs = ["−5 o menos", "−4 a 0", "1 a 4", "5 a 9", "10 a 19", "20 o más"];
    const box = $("simBatch"); box.hidden = false;
    box.replaceChildren(h("h3", {}, `Resultado de ${N} jugadas simuladas`),
      h("p", {}, `Éxito: ${(100 * ok / N).toFixed(0)} % · primer down o touchdown: ${(100 * fd / N).toFixed(0)} % · touchdowns: ${(100 * td / N).toFixed(1)} % · promedio: ${(ys / N).toFixed(1)} yardas.`),
      h("p", { class: "note" }, `Completos ${cnt.C} · incompletos ${cnt.I} · sacks ${cnt.S} · intercepciones ${cnt.IN} · corridas del QB ${cnt.R}`),
      ...bins.map((b, i) => h("div", { class: "crow slim" }, h("div", { class: "name" }, labs[i] + " yd"), h("div", { class: "track" }, h("div", { class: "fill", style: `width:${(100 * b / N).toFixed(1)}%` })), h("div", { class: "val" }, (100 * b / N).toFixed(0) + " %"))));
  }

  /* ============================ controles ============================ */
  let tabsOf = {};
  const syncTabs = () => { [["simDown", ui.down], ["simQ", ui.q]].forEach(([id, v]) => [...$(id).children].forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.key) === v)))); };
  function refresh() {
    const sit = readSit(), tm = teams();
    $("simToGoV").textContent = sit.toGo === sit.toGoal ? `${sit.toGo} yd (a la zona de anotación)` : `${sit.toGo} yd`;
    $("simGoalV").textContent = sit.toGoal > 50 ? `tu yarda ${100 - sit.toGoal} (${sit.toGoal} yd para anotar)` : `yarda ${sit.toGoal} del rival (${sit.toGoal} yd para anotar)`;
    $("simDiffV").textContent = sit.diff === 0 ? "empatado" : sit.diff > 0 ? `ganas por ${sit.diff}` : `pierdes por ${-sit.diff}`;
    $("simLate").disabled = !(ui.q === 2 || ui.q === 4);
    $("simOffLogo").src = logoSrc(tm.off); $("simOffLogo").alt = `Logo de ${TEAMS[tm.off].name}`;
    $("simDefLogo").src = logoSrc(tm.dfn); $("simDefLogo").alt = `Logo de ${TEAMS[tm.dfn].name}`;
    $("simHud").textContent = `${sit.down}.º y ${sit.toGo === sit.toGoal ? "gol" : sit.toGo} · ${sit.toGoal > 50 ? "en su propia yarda " + (100 - sit.toGoal) : "en la yarda " + sit.toGoal + " rival"} · ${ui.q}.º cuarto`;
    teamCard("simOff", tm.off, "off"); teamCard("simDef", tm.dfn, "def");
    renderPrediction(); $("simBatch").hidden = true; preview();
  }

  function init() {
    const names = Object.entries(TEAMS).sort((a, b) => a[1].name.localeCompare(b[1].name));
    names.forEach(([abbr, t]) => { $("simOff").append(h("option", { value: abbr }, t.name)); $("simDef").append(h("option", { value: abbr }, t.name)); });
    $("simOff").value = selectedTeam;
    $("simDef").value = selectedTeam === "BUF" ? "KC" : "BUF";
    $("simOff").onchange = () => { if ($("simOff").value === $("simDef").value) $("simDef").value = $("simOff").value === "BUF" ? "KC" : "BUF"; setTeam($("simOff").value); };
    $("simDef").onchange = () => { if ($("simOff").value === $("simDef").value) { $("simDef").value = $("simDef").value === "BUF" ? "KC" : "BUF"; } refresh(); };
    teamListeners.push(() => { if ($("simOff").value !== selectedTeam) { $("simOff").value = selectedTeam; if ($("simDef").value === selectedTeam) $("simDef").value = selectedTeam === "BUF" ? "KC" : "BUF"; } refresh(); });

    tabsOf.form = tabGroup($("simForm"), MODEL_FORMS.map(k => ({ key: k, label: FORMATIONS[k].name })), ui.form, k => { ui.form = k; refresh(); });
    tabGroup($("simType"), [{ key: "n", label: "Pase normal" }, { key: "pa", label: "Play action" }], "n", k => { ui.pa = k === "pa"; refresh(); });
    tabGroup($("simDown"), [1, 2, 3, 4].map(k => ({ key: k, label: k + ".º" })), ui.down, k => { ui.down = Number(k); refresh(); });
    tabGroup($("simQ"), [1, 2, 3, 4].map(k => ({ key: k, label: k + ".º" })), ui.q, k => { ui.q = Number(k); refresh(); });
    [...$("simDown").children].forEach((b, i) => { b.dataset.key = i + 1; }); [...$("simQ").children].forEach((b, i) => { b.dataset.key = i + 1; });
    ["simToGo", "simGoal", "simDiff", "simLate"].forEach(id => $(id).addEventListener("input", refresh));
    $("simShowCov").addEventListener("change", () => renderAt(anim.t));
    $("simRun").onclick = runPlay;
    $("simBatchBtn").onclick = runBatch;
    $("simPlay").onclick = () => { if (anim.playing) pause(); else if (plan && !plan.res.preview) play(); else runPlay(); };
    $("simSpeed").onchange = e => { anim.speed = Number(e.target.value); };
    $("simScrub").addEventListener("input", e => { pause(); seek(Number(e.target.value)); });
    refresh();
  }
  init();
})();
