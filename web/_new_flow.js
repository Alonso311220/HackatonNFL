  /* flujo de decisión: elegir la jugada, confirmarla y pasar al siguiente intento */
  let total = 0;
  let chosen = null;
  const msg = t => { $("downMsg").textContent = t; };
  const addPts = pts => { total += pts; $("scoreTotal").textContent = total; flash("+" + pts); };
  const newDrive = () => { Object.assign(state, { ball: START, start: START, down: 1, phase: "drive" }); };
  const fgDist = () => 100 - state.ball + 17;   // yardas del gol de campo: distancia a la línea de gol + 10 de zona + 7 de snap
  const FG_MAX = 55;

  // Cada opción: id, nombre, detalle, si está bloqueada (y por qué) y qué hace al confirmar.
  const optionsFor = () => {
    if (state.phase === "after") return [
      { id: "xp", label: "Punto extra", hint: "+1 · patada", run: () => { addPts(1); newDrive();
        msg("Patada entre los postes: 1 punto. Empieza un ataque nuevo."); } },
      { id: "two", label: "Conversión de 2", hint: "+2 · correr o pasar", run: () => { addPts(2); newDrive();
        msg("Conversión de 2 puntos. Empieza un ataque nuevo."); } },
    ];
    const plays = [["inc", "Pase incompleto", 0], ["run", "Corrida corta", 3], ["pas", "Pase largo", 12], ["deep", "Pase profundo", 35], ["sck", "Captura al QB", -7]]
      .map(([id, label, y]) => ({ id, label, hint: y === 0 ? "0 yardas" : (y > 0 ? "+" : "−") + Math.abs(y) + " yardas", run: () => play(y) }));
    const is4 = state.down === 4;
    const wait = "Disponible en el 4.º intento";
    return [...plays,
      { id: "punt", label: "Despeje (punt)", hint: is4 ? "patear el balón lejos" : wait, locked: !is4,
        run: () => { msg("Despejaste: el balón viaja unas 40 yardas hacia el rival, que empieza su ataque. No sumas puntos, pero le quitas terreno. (Reiniciamos el ejemplo con un ataque nuevo.)"); newDrive(); } },
      { id: "fg", label: "Gol de campo", hint: !is4 ? wait : fgDist() > FG_MAX ? `muy lejos (${fgDist()} yd)` : `+3 · desde ${fgDist()} yd`,
        locked: !is4 || fgDist() > FG_MAX,
        run: () => { addPts(3); newDrive(); msg("¡Gol de campo! El balón pasa entre los postes: 3 puntos. En un partido real la patada también puede fallar."); } },
    ];
  };

  const play = yards => {
    state.ball = Math.max(1, Math.min(100, state.ball + yards));
    const gained = state.ball - state.start;
    if (state.ball >= 100) {
      state.phase = "after"; addPts(6);
      msg("¡Touchdown! Cruzaste la línea de gol: 6 puntos. Ahora elige el intento extra.");
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
  };

  const renderOptions = () => {
    const box = $("playOptions");
    const opts = optionsFor();
    if (!opts.some(o => o.id === chosen && !o.locked)) chosen = null;
    $("pickTitle").textContent = state.phase === "after"
      ? "Touchdown: elige el intento extra"
      : `Intento ${state.down} de 4: elige la jugada`;
    box.replaceChildren(...opts.map(o => h("button", {
      class: "opt", "aria-pressed": String(o.id === chosen), ...(o.locked ? { disabled: "" } : {}),
      onclick: () => { chosen = o.id; renderOptions(); },
    }, h("strong", {}, o.label), h("small", {}, o.hint))));
    $("confirmPlay").disabled = !chosen;
  };

  const refresh = () => {
    drawAttempts(); drawField(); renderOptions();
    $("downStatus").textContent = state.phase === "drive"
      ? `Intento ${state.down} de 4 · faltan ${toGo()} yardas para el primer down`
      : "¡Touchdown! Balón en la zona de anotación";
  };

  $("confirmPlay").onclick = () => {
    const o = optionsFor().find(x => x.id === chosen);
    if (!o || o.locked) return;
    chosen = null;
    o.run();
    refresh();
  };
  $("scoreReset").onclick = () => { total = 0; chosen = null; $("scoreTotal").textContent = 0; newDrive(); msg(""); refresh(); };
  refresh();
})();

