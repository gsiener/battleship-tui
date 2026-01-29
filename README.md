# Battleship Tournament TUI

A terminal UI for monitoring battleship tournaments at battleships.devrel.hny.wtf.

## Features

- 🏆 ELO-based leaderboard with rating trends
- 📋 Tournament browser with live game tracking
- ⭐ Favorite player highlighting
- 🔄 Auto-refresh with configurable polling

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
| f | Toggle favorite on selected player |
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
├── api/          # Battleship API client
├── config/       # User configuration
├── elo/          # ELO rating calculator
├── polling/      # Auto-refresh service
├── state/        # Application state store
├── ui/           # Terminal UI components
│   └── components/
└── index.ts      # Entry point
```
