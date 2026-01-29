# Battleship Tournament TUI

A terminal UI for monitoring battleship tournaments at battleships.devrel.hny.wtf.

## Features

- 🏆 ELO-based leaderboard with rating trends
- 📋 Tournament browser with live game tracking
- ⭐ Favorite player highlighting
- 🔄 Auto-refresh with configurable polling
- 🤖 **Bot Activity Monitor** - watch your bot play in real-time

## Requirements

- [Bun](https://bun.sh) >= 1.0
- [Zig](https://ziglang.org) (for opentui native modules)

## Installation

```bash
# Install zig if not present
brew install zig

# Install dependencies
bun install
```

## Usage

```bash
bun run start
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| ↑/↓ or j/k | Navigate lists |
| Tab | Switch between panes |
| x | Toggle favorite on selected player |
| r | Force refresh |
| +/- | Adjust poll interval |
| q | Quit |

## Configuration

Config is stored at `~/.config/battleship-tui/config.json`:

```json
{
  "favorites": ["player-uuid-1"],
  "pollInterval": 10,
  "leaderboardSize": 20
}
```

## Bot Activity Monitor

The TUI can display real-time events from your battleship bot. When your bot writes game events to a log file, they appear in the **Bot Activity** panel.

### Log File Location

```
~/.local/share/battleship-bot/game-events.jsonl
```

### Log Format (JSONL)

Each line is a JSON object with an `event` field. The TUI recognizes these events:

#### Game Start
```json
{"event":"game_start","gameId":"uuid","opponentId":"uuid","timestamp":"2024-01-29T15:30:00.000Z"}
```

#### Shot Fired (your bot's shot)
```json
{"event":"shot_fired","gameId":"uuid","coordinate":"A5","timestamp":"2024-01-29T15:30:01.000Z"}
```

#### Shot Result (result of your shot)
```json
{"event":"shot_result","gameId":"uuid","coordinate":"A5","hit":true,"sunk":"Destroyer","timestamp":"2024-01-29T15:30:01.500Z"}
```
- `hit`: boolean - whether the shot hit
- `sunk`: string or null - ship name if sunk, null otherwise

#### Opponent Shot
```json
{"event":"opponent_shot","gameId":"uuid","coordinate":"B3","hit":true,"timestamp":"2024-01-29T15:30:02.000Z"}
```

#### Game End
```json
{"event":"game_end","gameId":"uuid","won":true,"turns":42,"timestamp":"2024-01-29T15:30:45.000Z"}
```

### Implementation Example (TypeScript)

```typescript
import { appendFileSync, mkdirSync, existsSync } from "fs"
import { homedir } from "os"

const LOG_DIR = `${homedir()}/.local/share/battleship-bot`
const LOG_FILE = `${LOG_DIR}/game-events.jsonl`

function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function logEvent(event: object) {
  const line = JSON.stringify({ ...event, timestamp: new Date().toISOString() })
  appendFileSync(LOG_FILE, line + "\n")
}

// Usage in your bot:
logEvent({ event: "game_start", gameId, opponentId })
logEvent({ event: "shot_fired", gameId, coordinate: "A5" })
logEvent({ event: "shot_result", gameId, coordinate: "A5", hit: true, sunk: null })
logEvent({ event: "opponent_shot", gameId, coordinate: "B3", hit: false })
logEvent({ event: "game_end", gameId, won: true, turns: 42 })
```

### Visual Indicators

- Panel border turns **green** when a game is active
- Header shows 🤖 emoji when bot is playing
- Events scroll with newest at top

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## Architecture

```
src/
├── api.ts      # API client with player caching
├── state.ts    # Store, Config, ELO calculator, LogWatcher
└── main.ts     # App, Poller, UI rendering
```
