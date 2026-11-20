# NFL para curiosos

Página web interactiva que explica el fútbol americano a personas que no son aficionadas, para que puedan tener tema de conversación. Va de lo básico a lo táctico y termina con datos reales de la temporada 2021.

## Cómo verla

Abre `web/index.html` con doble clic. No necesita servidor ni internet.

## Qué ofrece

La página es un recorrido de 6 pasos. Una barra fija arriba muestra el avance.

| Paso | Contenido | Interacción |
|---|---|---|
| 1. El juego | Objetivo, 4 intentos para ganar 10 yardas, puntos | Simulador de intentos y marcador |
| 2. Duración | 4 cuartos de 15 min, descanso, tiempo extra | Línea de tiempo con tramos clicables |
| 3. Equipos | 32 equipos, 2 conferencias, 4 divisiones | Filtro AFC/NFC y selección de equipo |
| 4. Jugadores | Rol de cada posición en ataque, defensa y equipos especiales | Tarjetas desplegables |
| 5. Formaciones | 6 formaciones: Shotgun, Empty, Singleback, I-Form, Pistol, Jumbo | Cancha con jugadores que se arrastran, y estadísticas del equipo elegido frente a la liga |
| 6. Por cuarto | Qué formación funcionó mejor en cada cuarto | Pestañas por cuarto y frase lista para la charla |

## Datos

- Fuente: `data/plays.csv` (NFL Big Data Bowl). Solo jugadas de pase, semanas 1 a 8 de la temporada 2021.
- "Éxito" = la jugada ganó al menos el 40 % de las yardas que faltaban en 1.er down, el 60 % en 2.º, o todas en 3.º y 4.º.
- Se ocultan formaciones con menos de 30 jugadas en un cuarto (la muestra es muy pequeña). A nivel de equipo se avisa cuando hay menos de 20.
- Los resultados no prueban causa: una formación puede verse mejor porque se usa en situaciones más fáciles.
- Las posiciones del diagrama y la defensa mostrada son ilustrativas, no salen de los datos de seguimiento.

## Estructura

```
data/            CSV originales
build_data.py    Calcula las estadísticas y genera web/data.js
web/
  index.html     Página
  style.css      Estilos
  app.js         Interacción
  data.js        Datos calculados (generado)
```

## Actualizar los datos

Si cambian los CSV, ejecuta `python build_data.py` (Python 3, sin dependencias externas). Regenera `web/data.js`.
