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
├── main.ts    # Entry point, App class, Poller, UI rendering
├── api.ts     # Types (Player, Game, Tournament) + ApiClient with smart caching
└── state.ts   # Config, EloCalculator (incremental), Store (cached)
```

### Performance Optimizations

- **Incremental ELO**: Only processes new games, skips already-computed games
- **Cached leaderboard/tournaments**: Invalidated on data update, not recomputed on every render
- **Smart player polling**: Players cached for 5 min, only refetched when new IDs appear

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
  "leaderboardSize": 20
}
```

## Keyboard Controls

| Key | Action |
|-----|--------|
| ↑/↓ or j/k | Navigate lists |
| Tab | Switch between panes |
| x | Toggle favorite on selected player |
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

### Key Input Handling

```typescript
// Use renderer.keyInput, not renderer directly
renderer.keyInput.on("keypress", (event) => {
  switch (event.name) {  // event.name, not event.key
    case "q": quit(); break
    case "Up": moveUp(); break
    case "Tab": switchPane(); break
  }
})
```

### Terminal Cleanup on Exit

opentui's `destroy()` method doesn't reliably restore terminal state. Manually clean up:

```typescript
async function quit() {
  // Remove event listeners first
  renderer.keyInput.off("keypress", handler)

  // Manually restore terminal state
  const cleanup = [
    "\x1b[?1003l", // Disable all mouse tracking
    "\x1b[?1002l", // Disable cell motion mouse tracking
    "\x1b[?1000l", // Disable mouse click tracking
    "\x1b[?1006l", // Disable SGR mouse mode
    "\x1b[?1004l", // Disable focus reporting
    "\x1b[?2004l", // Disable bracketed paste
    "\x1b[?1049l", // Exit alternate screen buffer
    "\x1b[?25h",   // Show cursor
    "\x1b[0m",     // Reset colors/styles
  ].join("")
  process.stdout.write(cleanup)

  // Restore stdin to cooked mode
  if (process.stdin.isTTY && process.stdin.setRawMode) {
    process.stdin.setRawMode(false)
  }
  process.stdin.pause()

  // Then call destroy
  renderer.destroy()
  process.exit(0)
}
```

## Related Projects

- **DepthCharge bot** - User's battleship bot (see ../bsbot)
- **battleships.devrel.hny.wtf** - Tournament platform
