# NEON STRIKE — AI Mission Director Arena Shooter

A multiplayer browser game prototype using Node.js, Express, Socket.IO, and Canvas. The weapons are fictional energy blasters.

## Requirements
- Node.js 20+
- Internet connection for `npm install`
- A desktop/laptop is recommended for aiming; the game includes basic mobile movement controls.

## Run locally
1. Extract the project ZIP.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Test multiplayer
1. Open the game in two browser windows.
2. Create an arena in one and join with the room code from the other.
3. Click Launch match.
4. Move with WASD/arrows, aim with the mouse, click/hold or press Space to fire.
5. Switch weapons with `1`, `2`, `3`.
6. Check that both windows show the same players, shots, health, score, and match timer.
7. Use the SOUND: ON/OFF toggle to enable or mute synthesized sound effects. Sound starts after a user interaction, as required by most browsers.
8. Try all three weapons at different distances and confirm the leaderboard changes fairly.

## Optional real OpenAI mission director
The server can request short, structured mission objectives from the OpenAI Responses API. If no API key is configured or the request fails, it safely falls back to built-in missions.

1. Create an API key in your OpenAI developer account, if you have API access and billing configured.
2. Set `OPENAI_API_KEY` in your local shell or hosting provider's environment settings. Do not put the key in `public/`, HTML, or browser JavaScript.
3. Optionally set `OPENAI_MODEL` to a model available to your API project. Default is `gpt-4o-mini`.
4. Restart the server and start a match. The mission panel should show `OpenAI AI Director` when an API-generated mission is used, or `Local fallback` otherwise.
5. API usage may incur charges. The game limits mission-generation calls to three per match; check your own API pricing and usage.

On macOS/Linux, you can start with:
`export OPENAI_API_KEY="your-key-here"`
`npm start`

On Windows PowerShell:
`$env:OPENAI_API_KEY="your-key-here"`
`npm start`

## Deploy
Use a Node.js hosting service that supports WebSockets.
- Install command: `npm install`
- Start command: `npm start`
- Node version: 20+
Set `OPENAI_API_KEY` in the host's private environment-variable settings (not in the code repository). Use the public HTTPS URL to test from two separate devices.

## Features
- Room codes and 2–8 player rooms
- Three fictional weapons with tuned trade-offs: Pulse (fast balanced shots), Scatter (five spread pellets, strongest close-up), Rail (slow, precise heavy shots)
- Server-side projectile movement, collision, damage and fire-rate checks
- Health, shields, respawn, eliminations and score
- Energy orbs, temporary power-ups, obstacles and shrinking danger zone
- Mission-specific scoring bonuses: collect orbs, combat eliminations, safe-zone survival, and power-up pickup
- Optional real OpenAI-generated mission title/description/type with safe fallback
- Match timer, leaderboard and responsive interface

## Important limitations
This remains a prototype, not a security-audited production game. Test thoroughly, improve anti-cheat and rate limiting, validate all inputs, add reconnect handling, continue balancing weapons using real multiplayer tests, and test mobile aiming before public release. A configured OpenAI API key is needed for live AI-generated missions; without it the game uses fallback missions. Never claim an AI-generated mission was used if the mission panel says `Local fallback`.
