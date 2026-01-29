# Battleship Tournament TUI

A terminal UI for monitoring battleship tournaments at battleships.devrel.hny.wtf.

## Quick Start

```bash
bun run start      # Run the TUI
bun test           # Run tests
bun run typecheck  # Type check
```

## Project Structure

```
src/
├── api/              # Battleship API client
│   ├── types.ts      # Player, Game, Tournament interfaces
│   └── client.ts     # BattleshipClient class
├── elo/              # ELO rating system
│   └── calculator.ts # EloCalculator class (K=32, initial 1500)
├── config/           # User configuration
│   └── config.ts     # Config class (~/.config/battleship-tui/config.json)
├── state/            # Application state
│   └── store.ts      # Store class with leaderboard computation
├── polling/          # Auto-refresh
│   └── service.ts    # PollingService with exponential backoff
├── ui/               # Terminal UI (opentui)
│   ├── app.ts        # Main App class
│   └── components/   # UI rendering functions
└── index.ts          # Entry point
```

## Key APIs

### Battleship API (battleships.devrel.hny.wtf)

```typescript
// Fetch all players
GET /api/v1/players -> Player[]

// Fetch all tournaments with games
GET /api/v1/tournaments -> Tournament[]
```

### Data Types

```typescript
interface Player {
  playerId: string
  displayName: string
  type: "Human" | "BuiltInBot"
  isConnected: boolean
}

interface Tournament {
  tournamentId: string
  name: string
  state: "CREATED" | "IN_PROGRESS" | "FINISHED"
  playerIds: string[]
  games: Game[]
  currentRound: number
}

interface Game {
  gameId: string
  playerAId: string
  playerBId: string
  winnerPlayerId: string | null
  playerAHits: number
  playerBHits: number
  isComplete: boolean
}
```

## ELO Rating System

- **Initial rating:** 1500
- **K-factor:** 32
- **Formula:** `NewRating = OldRating + K × (Actual - Expected)`
- **Expected score:** `1 / (1 + 10^((OpponentRating - PlayerRating) / 400))`
- **Provisional:** Players with < 5 games marked with `*`

## Configuration

Location: `~/.config/battleship-tui/config.json`

```json
{
  "favorites": ["player-uuid-1", "player-uuid-2"],
  "pollInterval": 10,
  "leaderboardSize": 20,
  "theme": "default"
}
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| ↑/↓ or j/k | Navigate lists |
| Tab | Switch between panes |
| f | Toggle favorite on selected player |
| r | Force refresh |
| +/- | Adjust poll interval (5-60 seconds) |
| q | Quit |

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🚢 BATTLESHIP TOURNAMENT MONITOR                    ⏱️ Auto: 10s  🔄   │
├────────────────────────────────────┬────────────────────────────────────┤
│  🏆 LEADERBOARD (40%)              │  📋 TOURNAMENTS (60%)              │
│  ─────────────────────             │  ────────────────────────────      │
│  1. ⭐ DepthCharge      1847  ▲12  │  🔴 Tournament Name   IN_PROGRESS │
│  2.    Bot Name         1802  ▼3   │     👥 4   ·  📍 Round 2           │
│  ...                               ├────────────────────────────────────┤
│                                    │  ⚔️  LIVE GAMES                     │
│                                    │  Player A vs Player B              │
│                                    │     💥 12 - 9  ▓▓▓▓▓▓░░░░         │
├────────────────────────────────────┴────────────────────────────────────┤
│  ↑↓ Navigate  ⇥ Switch pane  ★ Toggle fav  r Refresh  +/- Interval  q  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Dependencies

- **@opentui/core** - Terminal UI rendering (requires Zig)
- **bun** - Runtime and package manager

## Development Notes

### opentui Usage

```typescript
import { createCliRenderer, TextRenderable, BoxRenderable } from "@opentui/core"

// Create renderer
const renderer = await createCliRenderer({ targetFps: 30 })

// Create text element
const text = new TextRenderable(renderer, {
  position: "absolute",
  left: 0, top: 0,
  width: 80, height: 1,
})
text.content = "Hello World"
renderer.root.add(text)

// Create box with border
const box = new BoxRenderable(renderer, {
  position: "absolute",
  left: 0, top: 1,
  width: 40, height: 20,
  border: true,
  borderStyle: "single",
  borderColor: "#4b5563",
})
renderer.root.add(box)
```

### Polling with Backoff

```typescript
const polling = new PollingService(store, config, {
  onUpdate: () => render(),
  onError: (err) => showError(err),
})
polling.start()  // Uses config.pollInterval, backs off on errors
```

## Related Projects

- **DepthCharge bot** - User's battleship bot (see ../bsbot)
- **battleships.devrel.hny.wtf** - Tournament platform
