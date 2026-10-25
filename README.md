# Maze Breaker

A brick-breaker where a tiny ball tunnels through a massive maze. Clear every **brown brick** — the **grey concrete** blocks can't be broken, so you have to find your way around them.

Plain HTML/CSS/JS on a canvas. No build step, no dependencies.

## Play

Open `index.html` through any static server, e.g.

```bash
python -m http.server 8000
```

then visit http://localhost:8000. It also works on GitHub Pages.

## Controls

| Input | Action |
| --- | --- |
| Mouse / touch drag, `←` `→` / `A` `D` | Move paddle |
| Click / tap / `Space` | Launch ball |
| `P` / `Esc` | Pause |
| `M` | Mute |

## Power-ups

Some bricks drop a capsule when broken. Catch it with the paddle.

| Capsule | Effect |
| --- | --- |
| **+1** | One extra ball |
| **+3** | Three extra balls |
| **↔** | Wider paddle (14 s) |
| **⚡** | Power ball: smashes straight through bricks (8 s) |
| **🐢** | Slow balls (10 s) |
| **💥** | Boom: every brick hit explodes its neighbours (10 s) |

Lose all balls and you lose a life; three lives per run. Levels loop with increasing ball speed.
