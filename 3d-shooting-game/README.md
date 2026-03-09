# 3D Arena Shooter

A two-player 3D shooting game: **Player 1 (you)** vs **Player 2 (computer)** in an enclosed arena.

## How to run

Open `index.html` in a modern browser (Chrome, Firefox, Edge). For best experience, use a local server to avoid CORS with ES modules, e.g.:

```bash
npx serve .
```

Then open the URL shown (e.g. http://localhost:3000).

## Controls

| Input | Action |
|-------|--------|
| **Arrow keys** | Move (Up/Down) and turn (Left/Right) |
| **Spacebar** | Shoot at the opponent |
| **Mouse drag** | Orbit the camera to view the 3D arena |

## Rules

- Each player has **100% health**; each hit reduces health by **15%**.
- A **red alert** appears on the opponent’s head for a short time after a successful hit.
- The **computer** moves and shoots back when in range.
- The game ends when one player’s health reaches 0.

## Tech

- **Three.js** for 3D rendering
- **OrbitControls** for mouse-based camera
- No build step; plain HTML + ES modules
