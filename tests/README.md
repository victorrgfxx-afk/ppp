# Tests

Headless end-to-end tests for the game in `public/`. They drive a real browser
(Chromium via `playwright-core`) against a real WebGL2 context and assert on
game state, not on screenshots.

```bash
npm i -D playwright-core          # once
node tests/serve.cjs &             # static server on :8099
node tests/gameplay.test.cjs       # desktop: walking, driving, doors, menu
node tests/mobile.test.cjs         # phone viewport: touch controls and layout
```

Environment:

* `GAME_URL` — base URL to test against (default `http://127.0.0.1:8099`).
* `CHROMIUM_PATH` — path to a Chromium binary if `playwright-core` cannot find one.

Both suites print `PASS`/`FAIL` per assertion and exit non-zero on failure.

## Why waits are measured in simulated seconds

Software rasterisers (CI, headless without a GPU) run this scene at a few
frames per second, so holding a key for 1500 ms of wall clock may advance the
simulation by only a tenth of a second. The suites therefore poll
`__game.clock.t` and wait for *simulated* time to pass before asserting.
