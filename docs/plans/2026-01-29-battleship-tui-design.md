# Battleship Tournament TUI - Design Document

## Overview

A terminal UI for monitoring battleship tournaments at `battleships.devrel.hny.wtf`. Provides live tournament monitoring, historical analysis, and ELO-based leaderboards.

## Goals

- **Live monitoring** - Watch tournaments in real-time as games are played
- **Historical analysis** - Browse past tournaments, analyze win rates, compare bot performance
- **ELO leaderboard** - Rankings based on opponent strength, not just win count

## Non-Goals

- Tournament/bot management (create, join, etc.)
- Game board visualization
- WebSocket real-time updates (polling is sufficient)

## Tech Stack

- TypeScript with `@opentui/core` (imperative API)
- Bun as runtime/package manager
- Local JSON config file for user preferences

## Architecture

```
Battleship API  →  Polling Service  →  State Store  →  UI Components
     ↑                   |
     └── /api/v1/tournaments, /api/v1/players
```

### Core Modules

| Module | Purpose |
|--------|---------|
| `src/api/client.ts` | HTTP client for battleship API |
| `src/state/store.ts` | Centralized state (tournaments, players, computed ELO) |
| `src/elo/calculator.ts` | ELO rating computation from game history |
| `src/ui/app.ts` | Main TUI layout and rendering |
| `src/config.ts` | User preferences (favorites, poll interval) |

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🚢 BATTLESHIP TOURNAMENT MONITOR                    ⏱️ Auto: 10s  🔄   │
├────────────────────────────────────┬────────────────────────────────────┤
│  🏆 LEADERBOARD                    │  📋 TOURNAMENTS                    │
│  ─────────────────────             │  ────────────────────────────      │
│  1. ⭐ DepthCharge      1847  ▲12  │  🏁 nutest-0           FINISHED   │
│  2.    Hunt-Target Bot  1802  ▼3   │     👥 24  ·  🎮 276 games         │
│  3. ⭐ DepthCharge2     1756  ▲8   │                                    │
│  4.    Wily Legend      1721  ▼5   │  🔴 Test Tournament   IN_PROGRESS │
│  5.    Precise Striker  1698  ▲2   │     👥 4   ·  📍 Round 2           │
│  6.    Random Bot       1523  ━    │                                    │
│  ...                               │  ⚪ Weekly Showdown      CREATED   │
│                                    │     👥 8   ·  ⏳ Not started       │
│                                    │                                    │
│                                    ├────────────────────────────────────┤
│                                    │  ⚔️  LIVE GAMES                     │
│                                    │  ─────────────────────────         │
│                                    │  ⭐DepthCharge vs Wily Legend      │
│                                    │     💥 12 - 9  ▓▓▓▓▓▓░░░░         │
│                                    │  Hunt-Target vs Precise Striker    │
│                                    │     💥 8 - 11  ▓▓▓░░░░░░░         │
├────────────────────────────────────┴────────────────────────────────────┤
│  ↑↓ Navigate  ⇥ Switch pane  ⏎ Details  ★ Toggle fav  q Quit           │
└─────────────────────────────────────────────────────────────────────────┘
```

### Color Scheme

| Element | Color |
|---------|-------|
| Title bar | Cyan background, white text |
| Favorites (⭐) | Gold/yellow |
| ELO rising (▲) | Green |
| ELO falling (▼) | Red |
| ELO unchanged (━) | Gray |
| IN_PROGRESS | Red dot, yellow text |
| FINISHED | Checkered flag, dim/gray |
| CREATED | White dot, cyan text |
| Hit progress bar | Green filled, gray empty |
| Selected row | Inverse/highlight |
| Section headers | Bold cyan |

## ELO Rating System

### Formula

```
Expected Score = 1 / (1 + 10^((OpponentELO - PlayerELO) / 400))
New ELO = Old ELO + K × (ActualScore - ExpectedScore)
```

- **Initial Rating:** 1500
- **K-factor:** 32
- **ActualScore:** 1 for win, 0 for loss

### Implementation

- Calculate fresh on startup from all historical games
- Walk through all `games` arrays from `/api/v1/tournaments`, ordered by tournament creation date
- Cache in memory, recalculate when new games detected
- Players with < 5 games shown with `*` indicator (provisional rating)
- Unfinished games (`isComplete: false`) excluded

### Display

- Current ELO rating
- Change since last poll (▲12, ▼3, ━)

## Configuration

**Location:** `~/.config/battleship-tui/config.json`

```json
{
  "favorites": ["player-uuid-1", "player-uuid-2"],
  "pollInterval": 10,
  "theme": "default",
  "leaderboardSize": 20
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `favorites` | `[]` | Player IDs to highlight with ⭐ |
| `pollInterval` | `10` | Seconds between API refreshes |
| `leaderboardSize` | `20` | Max players shown in leaderboard |
| `theme` | `"default"` | Future: color theme support |

**First run:** Start with empty config, no prompts.

## Keyboard Controls

| Key | Action |
|-----|--------|
| `↑`/`↓` or `j`/`k` | Navigate list |
| `Tab` | Switch between panes |
| `Enter` | Expand tournament details / focus on games |
| `f` | Toggle favorite on selected player |
| `r` | Force immediate refresh |
| `+`/`-` | Adjust poll interval |
| `q` or `Ctrl+C` | Quit |

## Error Handling

### Network Errors

- Show `⚠️ Connection error - retrying...` in status bar
- Exponential backoff: 10s → 20s → 40s → max 60s
- Resume normal polling when connection restored
- Keep displaying last known data

### Edge Cases

- Empty tournaments: Show "No tournaments found" with 🏜️
- Unknown player: Show ID with `[Unknown]` label
- Malformed data: Log to stderr, skip bad records, continue

## Startup Sequence

```
🚢 Battleship TUI v0.1.0
   Fetching tournaments...
   Loading player data...
   Calculating ELO ratings...
   Ready! (42 players, 15 tournaments, 1,247 games)
```

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/tournaments` | List all tournaments with games |
| `GET /api/v1/players` | List all players |

## Data Structures

### Tournament (from API)

```typescript
interface Tournament {
  tournamentId: string
  name: string
  state: "CREATED" | "IN_PROGRESS" | "FINISHED"
  playerIds: string[]
  games: Game[]
  currentRound: number
  createdAt: string
}
```

### Game (from API)

```typescript
interface Game {
  gameId: string
  playerAId: string
  playerBId: string
  roundNumber: number
  winnerPlayerId: string | null
  playerAHits: number
  playerBHits: number
  isComplete: boolean
}
```

### Player (from API)

```typescript
interface Player {
  playerId: string
  displayName: string
  type: "Human" | "BuiltInBot"
  isConnected: boolean
}
```
