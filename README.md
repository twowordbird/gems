# Gems

A sparkly gem-collecting card game for 2 to 4 players, made for family game
night. It runs in a phone browser: everyone plays on their own phone, or you
pass one phone around the table.

It's our homemade take on the engine-building gem game *Splendor*, with our own
name, art, and patrons. We're not affiliated with the original's publisher.

## Playing

1. One person opens the game and taps **Start a table**.
2. Everyone else scans the QR code or opens the link. The 4-letter code also
   works from the home screen.
3. Someone without a phone can sit in from another player's phone with **Add**.
4. Tap **Deal the cards**.

If a phone dies mid-game, anyone can open the menu and tap **Play for…** to take
over that seat. Reloading the page puts you back in your seat.

On iPhone, Share → *Add to Home Screen* makes it feel like an app.

## How multiplayer works

There's no server of our own. Each phone connects to two free public MQTT
brokers (`broker.emqx.io` and `broker.hivemq.com`) over secure WebSockets.
The whole table is one small JSON message, kept as a retained message under
`twowordbird-gems/v1/<CODE>/table`. Each phone publishes the new table after
its own move, and the newest version wins. Phones that sleep catch up when they
wake.

Public brokers are shared and unauthenticated. Anyone who guesses a table code
could watch or meddle, so don't put anything private in player names. Incoming
tables are shape-checked before they're shown.

To use your own broker, add `?broker=wss://your-broker/mqtt` to the URL.

## Code

| file | what |
|---|---|
| `engine.js` | rules, card catalog, state validation (pure, shared with tests) |
| `art.js` | procedural faceted gem SVGs, cards, patrons |
| `fx.js` | sparkle canvas, flying pieces, synthesized chimes |
| `net.js` | relay over MQTT |
| `app.js` | screens, input, sync, animation |
| `vendor/` | mqtt.js 5.16.0, qrcode-generator 2.0.4 (both MIT) |

No build step: it's static files served straight from GitHub Pages.

Tests:

```
node test/engine.test.js          # rules + 400 random games
node test/serve.js                # local server on :8080 + a throwaway broker on :9001
# then open http://localhost:8080/?broker=ws://localhost:9001 in two windows
```

`test/serve.js` needs `aedes@0.51` and `websocket-stream` from npm.
