# Game Board UI Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace multi-pane UI with two-pane layout: scrollable leaderboard + live game board visualization.

**Architecture:** Bot logs provide coordinate-level game data. Two 10x10 boards rendered side-by-side show attack and defense views. Leaderboard scrolls beyond viewport.

**Tech Stack:** opentui, existing LogWatcher, existing API client for player name lookup.

---

## Layout

```
┌─────────────────────────┬────────────────────────────────────────────────┐
│  🏆 LEADERBOARD (35%)   │  ⚔️ GAME BOARD (65%)                           │
│  ─────────────────────  │                                                │
│   1. Player      1847   │    YOUR SHOTS          OPPONENT SHOTS          │
│   2. Player      1802   │    A B C D E F G H I J   A B C D E F G H I J   │
│   ...                   │  1 · · · · · · · · · ·  1 · · · · · · · · · ·  │
│  (scrollable)           │  ...                    ...                    │
│                         │  vs HuntBot · Turn 34 · 🔴 LIVE                │
├─────────────────────────┴────────────────────────────────────────────────┤
│  ↑↓/jk Scroll  x Favorite  r Refresh  q Quit                            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Board Symbols

| Symbol | Meaning |
|--------|---------|
| `·` | Unknown/empty |
| `O` | Miss |
| `X` | Hit |
| `#` | Sunk segment |

## Data Model

```typescript
interface GameBoard {
  yourShots: Map<string, 'miss' | 'hit' | 'sunk'>
  opponentShots: Map<string, 'miss' | 'hit'>
  opponentId: string
  turnCount: number
  gameStatus: 'live' | 'won' | 'lost'
}
```

## Event Mapping

- `game_start` → Create new GameBoard, store opponentId
- `shot_fired` → Record pending shot
- `shot_result` → Update yourShots map
- `opponent_shot` → Update opponentShots map
- `game_end` → Set gameStatus, preserve as lastCompletedGame

## Leaderboard Scrolling

- Remove 20-entry limit
- Track scrollOffset + selectedIndex
- Viewport follows selection
