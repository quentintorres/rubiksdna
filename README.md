# Rubiks DNA

Marketing site for **Rubiks DNA**, a fictional longevity research lab that treats
the aging epigenome as a combinatorial puzzle — a Rubik's cube to be solved back
to a youthful state.

## Highlights

- **Hero morph animation** — a 3D particle system (vanilla JS + canvas, zero
  dependencies) that continuously morphs between a DNA double helix and a
  Rubik's cube, complete with animated layer twists while in cube form.
- **Light, research-lab aesthetic** inspired by modern scientific product pages:
  white surfaces, large clean typography, a restrained blue accent, and Rubik's
  colors used as small accents.
- **CUBESOLVER terminal** — a typewriter-animated dark terminal block showing a
  fictional epigenetic "solve".

## Running locally

It's a plain static site — no build step, no dependencies.

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

### Debug helpers

Pin the hero animation to a specific state via query parameter:

- `?state=dna` — hold the double helix
- `?state=cube` — hold the Rubik's cube

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure and content |
| `styles.css` | Light theme styling |
| `script.js` | Hero particle morph, stat counters, terminal typewriter |
