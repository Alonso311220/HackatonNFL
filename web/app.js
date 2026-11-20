"use strict";

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  kids.flat().forEach(c => e.append(c));
  return e;
}
const SVGNS = "http://www.w3.org/2000/svg";
function s(tag, props = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(props)) e.setAttribute(k, v);
  kids.flat().forEach(c => e.append(c));
  return e;
}
function tabGroup(container, items, initial, onPick) {
  // items: [{key,label}]. Crea botones con aria-pressed.
  container.replaceChildren();
  const btns = items.map(it => {
    const b = h("button", { "aria-pressed": String(it.key === initial), onclick: () => {
      btns.forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      onPick(it.key);
    } }, it.label);
    container.append(b);
    return b;
  });
  return btns;
}

/* ---------- datos de apoyo ---------- */
const ROLES = {
  QB: { name: "Quarterback (QB)", side: "Ataque", count: "1", desc: "El líder del ataque. Recibe el balón del centro y decide si lo lanza, lo entrega a un corredor o corre con él. Es la posición más famosa." },
  RB: { name: "Corredor (RB)", side: "Ataque", count: "0 a 2", desc: "Recibe el balón del quarterback para correr con él. También bloquea y a veces recibe pases cortos." },
  FB: { name: "Fullback (FB)", side: "Ataque", count: "0 a 1", desc: "Un corredor grande cuyo trabajo principal es bloquear para abrirle camino al corredor principal." },
  WR: { name: "Receptor abierto (WR)", side: "Ataque", count: "2 a 5", desc: "Se coloca cerca de las bandas y corre rutas para recibir pases. Suelen ser los más rápidos del equipo." },
  TE: { name: "Ala cerrada (TE)", side: "Ataque", count: "0 a 3", desc: "Híbrido: bloquea como un liniero y también corre rutas para recibir pases. Se coloca pegado a la línea ofensiva." },
  OL: { name: "Línea ofensiva (OL)", side: "Ataque", count: "5", desc: "Cinco jugadores grandes: un centro (C), que pasa el balón, dos guardias (G) y dos tackles (T). Protegen al quarterback y abren espacios para correr. Casi nunca tocan el balón." },
  DL: { name: "Línea defensiva (DL)", side: "Defensa", count: "3 a 4", desc: "Se alinea frente a la línea ofensiva. Intenta tumbar al quarterback (capturarlo es un sack) y frenar las corridas." },
  LB: { name: "Linebacker (LB)", side: "Defensa", count: "2 a 4", desc: "Jugador versátil detrás de la línea defensiva. Frena corredores, presiona al quarterback y cubre a receptores cercanos." },
  CB: { name: "Esquinero (CB)", side: "Defensa", count: "2 a 3", desc: "Cubre a los receptores abiertos e intenta romper o interceptar pases. Necesita velocidad." },
  S: { name: "Safety (S)", side: "Defensa", count: "2", desc: "La última línea de defensa. Se coloca lejos del balón para evitar jugadas largas y ayuda a cubrir y a tacklear." },
  K: { name: "Pateador (K)", side: "Equipos especiales", count: "1", desc: "Patea el balón en goles de campo (3 puntos), puntos extra y patadas de salida." },
  P: { name: "Despejador (P)", side: "Equipos especiales", count: "1", desc: "En 4.º down, cuando el ataque no quiere arriesgarse, patea el balón lejos para dejar al rival atrás en el campo." },
  LS: { name: "Long snapper (LS)", side: "Equipos especiales", count: "1", desc: "Especialista que pasa el balón hacia atrás con precisión al pateador o al despejador." },
  RET: { name: "Retornador (KR/PR)", side: "Equipos especiales", count: "1 a 2", desc: "Recibe las patadas del rival e intenta devolverlas lo más lejos posible." },
};

const FORMATIONS = {
  SHOTGUN: {
    name: "Shotgun", personnel: "1 corredor, 1 ala cerrada, 3 receptores", def: "nickel",
    text: "El quarterback se coloca unos 5 yardas atrás del centro. Así ve mejor la defensa y tiene más tiempo para lanzar. Es la formación más común de la liga.",
    players: [["QB", "QB", 50, 36], ["RB", "RB", 57, 36], ["TE", "TE", 66, 29.5], ["WR", "WR", 10, 29.5], ["WR", "WR", 90, 29.5], ["WR", "WR", 77, 31.5]],
  },
  EMPTY: {
    name: "Empty", personnel: "0 corredores, 1 ala cerrada, 4 receptores", def: "nickel",
    text: "Nadie acompaña al quarterback en el backfield (la zona detrás de la línea). Hay cinco posibles receptores, y la defensa tiene que cubrirlos a todos.",
    players: [["QB", "QB", 50, 36], ["TE", "TE", 66, 29.5], ["WR", "WR", 8, 29.5], ["WR", "WR", 22, 31.5], ["WR", "WR", 92, 29.5], ["WR", "WR", 78, 31.5]],
  },
  SINGLEBACK: {
    name: "Singleback", personnel: "1 corredor, 1 ala cerrada, 3 receptores", def: "base",
    text: "El quarterback está pegado al centro y un solo corredor se coloca detrás. Permite tanto correr como pasar sin que la defensa lo sepa de antemano.",
    players: [["QB", "QB", 50, 31.5], ["RB", "RB", 50, 38], ["TE", "TE", 66, 29.5], ["WR", "WR", 10, 29.5], ["WR", "WR", 90, 29.5], ["WR", "WR", 77, 31.5]],
  },
  I_FORM: {
    name: "I-Form", personnel: "1 corredor, 1 fullback, 1 ala cerrada, 2 receptores", def: "base",
    text: "Quarterback, fullback y corredor quedan en fila, como una letra I. Es la formación clásica para correr: el fullback bloquea por delante del corredor.",
    players: [["QB", "QB", 50, 31.5], ["FB", "FB", 50, 35.5], ["RB", "RB", 50, 40], ["TE", "TE", 66, 29.5], ["WR", "WR", 10, 29.5], ["WR", "WR", 90, 29.5]],
  },
  PISTOL: {
    name: "Pistol", personnel: "1 corredor, 1 ala cerrada, 3 receptores", def: "base",
    text: "Mezcla entre Shotgun y Singleback. El quarterback está a media distancia (unas 4 yardas) y el corredor justo detrás de él. Combina la visión del Shotgun con la fuerza de correr de frente.",
    players: [["QB", "QB", 50, 34.5], ["RB", "RB", 50, 40], ["TE", "TE", 66, 29.5], ["WR", "WR", 10, 29.5], ["WR", "WR", 90, 29.5], ["WR", "WR", 77, 31.5]],
  },
  JUMBO: {
    name: "Jumbo", personnel: "1 corredor, 1 fullback, 3 alas cerradas", def: "base",
    text: "Muchos jugadores grandes para bloquear, con tres alas cerradas. Se usa sobre todo cerca de la zona de anotación, cuando hace falta empujar unas pocas yardas.",
    players: [["QB", "QB", 50, 31.5], ["FB", "FB", 50, 35.5], ["RB", "RB", 50, 40], ["TE", "TE", 66, 29.5], ["TE", "TE", 34, 29.5], ["TE", "TE", 72, 31.5]],
  },
};
const OFF_LINE = [["OL", "T", 40, 29.5], ["OL", "G", 45, 29.5], ["OL", "C", 50, 29.5], ["OL", "G", 55, 29.5], ["OL", "T", 60, 29.5]];
const DEF_LINE = [["DL", "DL", 41, 26.5], ["DL", "DL", 47, 26.5], ["DL", "DL", 53, 26.5], ["DL", "DL", 59, 26.5]];
const DEF_BACK = {
  base: [["LB", "LB", 36, 21], ["LB", "LB", 50, 21], ["LB", "LB", 64, 21], ["CB", "CB", 10, 26], ["CB", "CB", 90, 26], ["S", "S", 38, 12], ["S", "S", 62, 12]],
  nickel: [["LB", "LB", 44, 21], ["LB", "LB", 56, 21], ["CB", "CB", 10, 26], ["CB", "CB", 90, 26], ["CB", "CB", 77, 26], ["S", "S", 38, 12], ["S", "S", 62, 12]],
};
const FORM_KEYS = Object.keys(FORMATIONS);
const TEAM_MIN = 20;
const PNG_LOGOS = new Set(["DET", "LA", "SF", "TEN"]);
const logoSrc = abbr => `Resources/Logos/${abbr}.${PNG_LOGOS.has(abbr) ? "png" : "gif"}`;
const teamLogo = (abbr, cls = "team-logo") => h("img", {
  class: cls,
  src: logoSrc(abbr),
  alt: "",
  loading: "lazy",
  decoding: "async",
  width: "50",
  height: "37",
});
const label = f => (FORMATIONS[f] || { name: f }).name;

/* ---------- estado compartido ---------- */
let selectedTeam = "KC";
const teamListeners = [];
function setTeam(abbr) { selectedTeam = abbr; teamListeners.forEach(fn => fn()); }

/* ---------- paso 1: downs y puntos ---------- */
(function steps1() {
  // Campo propio (viewBox 504x280): 10 yd de zona de anotación + 100 yd de juego + 10 yd de zona de anotación.
  // 4.2 px por yarda; la cancha mide 53.3 yd de ancho (224 px).
  const PX = 4.2, EZ = 10 * PX, X0 = EZ, XR = X0 + 100 * PX, W = XR + EZ;
  const YT = 28, YB = 252, YM = (YT + YB) / 2;
  const xAt = yd => X0 + yd * PX;              // yd: 0 = propia línea de gol, 100 = línea de gol rival
  const START = 25;
  const state = { ball: START, start: START, down: 1, phase: "drive", extraDone: false };
  const toGo = () => Math.max(0, Math.min(100, state.start + 10) - state.ball);

  /* intentos: cuatro casillas simples + barra de yardas */
  const attempts = $("attempts");
  const drawAttempts = () => {
    attempts.replaceChildren();
    for (let i = 1; i <= 4; i++) {
      const cls = state.phase !== "drive" ? "used" : i < state.down ? "used" : i === state.down ? "cur" : "";
      attempts.append(h("li", { class: cls, ...(i === state.down && state.phase === "drive" ? { "aria-current": "step" } : {}) }, `${i}.º`));
    }
    const gained = Math.max(0, Math.min(10, state.ball - state.start));
    $("gainFill").style.width = (state.phase === "drive" ? gained * 10 : 100) + "%";
    $("gainText").textContent = state.phase === "drive"
      ? `Llevas ${gained} de 10 yardas para el primer down.` : "Llegaste a la zona de anotación.";
  };

  /* campo: zona de anotación, líneas, números, marcas, postes y áreas explicables */
  const fld = $("driveField");
  const area = (key, ...kids) => s("g", { class: `area a-${key}` }, ...kids);
  const ln = (x1, y1, x2, y2, cls) => s("line", { x1, y1, x2, y2, class: cls });
  const tx = (x, y, str, cls, extra = {}) => { const e = s("text", { x, y, class: cls, ...extra }); e.textContent = str; return e; };

  // césped con franjas cada 10 yardas
  for (let k = 0; k < 10; k += 2) fld.append(s("rect", { x: xAt(k * 10), y: YT, width: 10 * PX, height: YB - YT, class: "stripe" }));

  const ezOwn = s("rect", { x: 0, y: YT, width: EZ, height: YB - YT, class: "ez own" });
  const ezRival = s("rect", { x: XR, y: YT, width: EZ, height: YB - YT, class: "ez rival" });
  fld.append(area("endzone", ezOwn, ezRival,
    tx(EZ / 2, YM, "TU ZONA DE ANOTACIÓN", "ftxt", { transform: `rotate(-90 ${EZ / 2} ${YM})` }),
    tx(XR + EZ / 2, YM, "ZONA DE ANOTACIÓN RIVAL", "ftxt", { transform: `rotate(90 ${XR + EZ / 2} ${YM})` })));

  fld.append(area("red", s("rect", { x: xAt(80), y: YT, width: 20 * PX, height: YB - YT, class: "redZ" }),
    tx(xAt(90), YT + 14, "ZONA ROJA", "ftxt")));

  const yardLines = [], nums = [];
  for (let yd = 5; yd < 100; yd += 5) {
    yardLines.push(ln(xAt(yd), YT, xAt(yd), YB, "fline" + (yd % 10 === 0 ? " ten" : "")));
    if (yd % 10 === 0 && yd !== 50) {
      const n = String(yd < 50 ? yd : 100 - yd);
      nums.push(tx(xAt(yd), YT + 46, n, "yn"), tx(xAt(yd), YB - 46, n, "yn"));
    }
  }
  fld.append(area("yards", ...yardLines, ...nums));

  const hashes = [];
  for (let yd = 1; yd < 100; yd++) {
    if (yd % 5 === 0) continue;
    [YM - 49, YM + 49].forEach(y => hashes.push(ln(xAt(yd), y - 3, xAt(yd), y + 3, "hashT")));
    hashes.push(ln(xAt(yd), YT, xAt(yd), YT + 5, "hashT"), ln(xAt(yd), YB - 5, xAt(yd), YB, "hashT"));
  }
  fld.append(area("hash", ...hashes));

  fld.append(area("mid", ln(xAt(50), YT, xAt(50), YB, "goalL"), s("circle", { cx: xAt(50), cy: YM, r: 26, class: "midLogo" }),
    tx(xAt(50), YM, "50", "ftxt big"), tx(xAt(50), YT + 14, "MEDIO CAMPO", "ftxt")));
  fld.append(area("goal", ln(X0, YT, X0, YB, "goalL"), ln(XR, YT, XR, YB, "goalL")));
  fld.append(area("terr", tx(xAt(25), YB - 14, "TU CAMPO", "ftxt"), tx(xAt(75), YB - 14, "CAMPO RIVAL", "ftxt")));
  fld.append(area("side", s("rect", { x: 1.5, y: YT, width: W - 3, height: YB - YT, class: "side" })));
  // poste visto desde arriba: base en el fondo de la zona de anotación y travesaño hacia adentro
  const post = x => { const d = x < 10 ? 1 : -1;
    return s("path", { d: `M${x} ${YM} h${d * 8} M${x + d * 8} ${YM - 14} v28`, class: "post" }); };
  fld.append(area("posts", post(W - 2), post(2)));

  // elementos del juego, siempre por encima
  const band = s("rect", { y: YT, height: YB - YT, class: "band" });
  const gainLine = s("line", { y1: YT, y2: YB, class: "gainLine" });
  const scrLine = s("line", { y1: YT, y2: YB, class: "scrLine" });
  const gainT = tx(0, 15, "META: 1.er down", "lblY");
  const scrT = tx(0, 272, "Inicio", "lblB");
  const ball = s("g", { class: "ball" }, s("ellipse", { rx: 11, ry: 6.5 }), s("path", { d: "M-5 0H5M-2 -2.5V2.5M2 -2.5V2.5", class: "lace" }));
  const pop = s("text", { class: "pop", y: YM - 24 });
  fld.append(band, scrLine, gainLine, gainT, scrT, ball, pop);

  const drawField = () => {
    const xs = xAt(state.start), xb = xAt(Math.min(state.ball, 100)), xg = xAt(Math.min(state.start + 10, 100));
    band.setAttribute("x", xs); band.setAttribute("width", Math.max(0, xb - xs));
    scrLine.setAttribute("x1", xs); scrLine.setAttribute("x2", xs);
    gainLine.setAttribute("x1", xg); gainLine.setAttribute("x2", xg);
    gainT.setAttribute("x", Math.max(60, Math.min(xg, W - 60))); scrT.setAttribute("x", Math.max(30, Math.min(xs, W - 30)));
    ball.style.transform = `translate(${xb}px, ${YM}px)`;
    ezRival.classList.toggle("on", state.phase === "td");
  };

  // explicación de cada área del campo
  const ZONES = {
    endzone: ["Zonas de anotación", "Las dos franjas de los extremos (10 yardas cada una). Si llevas el balón hasta la zona rival, es touchdown: 6 puntos."],
    goal: ["Línea de gol", "Es el borde entre el campo y la zona de anotación. Con el balón sobre o más allá de esta línea, el ataque anota."],
    yards: ["Líneas de yarda", "Una línea cada 5 yardas, y los números cada 10. Cuentan hacia el centro: 10, 20, 30, 40 y 50 en medio. Sirven para medir las 10 yardas de cada primer down."],
    hash: ["Marcas pequeñas (hash marks)", "Rayitas cada yarda. Las dos filas centrales indican dónde se coloca el balón al empezar cada jugada, según dónde terminó la anterior."],
    mid: ["Medio campo", "La línea de 50 yardas. Divide el campo en dos mitades: del lado de uno estás cerca de tu zona, del otro cerca de la rival."],
    red: ["Zona roja", "Las últimas 20 yardas antes de la zona de anotación rival. Se llama así porque ahí anotar es más probable y la defensa aprieta más."],
    side: ["Bandas laterales", "Los bordes largos del campo. Si el jugador con el balón las pisa, queda fuera y el reloj se detiene."],
    posts: ["Postes de gol", "En el fondo de cada zona de anotación. Para un gol de campo (3 puntos) o un punto extra, el pateador debe pasar el balón entre los postes y por encima del travesaño."],
    terr: ["Campo propio y campo rival", "La mitad que defiendes (a tu izquierda) y la mitad del rival (a tu derecha). Cuanto más lejos de tu zona, más cerca estás de anotar."],
  };
  const zoneTabs = $("zoneTabs");
  const setZone = key => {
    const on = fld.dataset.focus !== key;
    if (on) fld.dataset.focus = key; else fld.removeAttribute("data-focus");
    [...zoneTabs.children].forEach(b => b.setAttribute("aria-pressed", String(on && b.dataset.key === key)));
    $("zoneInfo").textContent = on ? `${ZONES[key][0]}. ${ZONES[key][1]}` : "Toca una zona para saber qué es.";
  };
  Object.entries(ZONES).forEach(([k, [name]]) =>
    zoneTabs.append(h("button", { "data-key": k, "aria-pressed": "false", onclick: () => setZone(k) }, name)));

  const flash = (txt) => { pop.textContent = txt; pop.setAttribute("x", xAt(Math.min(state.ball, 100)) - 10);
    pop.classList.remove("go"); void pop.getBoundingClientRect(); pop.classList.add("go"); };

  /* puntos: dependen de dónde esté el balón */
  let total = 0;
  const sBtns = {};
  const updateScoreBtns = () => {
    const dist = 100 - state.ball + 17; // yardas del gol de campo (incluye fondo de la zona + 7 de snap)
    sBtns.td.disabled = state.phase !== "td";
    sBtns.xp.disabled = sBtns.two.disabled = state.phase !== "after";
    sBtns.fg.disabled = state.phase !== "drive" || dist > 55;
    sBtns.fg.title = sBtns.fg.disabled && state.phase === "drive" ? `Muy lejos (${dist} yd): el pateador no llega` : "";
  };
  const msg = t => { $("downMsg").textContent = t; };
  const smsg = t => { $("scoreMsg").textContent = t; };
  const refresh = () => { drawAttempts(); drawField(); updateScoreBtns(); $("downStatus").textContent = state.phase === "drive"
    ? `Intento ${state.down} de 4 · faltan ${toGo()} yardas para el primer down` : "¡Balón en la zona de anotación!"; };
  const newDrive = () => { Object.assign(state, { ball: START, start: START, down: 1, phase: "drive" }); };
  const score = (pts, txt, next) => { total += pts; $("scoreTotal").textContent = total; smsg(txt); flash("+" + pts); next(); refresh(); };

  const play = yards => {
    if (state.phase !== "drive") { msg("Llegaste a la zona de anotación: ahora suma los puntos en el marcador de abajo."); return; }
    state.ball = Math.max(1, Math.min(100, state.ball + yards));
    const gained = state.ball - state.start;
    if (state.ball >= 100) {
      state.phase = "td"; msg("¡Cruzaste la línea de gol! Ahora sí puedes anotar: toca «Touchdown +6» abajo.");
    } else if (gained >= 10) {
      state.start = state.ball; state.down = 1;
      msg(`¡Primer down! Avanzaron ${yards} yardas, la meta se mueve 10 yardas más adelante y reciben 4 intentos nuevos.`);
    } else if (state.down === 4) {
      msg("Se acabaron los intentos sin lograr las 10 yardas: el balón pasa al otro equipo. (Empezamos un ataque nuevo.)");
      newDrive();
    } else {
      state.down++;
      msg(yards > 0 ? `Ganaron ${yards} yardas, pero aún no llegan a la meta.` : yards < 0 ? `Perdieron ${-yards} yardas.` : "Sin avance.");
    }
    refresh();
  };
  [["Pase incompleto (0 yd)", 0], ["Corrida corta (+3 yd)", 3], ["Pase largo (+12 yd)", 12], ["Pase profundo (+35 yd)", 35], ["Captura al QB (−7 yd)", -7]]
    .forEach(([t, y]) => $("downBtns").append(h("button", { onclick: () => play(y) }, t)));

  const mkScore = (key, t, fn) => { sBtns[key] = h("button", { onclick: fn }, t); $("scoreBtns").append(sBtns[key]); };
  mkScore("td", "Touchdown +6 (llegar a la zona)", () => score(6, "Touchdown: 6 puntos. Ahora elige el intento extra.", () => { state.phase = "after"; }));
  mkScore("xp", "Punto extra +1 (patada)", () => score(1, "Patada al poste: 1 punto. Nuevo ataque.", newDrive));
  mkScore("two", "Conversión de 2 +2 (correr/pasar)", () => score(2, "Conversión de 2 puntos. Nuevo ataque.", newDrive));
  mkScore("fg", "Gol de campo +3 (desde ≤ 55 yd)", () => score(3, "Gol de campo: 3 puntos. Nuevo ataque.", newDrive));
  mkScore("sf", "Safety +2 (defensa)", () => { total += 2; $("scoreTotal").textContent = total;
    smsg("Safety: la defensa tumbó al rival en su propia zona de anotación. 2 puntos para la defensa."); });
  $("scoreReset").onclick = () => { total = 0; $("scoreTotal").textContent = 0; smsg(""); newDrive(); msg(""); refresh(); };
  refresh();
})();

/* ---------- paso 2: tiempo ---------- */
(function step2() {
  const parts = [
    { key: "q1", label: "1.er cuarto", min: 15, cls: "", text: "15 minutos de reloj. Al terminar, los equipos cambian de lado del campo, pero conservan el balón y el intento en que iban." },
    { key: "q2", label: "2.º cuarto", min: 15, cls: "", text: "Cierra la primera mitad. Cuando quedan 2 minutos, el reloj se detiene (aviso de los 2 minutos). Los equipos aceleran para anotar antes del descanso." },
    { key: "ht", label: "Descanso", min: 12, cls: "half", text: "Unos 12 minutos en el vestuario. Cada equipo recupera sus 3 tiempos fuera para la segunda mitad. En el Super Bowl, el descanso es más largo por el show musical." },
    { key: "q3", label: "3.er cuarto", min: 15, cls: "", text: "Empieza la segunda mitad con una nueva patada inicial. Al terminar, de nuevo cambian de lado." },
    { key: "q4", label: "4.º cuarto", min: 15, cls: "", text: "Aquí se deciden muchos partidos. Los equipos que van perdiendo suelen lanzar más, porque pasar detiene el reloj con más frecuencia que correr." },
    { key: "ot", label: "Tiempo extra", min: 10, cls: "ot", text: "Si hay empate al final, se juega un periodo extra de 10 minutos (en temporada regular, puede terminar en empate). En playoffs se juega hasta que haya un ganador." },
  ];
  const tl = $("timeline"), info = $("timeInfo");
  const show = p => {
    [...tl.children].forEach(b => b.setAttribute("aria-pressed", String(b.dataset.key === p.key)));
    info.replaceChildren(h("h3", {}, `${p.label} · ${p.min} min`), h("p", {}, p.text));
  };
  parts.forEach(p => {
    const b = h("button", { class: p.cls, "data-key": p.key, "aria-pressed": "false", style: `flex:${p.min}`, onclick: () => show(p) },
      p.label, h("small", {}, p.min + " min"));
    tl.append(b);
  });
  show(parts[0]);
})();

/* ---------- paso 3: equipos ---------- */
(function step3() {
  let conf = "AFC";
  const tabs = $("confTabs"), box = $("divisions");
  const draw = () => {
    box.replaceChildren();
    ["Este", "Norte", "Sur", "Oeste"].forEach(div => {
      const col = h("div", { class: "division" }, h("h3", {}, `${conf} ${div}`));
      Object.entries(TEAMS).filter(([, t]) => t.conf === conf && t.div === div).forEach(([abbr, t]) => {
        col.append(h("button", { class: "chip", "aria-pressed": String(abbr === selectedTeam), onclick: () => setTeam(abbr) },
          teamLogo(abbr), h("span", {}, t.name)));
      });
      box.append(col);
    });
  };
  tabGroup(tabs, [{ key: "AFC", label: "AFC" }, { key: "NFC", label: "NFC" }], conf, k => { conf = k; draw(); });
  teamListeners.push(() => {
    // si el equipo elegido es de la otra conferencia, mostrar esa
    const c = TEAMS[selectedTeam].conf;
    if (c !== conf) {
      conf = c;
      [...tabs.children].forEach(b => b.setAttribute("aria-pressed", String(b.textContent === conf)));
    }
    draw();
  });
  draw();
})();

/* ---------- paso 4: roles ---------- */
(function step4() {
  const groups = ["Ataque", "Defensa", "Equipos especiales"];
  const list = $("roleList");
  const draw = g => {
    list.replaceChildren();
    Object.values(ROLES).filter(r => r.side === g).forEach(r => {
      list.append(h("details", {}, h("summary", {}, r.name, h("small", {}, `en el campo: ${r.count}`)), h("p", {}, r.desc)));
    });
  };
  tabGroup($("roleTabs"), groups.map(g => ({ key: g, label: g })), "Ataque", draw);
  draw("Ataque");
})();

/* ---------- paso 5: laboratorio de formaciones ---------- */
(function step5() {
  const svg = $("field");
  const VBW = 100, VBH = 56, R = 2.6;

  // cancha
  svg.append(s("rect", { x: 0, y: 0, width: VBW, height: VBH, fill: "#1d6b3a" }));
  for (let y = 0; y < VBH; y += 10) svg.append(s("rect", { x: 0, y, width: VBW, height: 5, fill: "#1a6235" }));
  for (let y = 5; y < VBH; y += 5) svg.append(s("line", { x1: 0, x2: VBW, y1: y, y2: y, stroke: "#fff", "stroke-opacity": ".25", "stroke-width": ".25" }));
  svg.append(s("line", { x1: 0, x2: VBW, y1: 28, y2: 28, stroke: "#6fb1ff", "stroke-width": ".5", "stroke-dasharray": "1.5 1" }));
  const t = (x, y, txt, anchor = "start") => { const e = s("text", { x, y, fill: "#cfe3ff", "font-size": "2", "text-anchor": anchor }); e.textContent = txt; return e; };
  svg.append(t(1.5, 27, "Línea de golpeo (donde empieza la jugada)"));
  svg.append(t(1.5, 54, "↑ El ataque avanza hacia arriba"));

  const defG = s("g", { id: "defG" }), offG = s("g", { id: "offG" });
  svg.append(defG, offG);

  const mk = (parent, side) => {
    const g = s("g", { class: "player " + side, tabindex: "0", role: "button" });
    g.append(s("circle", { r: R }), s("text", {}));
    parent.append(g);
    return { g, x: 0, y: 0, role: "", orig: [0, 0] };
  };
  const off = Array.from({ length: 11 }, () => mk(offG, "off"));
  const def = Array.from({ length: 11 }, () => mk(defG, "def"));
  let selected = null;

  const place = (p, x, y) => {
    p.x = Math.min(VBW - R, Math.max(R, x));
    p.y = Math.min(VBH - R, Math.max(R, y));
    p.g.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };
  const describe = p => {
    const r = ROLES[p.role];
    $("playerInfo").textContent = `${r.name} · ${r.side}. ${r.desc}`;
    if (selected) selected.g.classList.remove("sel");
    selected = p; p.g.classList.add("sel");
  };
  const assign = (p, [role, txt, x, y], side) => {
    p.role = role; p.orig = [x, y];
    p.g.querySelector("text").textContent = txt;
    p.g.classList.toggle("qb", role === "QB");
    p.g.setAttribute("aria-label", `${ROLES[role].name}. Usa las flechas para moverlo.`);
    place(p, x, y);
  };

  // arrastre con ratón/dedo
  const all = [...off, ...def];
  const toSvg = e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  all.forEach(p => {
    let grab = null;
    p.g.addEventListener("pointerdown", e => {
      p.g.setPointerCapture(e.pointerId);
      const m = toSvg(e);
      grab = { dx: p.x - m.x, dy: p.y - m.y };
      p.g.classList.add("dragging");
      describe(p);
    });
    p.g.addEventListener("pointermove", e => {
      if (!grab) return;
      const m = toSvg(e);
      place(p, m.x + grab.dx, m.y + grab.dy);
    });
    const end = () => { grab = null; p.g.classList.remove("dragging"); };
    p.g.addEventListener("pointerup", end);
    p.g.addEventListener("pointercancel", end);
    p.g.addEventListener("keydown", e => {
      const step = e.shiftKey ? 3 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (d) { e.preventDefault(); place(p, p.x + d[0], p.y + d[1]); describe(p); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); describe(p); }
    });
  });

  // formación actual
  let current = "SHOTGUN";
  const setFormation = key => {
    current = key;
    const f = FORMATIONS[key];
    [...OFF_LINE, ...f.players].forEach((spec, i) => assign(off[i], spec));
    [...DEF_LINE, ...DEF_BACK[f.def]].forEach((spec, i) => assign(def[i], spec));
    $("playerInfo").textContent = "Toca a un jugador para saber qué hace.";
    if (selected) { selected.g.classList.remove("sel"); selected = null; }
    $("formInfo").replaceChildren(
      h("h3", {}, f.name),
      h("p", {}, f.text),
      h("p", { class: "note" }, `Ataque: 5 linieros, 1 quarterback, ${f.personnel}. Defensa típica contra esta formación: ${f.def === "base" ? "base 4-3 (4 de línea, 3 linebackers)" : "nickel (4 de línea, 2 linebackers y 3 esquineros)"}. La alineación de la defensa es ilustrativa.`)
    );
    drawTeam();
  };

  // controles
  tabGroup($("formTabs"), FORM_KEYS.map(k => ({ key: k, label: FORMATIONS[k].name })), current, setFormation);
  $("resetPos").onclick = () => setFormation(current);
  $("showDef").onchange = e => { defG.style.display = e.target.checked ? "" : "none"; };

  const sel = $("teamSelect");
  const pickerLogo = $("teamSelectLogo");
  const updatePickerLogo = () => {
    pickerLogo.src = logoSrc(selectedTeam);
    pickerLogo.alt = `Logo de ${TEAMS[selectedTeam].name}`;
  };
  Object.entries(TEAMS).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .forEach(([abbr, t]) => sel.append(h("option", { value: abbr }, t.name)));
  sel.value = selectedTeam;
  updatePickerLogo();
  sel.onchange = () => setTeam(sel.value);
  teamListeners.push(() => { sel.value = selectedTeam; updatePickerLogo(); drawTeam(); });

  // estadísticas por equipo vs liga
  const league = {};
  TEAM_DATA.forEach(r => {
    const l = league[r.formation] || (league[r.formation] = { plays: 0, ok: 0, total: 0 });
    l.plays += r.plays; l.ok += r.plays * r.successRate / 100;
  });
  const leagueTotal = Object.values(league).reduce((a, l) => a + l.plays, 0);

  function drawTeam() {
    const team = TEAMS[selectedTeam].name;
    const rows = TEAM_DATA.filter(r => r.team === selectedTeam).sort((a, b) => b.plays - a.plays);
    const mine = rows.find(r => r.formation === current);
    const lg = league[current];
    const lgShare = 100 * lg.plays / leagueTotal, lgSucc = 100 * lg.ok / lg.plays;
    const box = $("teamInfo");
    box.replaceChildren(h("div", { class: "team-heading" },
      teamLogo(selectedTeam, "team-info-logo"),
      h("h3", {}, `${team}: ${label(current)}`)));
    if (!mine) {
      box.append(h("p", {}, `Este equipo no usó esta formación en sus jugadas de pase de estas 8 semanas. En la liga se usó en el ${lgShare.toFixed(1)} % de los casos.`));
    } else {
      const few = mine.plays < TEAM_MIN ? ` Son solo ${mine.plays} jugadas, así que el porcentaje de éxito es poco fiable.` : "";
      box.append(h("p", {},
        `Usaron la ${label(current)} en el ${mine.share.toFixed(0)} % de sus pases (${mine.plays} jugadas). La liga la usa en el ${lgShare.toFixed(0)} %. ` +
        `Les resultó exitosa en el ${mine.successRate.toFixed(0)} % de las jugadas (liga: ${lgSucc.toFixed(0)} %), con ${mine.avgYards.toFixed(1)} yardas por jugada.` + few));
    }
    const bars = h("div", { class: "bars" }, h("p", { class: "note" }, "Todas sus formaciones (% de sus pases):"));
    rows.forEach(r => {
      bars.append(h("div", { class: "row" + (r.formation === current ? " cur" : "") },
        h("span", {}, label(r.formation)),
        h("div", { class: "track" }, h("div", { class: "fill", style: `width:${r.share}%` })),
        h("span", { class: "val" }, r.share.toFixed(0) + " %")));
    });
    box.append(bars);
  }

  setFormation(current);
  requestAnimationFrame(() => svg.classList.add("ready")); // activa la animación solo después de la carga
})();

/* ---------- paso 6: formaciones por cuarto ---------- */
(function step6() {
  $("min").textContent = MIN_PLAYS;
  const draw = q => {
    const rows = FORMATION_DATA.filter(r => r.quarter === q && r.plays >= MIN_PLAYS)
      .sort((a, b) => b.successRate - a.successRate);
    const chart = $("chart");
    chart.replaceChildren();
    rows.forEach((r, i) => {
      chart.append(h("div", { class: "crow" + (i === 0 ? " best" : "") },
        h("div", { class: "name" }, label(r.formation)),
        h("div", { class: "track", style: "height:22px" }, h("div", { class: "fill", style: `width:${r.successRate}%` })),
        h("div", { class: "val" }, r.successRate.toFixed(0) + " %"),
        h("div", { class: "meta" }, `${r.avgYards.toFixed(1)} yardas por jugada · ${r.plays} jugadas · ${r.completionRate.toFixed(0)} % de pases completos`)));
    });
    const best = rows[0], worst = rows[rows.length - 1];
    const most = [...rows].sort((a, b) => b.plays - a.plays)[0];
    $("talk").textContent =
      `En el ${q}.º cuarto, la formación más usada es la ${label(most.formation)} (${most.plays} jugadas). ` +
      (best === most ? "Además, fue" : "La que mejor funcionó fue") +
      ` la ${label(best.formation)}: ${best.successRate.toFixed(0)} % de jugadas exitosas y ${best.avgYards.toFixed(1)} yardas por jugada. ` +
      `La que menos rindió fue la ${label(worst.formation)} (${worst.successRate.toFixed(0)} %).`;
  };
  tabGroup($("qTabs"), [1, 2, 3, 4].map(q => ({ key: q, label: q + ".º cuarto" })), 1, draw);
  draw(1);
})();

/* ---------- paso 7: predictor de jugada ---------- */
(function step7() {
  const st = { down: 3, q: 4 };
  const sig = z => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  // Debe coincidir con feats() de build_model.py
  const feats = (down, toGo, toGoal, q, diff, late, form) => {
    const tg = Math.min(toGo, 25) / 10, d = Math.max(-21, Math.min(21, diff)) / 10;
    const x = [1, down === 2, down === 3, down === 4, tg, down >= 3 ? tg : 0, toGoal / 100, toGoal <= 20,
      q === 2, q === 3, q === 4, d, q === 4 ? d : 0, late];
    MODEL_FORMS.forEach(k => { if (k !== MODEL_BASE) x.push(form === k); });
    return x.map(Number);
  };
  const dot = (b, x) => b.reduce((a, v, i) => a + v * x[i], 0);
  const val = id => Number($(id).value);

  const read = () => ({ down: st.down, q: st.q, toGo: val("pToGo"), toGoal: val("pGoal"), diff: val("pDiff"),
    late: (st.q === 2 || st.q === 4) && $("pLate").checked ? 1 : 0 });

  const draw = () => {
    const s0 = read();
    $("pToGoV").textContent = s0.toGo + " yd";
    $("pGoalV").textContent = s0.toGoal > 50 ? `tu yarda ${100 - s0.toGoal} (${s0.toGoal} yd para anotar)` : `yarda ${s0.toGoal} del rival (${s0.toGoal} yd para anotar)`;
    $("pDiffV").textContent = s0.diff === 0 ? "empatado" : s0.diff > 0 ? `ganas por ${s0.diff}` : `pierdes por ${-s0.diff}`;
    $("pLate").disabled = !(st.q === 2 || st.q === 4);

    const res = MODEL_FORMS.map(f => {
      const x = feats(s0.down, s0.toGo, s0.toGoal, s0.q, s0.diff, s0.late, f);
      const m = TEAM_DATA.find(r => r.team === selectedTeam && r.formation === f);
      return { f, ok: sig(dot(MODEL_COEF.ok, x)), comp: sig(dot(MODEL_COEF.comp, x)),
        sack: sig(dot(MODEL_COEF.sack, x)), yards: dot(MODEL_COEF.yards, x), team: m ? m.share : 0 };
    }).sort((a, b) => b.ok - a.ok);

    const best = res[0], worst = res[res.length - 1];
    const spread = 100 * (best.ok - worst.ok);
    const fav = [...res].sort((a, b) => b.team - a.team)[0];
    $("pTalk").textContent =
      `Con ${s0.down}.º intento y ${s0.toGo} yardas por recorrer, el modelo prefiere la ${label(best.f)}: ${(100 * best.ok).toFixed(0)} % de probabilidad de éxito ` +
      `y ${best.yards.toFixed(1)} yardas esperadas. ` +
      (spread < 4 ? `Pero la diferencia entre formaciones es de solo ${spread.toFixed(1)} puntos: en esta situación casi da igual cuál elijan.`
        : `La peor es la ${label(worst.f)} (${(100 * worst.ok).toFixed(0)} %).`);

    const out = $("pOut"); out.replaceChildren();
    res.forEach((r, i) => {
      out.append(h("div", { class: "crow" + (i === 0 ? " best" : "") },
        h("div", { class: "name" }, label(r.f) + (r.f === fav.f && fav.team ? " ★" : "")),
        h("div", { class: "track", style: "height:22px" }, h("div", { class: "fill", style: `width:${(100 * r.ok).toFixed(1)}%` })),
        h("div", { class: "val" }, (100 * r.ok).toFixed(0) + " %"),
        h("div", { class: "meta" }, `${r.yards.toFixed(1)} yardas esperadas · ${(100 * r.comp).toFixed(0)} % de completar · ${(100 * r.sack).toFixed(0)} % de captura (sack)`)));
    });
    if (fav.team) out.append(h("p", { class: "note" }, `★ = la formación que más usa ${TEAMS[selectedTeam].name} en sus pases (${fav.team.toFixed(0)} %). Cambia de equipo en el paso 3.`));

    // jugadas reales parecidas
    const near = (dy, dg) => MODEL_PLAYS.filter(p => p[0] === s0.down && Math.abs(p[1] - s0.toGo) <= dy && Math.abs(p[2] - s0.toGoal) <= dg);
    let sim = near(2, 15), wide = false;
    if (sim.length < 30) { sim = near(4, 30); wide = true; }
    const box = $("pNear"); box.replaceChildren(h("h3", {}, "¿Y qué pasó en la vida real?"));
    if (!sim.length) box.append(h("p", {}, "No hay jugadas parecidas en los datos."));
    else {
      const ok = 100 * sim.reduce((a, p) => a + p[7], 0) / sim.length, yd = sim.reduce((a, p) => a + p[8], 0) / sim.length;
      box.append(h("p", {}, `En ${sim.length} jugadas reales de ${s0.down}.º intento con ${wide ? "entre " + Math.max(1, s0.toGo - 4) + " y " + (s0.toGo + 4) : "casi " + s0.toGo} yardas por recorrer y posición parecida, ` +
        `el ${ok.toFixed(0)} % tuvo éxito y promediaron ${yd.toFixed(1)} yardas. ` + (sim.length < 30 ? "Son pocas jugadas: tómalo con cautela." : "")));
    }

    const R = MODEL_REPORT;
    $("pNote").textContent =
      `Qué tan confiable es: se entrenó con las semanas 1 a 6 y se probó con las semanas 7 y 8 (${R.test} jugadas que el modelo no había visto). ` +
      `Para «éxito» obtuvo un AUC de ${R.ok.auc} (0.5 es adivinar, 1 es perfecto): mejora a un simple promedio, pero se equivoca a menudo. Una jugada de fútbol americano tiene mucho azar. ` +
      `Lo que más pesa es la situación (intento y yardas por recorrer); la formación cambia poco el resultado. ` +
      `Son probabilidades, no promesas, y solo incluyen jugadas de pase de 2021 (no hay corridas). Se omiten formaciones con menos de 30 jugadas (Jumbo, Wildcat).`;
  };

  tabGroup($("pDown"), [1, 2, 3, 4].map(k => ({ key: k, label: k + ".º" })), st.down, k => { st.down = k; draw(); });
  tabGroup($("pQ"), [1, 2, 3, 4].map(k => ({ key: k, label: k + ".º" })), st.q, k => { st.q = k; draw(); });
  ["pToGo", "pGoal", "pDiff", "pLate"].forEach(id => $(id).addEventListener("input", draw));
  teamListeners.push(draw);
  draw();
})();

/* ---------- hoja de ruta: campo y balón de progreso ---------- */
(function roadmap() {
  const steps = [...document.querySelectorAll(".step")];
  const nav = $("nav");
  const field = document.querySelector(".field-progress");
  const meter = $("bar");
  const ball = $("progressBall");
  const status = $("roadmapLabel");
  const count = $("roadmapCount");

  field.style.setProperty("--steps", steps.length);
  meter.setAttribute("aria-valuemax", String(steps.length));

  const links = steps.map((sec, i) => {
    const a = h("a", { href: "#" + sec.id, "aria-label": `Etapa ${i + 1}: ${sec.dataset.title}` },
      h("span", { class: "n" }, h("span", {}, String(i + 1))),
      h("span", { class: "stage-name" }, sec.dataset.title));
    nav.append(h("li", {}, a));
    return a;
  });

  const placeBall = (i, completed = false) => {
    const position = completed ? 97 : 100 * (i + 0.5) / steps.length;
    const progress = completed ? 100 : position;
    ball.style.left = position + "%";
    meter.style.width = progress + "%";
    meter.setAttribute("aria-valuenow", String(i + 1));
    meter.setAttribute("aria-valuetext", completed
      ? "Recorrido completado"
      : `Etapa ${i + 1} de ${steps.length}: ${steps[i].dataset.title}`);
  };

  let activeIndex = -1;
  let isComplete = false;

  const activate = i => {
    if (i === activeIndex && !isComplete) return;
    activeIndex = i;
    isComplete = false;
    steps.forEach((section, k) => section.classList.toggle("visible", k === i));
    links.forEach((a, k) => {
      if (k === i) a.setAttribute("aria-current", "step");
      else a.removeAttribute("aria-current");
      a.classList.toggle("done", k < i); // al regresar, las etapas posteriores se desmarcan
    });
    status.textContent = `Etapa ${i + 1} · ${steps[i].dataset.title}`;
    count.textContent = `${i + 1} de ${steps.length}`;
    placeBall(i);
  };

  const complete = () => {
    if (isComplete) return;
    isComplete = true;
    links.forEach(a => { a.removeAttribute("aria-current"); a.classList.add("done"); });
    status.textContent = "¡Recorrido completado!";
    count.textContent = `${steps.length} de ${steps.length}`;
    placeBall(steps.length - 1, true);
  };

  // La línea imaginaria situada al 36 % de la pantalla determina la etapa activa.
  // Al llegar al final, el balón entra en la zona de anotación y se completa la etapa 7.
  const syncWithScroll = () => {
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 8) {
      complete();
      return;
    }
    const readingLine = window.innerHeight * 0.36;
    let current = 0;
    steps.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= readingLine) current = i;
    });
    activate(current);
  };

  let ticking = false;
  const requestSync = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      syncWithScroll();
      ticking = false;
    });
  };
  window.addEventListener("scroll", requestSync, { passive: true });
  window.addEventListener("resize", requestSync);
  syncWithScroll();
})();
