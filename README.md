# NFL para curiosos: guía de usuario

Página interactiva para quien no sigue la NFL pero quiere entender lo básico y tener tema de conversación con aficionados. Avanza de lo más simple (qué es el juego) a lo más táctico (formaciones y qué conviene hacer en cada situación), con datos reales de la temporada 2021.

## Cómo abrirla

Abre `web/index.html` con doble clic en cualquier navegador actual. No necesita instalación, servidor ni internet.

## Cómo moverte

- **Barra de progreso (arriba, fija).** Tiene forma de campo con 7 etapas. Un balón avanza conforme bajas por la página.
- **Etapas en verde.** Las etapas ya recorridas se marcan en verde con una palomita. Si regresas a una anterior, las posteriores se desmarcan.
- **Saltar a una etapa.** Toca su número o nombre en la barra.
- **Al llegar al final**, el balón entra a la zona de anotación y la barra indica que completaste el recorrido.

## Las 7 etapas

| Etapa | Qué aprendes | Qué puedes hacer |
|---|---|---|
| 1. El juego | Objetivo, los 4 intentos (downs) para avanzar 10 yardas y cómo se anotan puntos | Mover el balón con botones de jugada y sumar puntos. Tocar cada zona del campo para verla resaltada con su explicación |
| 2. Duración | 4 cuartos de 15 min, descanso, tiempo extra y por qué un partido dura ~3 horas | Tocar cada tramo de la línea de tiempo |
| 3. Equipos | 32 equipos, 2 conferencias (AFC y NFC), 4 divisiones, temporada y playoffs | Cambiar de conferencia y elegir tu equipo |
| 4. Jugadores | Qué hace cada posición en ataque, defensa y equipos especiales | Abrir cada posición para leer su función |
| 5. Formaciones | Las 6 formaciones más comunes y cómo cambian la colocación de los jugadores | Arrastrar jugadores sobre la cancha, comparar tu equipo con la liga |
| 6. Por cuarto | Qué formación funcionó mejor en cada cuarto | Elegir un cuarto y leer la frase lista para la charla |
| 7. Predictor | Qué formación conviene según la situación del partido | Ajustar intento, cuarto, yardas, posición y marcador |

### 1. El juego

- **Botones de jugada** (pase incompleto, corrida, pase largo, captura al quarterback). Muestran cómo cambian el intento actual, las yardas que faltan y la posición del balón.
- **Intentos:** cuatro casillas indican cuál usas ahora. Con 10 yardas ganadas hay primer down y se reinician. Si no lo logras en el 4.º, el balón pasa al rival.
- **Marcador:** los botones de puntos (touchdown, punto extra, conversión de 2, gol de campo, safety) se activan solo cuando la situación del campo lo permite.
- **Zonas del campo:** zonas de anotación, línea de gol, líneas de yarda, marcas pequeñas (hash marks), medio campo, zona roja, bandas laterales, postes y campo propio/rival. Toca una zona y el resto se atenúa.

### 3. Equipos

El equipo que elijas aquí se usa también en las etapas 5 y 7. Puedes cambiarlo en cualquiera de ellas.

### 5. Formaciones

1. Elige una formación: Shotgun, Empty, Singleback, I-Form, Pistol o Jumbo.
2. **Arrastra** a cualquier jugador con el ratón o el dedo. Con el teclado, selecciónalo y usa las flechas (Mayús mueve más rápido).
3. Toca un jugador para leer qué hace. Se muestra el nombre de la posición y su función.
4. Activa o desactiva **Mostrar defensa**.
5. Usa **Volver a la posición original** para reiniciar.
6. Elige un equipo en el selector. El panel de la derecha compara cuánto usa esa formación y qué tan bien le funciona frente al promedio de la liga.

### 7. Predictor

Ajusta la situación y verás, para cada formación, la probabilidad estimada de que el pase tenga éxito, las yardas esperadas, la probabilidad de completar y de que capturen al quarterback. Marca con ★ la formación que más usa tu equipo. Debajo aparece qué pasó en jugadas reales parecidas.

## Cómo leer los números

- **Éxito:** la jugada avanzó al menos el 40 % de las yardas que faltaban en 1.er down, el 60 % en 2.º, o todas en 3.º y 4.º.
- **Yardas por jugada:** promedio ganado, con las capturas restando yardas.
- **Muestra pequeña:** no se muestran formaciones con menos de 30 jugadas en un cuarto. En el panel por equipo, la página avisa cuando hay menos de 20.
- **Correlación, no causa.** Una formación puede verse mejor porque se usa en situaciones más fáciles.
- **El predictor da probabilidades, no promesas.** Mejora a un promedio simple, pero se equivoca a menudo, porque una jugada tiene mucho azar. La situación (intento y yardas por recorrer) pesa más que la formación.

## Límites a tener en cuenta

- Los datos cubren solo **jugadas de pase de las semanas 1 a 8 de 2021**. No incluyen corridas ni el resto de la temporada.
- Las posiciones del diagrama y la defensa mostrada son **ilustrativas**. No provienen de los datos de seguimiento.
- Las reglas del juego (duración, puntos, estructura de la liga) están escritas de forma resumida y pueden tener excepciones.
- Los logotipos vienen de [SportsLogos.Net](https://www.sportslogos.net/teams/list_by_league/7/National-Football-League-Logos/NFL-Logos/). Las marcas pertenecen a la NFL y a sus equipos.

## Glosario rápido

| Término | Significado |
|---|---|
| Down | Un intento del ataque. Tiene 4 para avanzar 10 yardas |
| Primer down | Lograr las 10 yardas y recibir 4 intentos nuevos |
| Touchdown | Llevar el balón a la zona de anotación rival (6 puntos) |
| Gol de campo | Patada entre los postes (3 puntos) |
| Sack | Capturar al quarterback antes de que lance |
| Quarterback (QB) | Líder del ataque, el que lanza el balón |
| Formación | Cómo se coloca el ataque antes de cada jugada |
| Zona roja | Las últimas 20 yardas antes de la zona de anotación rival |

## Para quien mantiene el proyecto

```
data/            CSV originales
build_data.py    Calcula las estadísticas y genera web/data.js
build_model.py   Entrena el predictor y genera web/model.js
web/
  index.html     Página
  style.css      Estilos
  app.js         Interacción
  data.js        Estadísticas por cuarto y por equipo (generado)
  model.js       Modelo del predictor (generado)
  Resources/     Imágenes y logotipos
```

Si cambian los CSV, ejecuta `python build_data.py` y `python build_model.py` (Python 3, sin dependencias externas) para regenerar `web/data.js` y `web/model.js`.
