# Battleship TUI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a terminal UI that monitors battleship tournaments with ELO-based leaderboards.

**Architecture:** Polling-based data fetching from battleship API, centralized state store with computed ELO ratings, split-pane TUI with opentui rendering. Config stored in ~/.config/battleship-tui/config.json.

**Tech Stack:** TypeScript, Bun, @opentui/core, standard ELO algorithm

**Design Doc:** `docs/plans/2026-01-29-battleship-tui-design.md`

---

## Task 0: Project Setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`

**Step 1: Install zig (required for opentui)**

Run: `brew install zig`
Expected: Zig installed successfully

**Step 2: Initialize bun project**

Run: `bun init -y`
Expected: Creates package.json and tsconfig.json

**Step 3: Install dependencies**

Run: `bun add @opentui/core`
Expected: Package installed, added to package.json

**Step 4: Install dev dependencies**

Run: `bun add -d @types/bun typescript`
Expected: Dev packages installed

**Step 5: Update tsconfig.json for strict TypeScript**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 6: Create minimal entry point**

Create `src/index.ts`:
```typescript
console.log("🚢 Battleship TUI starting...")
```

**Step 7: Add scripts to package.json**

Add to package.json:
```json
{
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  }
}
```

**Step 8: Verify setup**

Run: `bun run start`
Expected: "🚢 Battleship TUI starting..."

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: initialize project with bun and opentui"
```

---

## Task 1: API Client - Types

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/types.test.ts`

**Step 1: Write type definitions**

Create `src/api/types.ts`:
```typescript
export interface Player {
  playerId: string
  displayName: string
  type: "Human" | "BuiltInBot"
  isConnected: boolean
  createdAt: string
}

export interface Game {
  gameId: string
  playerAId: string
  playerBId: string
  roundNumber: number
  winnerPlayerId: string | null
  playerAHits: number
  playerBHits: number
  isComplete: boolean
}

export interface TournamentConfig {
  boardWidth: number
  boardHeight: number
  timeoutSeconds: number
}

export interface Tournament {
  tournamentId: string
  name: string
  state: "CREATED" | "IN_PROGRESS" | "FINISHED"
  config: TournamentConfig
  playerIds: string[]
  games: Game[]
  currentRound: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
```

**Step 2: Write type guard tests**

Create `src/api/types.test.ts`:
```typescript
import { describe, expect, test } from "bun:test"
import type { Player, Tournament, Game } from "./types"

describe("API Types", () => {
  test("Player type matches API response shape", () => {
    const player: Player = {
      playerId: "123",
      displayName: "TestBot",
      type: "Human",
      isConnected: false,
      createdAt: "2026-01-29T00:00:00Z",
    }
    expect(player.playerId).toBe("123")
    expect(player.type).toBe("Human")
  })

  test("Game type matches API response shape", () => {
    const game: Game = {
      gameId: "game-1",
      playerAId: "p1",
      playerBId: "p2",
      roundNumber: 1,
      winnerPlayerId: "p1",
      playerAHits: 17,
      playerBHits: 12,
      isComplete: true,
    }
    expect(game.isComplete).toBe(true)
    expect(game.winnerPlayerId).toBe("p1")
  })

  test("Tournament type matches API response shape", () => {
    const tournament: Tournament = {
      tournamentId: "t1",
      name: "Test",
      state: "IN_PROGRESS",
      config: { boardWidth: 10, boardHeight: 10, timeoutSeconds: 30 },
      playerIds: ["p1", "p2"],
      games: [],
      currentRound: 1,
      createdAt: "2026-01-29T00:00:00Z",
      startedAt: "2026-01-29T00:01:00Z",
      finishedAt: null,
    }
    expect(tournament.state).toBe("IN_PROGRESS")
  })
})
```

**Step 3: Run tests**

Run: `bun test src/api/types.test.ts`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/api/types.ts src/api/types.test.ts
git commit -m "feat: add API type definitions"
```

---

## Task 2: API Client - HTTP Fetching

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/client.test.ts`

**Step 1: Write failing test for fetchPlayers**

Create `src/api/client.test.ts`:
```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test"
import { BattleshipClient } from "./client"

describe("BattleshipClient", () => {
  test("fetchPlayers returns player array", async () => {
    const client = new BattleshipClient()
    const players = await client.fetchPlayers()

    expect(Array.isArray(players)).toBe(true)
    expect(players.length).toBeGreaterThan(0)
    expect(players[0]).toHaveProperty("playerId")
    expect(players[0]).toHaveProperty("displayName")
  })

  test("fetchTournaments returns tournament array", async () => {
    const client = new BattleshipClient()
    const tournaments = await client.fetchTournaments()

    expect(Array.isArray(tournaments)).toBe(true)
    expect(tournaments.length).toBeGreaterThan(0)
    expect(tournaments[0]).toHaveProperty("tournamentId")
    expect(tournaments[0]).toHaveProperty("games")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test src/api/client.test.ts`
Expected: FAIL - "BattleshipClient is not defined"

**Step 3: Implement BattleshipClient**

Create `src/api/client.ts`:
```typescript
import type { Player, Tournament } from "./types"

const API_BASE = "https://battleships.devrel.hny.wtf/api/v1"

export class BattleshipClient {
  private baseUrl: string

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl
  }

  async fetchPlayers(): Promise<Player[]> {
    const response = await fetch(`${this.baseUrl}/players`)
    if (!response.ok) {
      throw new Error(`Failed to fetch players: ${response.status}`)
    }
    return response.json()
  }

  async fetchTournaments(): Promise<Tournament[]> {
    const response = await fetch(`${this.baseUrl}/tournaments`)
    if (!response.ok) {
      throw new Error(`Failed to fetch tournaments: ${response.status}`)
    }
    return response.json()
  }

  async fetchAll(): Promise<{ players: Player[]; tournaments: Tournament[] }> {
    const [players, tournaments] = await Promise.all([
      this.fetchPlayers(),
      this.fetchTournaments(),
    ])
    return { players, tournaments }
  }
}
```

**Step 4: Run tests**

Run: `bun test src/api/client.test.ts`
Expected: All tests pass (tests hit real API)

**Step 5: Create barrel export**

Create `src/api/index.ts`:
```typescript
export * from "./types"
export * from "./client"
```

**Step 6: Commit**

```bash
git add src/api/
git commit -m "feat: add battleship API client"
```

---

## Task 3: ELO Calculator

**Files:**
- Create: `src/elo/calculator.ts`
- Create: `src/elo/calculator.test.ts`

**Step 1: Write failing tests for ELO calculation**

Create `src/elo/calculator.test.ts`:
```typescript
import { describe, expect, test } from "bun:test"
import { calculateExpectedScore, calculateNewRating, EloCalculator } from "./calculator"
import type { Game, Tournament } from "../api/types"

describe("ELO Functions", () => {
  test("calculateExpectedScore returns 0.5 for equal ratings", () => {
    const expected = calculateExpectedScore(1500, 1500)
    expect(expected).toBeCloseTo(0.5, 5)
  })

  test("calculateExpectedScore returns higher value for stronger player", () => {
    const expected = calculateExpectedScore(1600, 1400)
    expect(expected).toBeGreaterThan(0.5)
    expect(expected).toBeCloseTo(0.76, 1)
  })

  test("calculateNewRating increases for winner", () => {
    const newRating = calculateNewRating(1500, 1500, true)
    expect(newRating).toBeGreaterThan(1500)
  })

  test("calculateNewRating decreases for loser", () => {
    const newRating = calculateNewRating(1500, 1500, false)
    expect(newRating).toBeLessThan(1500)
  })
})

describe("EloCalculator", () => {
  test("computes ratings from games", () => {
    const games: Game[] = [
      {
        gameId: "g1",
        playerAId: "p1",
        playerBId: "p2",
        roundNumber: 1,
        winnerPlayerId: "p1",
        playerAHits: 17,
        playerBHits: 12,
        isComplete: true,
      },
    ]

    const tournaments: Tournament[] = [
      {
        tournamentId: "t1",
        name: "Test",
        state: "FINISHED",
        config: { boardWidth: 10, boardHeight: 10, timeoutSeconds: 30 },
        playerIds: ["p1", "p2"],
        games,
        currentRound: 1,
        createdAt: "2026-01-29T00:00:00Z",
        startedAt: null,
        finishedAt: null,
      },
    ]

    const calculator = new EloCalculator()
    const ratings = calculator.computeRatings(tournaments)

    expect(ratings.get("p1")).toBeGreaterThan(1500)
    expect(ratings.get("p2")).toBeLessThan(1500)
  })

  test("ignores incomplete games", () => {
    const games: Game[] = [
      {
        gameId: "g1",
        playerAId: "p1",
        playerBId: "p2",
        roundNumber: 1,
        winnerPlayerId: null,
        playerAHits: 5,
        playerBHits: 3,
        isComplete: false,
      },
    ]

    const tournaments: Tournament[] = [
      {
        tournamentId: "t1",
        name: "Test",
        state: "IN_PROGRESS",
        config: { boardWidth: 10, boardHeight: 10, timeoutSeconds: 30 },
        playerIds: ["p1", "p2"],
        games,
        currentRound: 1,
        createdAt: "2026-01-29T00:00:00Z",
        startedAt: null,
        finishedAt: null,
      },
    ]

    const calculator = new EloCalculator()
    const ratings = calculator.computeRatings(tournaments)

    // Both should be at initial rating since game is incomplete
    expect(ratings.get("p1")).toBe(1500)
    expect(ratings.get("p2")).toBe(1500)
  })

  test("tracks game count per player", () => {
    const games: Game[] = [
      {
        gameId: "g1",
        playerAId: "p1",
        playerBId: "p2",
        roundNumber: 1,
        winnerPlayerId: "p1",
        playerAHits: 17,
        playerBHits: 12,
        isComplete: true,
      },
    ]

    const tournaments: Tournament[] = [
      {
        tournamentId: "t1",
        name: "Test",
        state: "FINISHED",
        config: { boardWidth: 10, boardHeight: 10, timeoutSeconds: 30 },
        playerIds: ["p1", "p2"],
        games,
        currentRound: 1,
        createdAt: "2026-01-29T00:00:00Z",
        startedAt: null,
        finishedAt: null,
      },
    ]

    const calculator = new EloCalculator()
    calculator.computeRatings(tournaments)

    expect(calculator.getGameCount("p1")).toBe(1)
    expect(calculator.getGameCount("p2")).toBe(1)
    expect(calculator.getGameCount("unknown")).toBe(0)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/elo/calculator.test.ts`
Expected: FAIL - modules not found

**Step 3: Implement ELO calculator**

Create `src/elo/calculator.ts`:
```typescript
import type { Tournament, Game } from "../api/types"

const INITIAL_RATING = 1500
const K_FACTOR = 32

export function calculateExpectedScore(
  playerRating: number,
  opponentRating: number
): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400))
}

export function calculateNewRating(
  playerRating: number,
  opponentRating: number,
  won: boolean
): number {
  const expected = calculateExpectedScore(playerRating, opponentRating)
  const actual = won ? 1 : 0
  return Math.round(playerRating + K_FACTOR * (actual - expected))
}

export interface PlayerStats {
  rating: number
  gameCount: number
  previousRating: number
}

export class EloCalculator {
  private ratings: Map<string, number> = new Map()
  private previousRatings: Map<string, number> = new Map()
  private gameCounts: Map<string, number> = new Map()
  private processedGameIds: Set<string> = new Set()

  private ensurePlayer(playerId: string): void {
    if (!this.ratings.has(playerId)) {
      this.ratings.set(playerId, INITIAL_RATING)
      this.previousRatings.set(playerId, INITIAL_RATING)
      this.gameCounts.set(playerId, 0)
    }
  }

  private processGame(game: Game): void {
    if (!game.isComplete || !game.winnerPlayerId) return
    if (this.processedGameIds.has(game.gameId)) return

    this.processedGameIds.add(game.gameId)

    const { playerAId, playerBId, winnerPlayerId } = game

    this.ensurePlayer(playerAId)
    this.ensurePlayer(playerBId)

    const ratingA = this.ratings.get(playerAId)!
    const ratingB = this.ratings.get(playerBId)!

    const aWon = winnerPlayerId === playerAId

    const newRatingA = calculateNewRating(ratingA, ratingB, aWon)
    const newRatingB = calculateNewRating(ratingB, ratingA, !aWon)

    this.ratings.set(playerAId, newRatingA)
    this.ratings.set(playerBId, newRatingB)

    this.gameCounts.set(playerAId, this.gameCounts.get(playerAId)! + 1)
    this.gameCounts.set(playerBId, this.gameCounts.get(playerBId)! + 1)
  }

  computeRatings(tournaments: Tournament[]): Map<string, number> {
    // Store previous ratings before recomputing
    this.previousRatings = new Map(this.ratings)

    // Sort tournaments by creation date
    const sorted = [...tournaments].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    for (const tournament of sorted) {
      for (const game of tournament.games) {
        this.processGame(game)
      }
    }

    return this.ratings
  }

  getRating(playerId: string): number {
    return this.ratings.get(playerId) ?? INITIAL_RATING
  }

  getPreviousRating(playerId: string): number {
    return this.previousRatings.get(playerId) ?? INITIAL_RATING
  }

  getRatingChange(playerId: string): number {
    return this.getRating(playerId) - this.getPreviousRating(playerId)
  }

  getGameCount(playerId: string): number {
    return this.gameCounts.get(playerId) ?? 0
  }

  isProvisional(playerId: string): boolean {
    return this.getGameCount(playerId) < 5
  }

  getStats(playerId: string): PlayerStats {
    return {
      rating: this.getRating(playerId),
      gameCount: this.getGameCount(playerId),
      previousRating: this.getPreviousRating(playerId),
    }
  }

  getAllRatings(): Map<string, number> {
    return new Map(this.ratings)
  }

  getLeaderboard(): Array<{ playerId: string; rating: number; gameCount: number }> {
    return Array.from(this.ratings.entries())
      .map(([playerId, rating]) => ({
        playerId,
        rating,
        gameCount: this.getGameCount(playerId),
      }))
      .sort((a, b) => b.rating - a.rating)
  }
}
```

**Step 4: Run tests**

Run: `bun test src/elo/calculator.test.ts`
Expected: All tests pass

**Step 5: Create barrel export**

Create `src/elo/index.ts`:
```typescript
export * from "./calculator"
```

**Step 6: Commit**

```bash
git add src/elo/
git commit -m "feat: add ELO rating calculator"
```

---

## Task 4: Configuration Management

**Files:**
- Create: `src/config/config.ts`
- Create: `src/config/config.test.ts`

**Step 1: Write failing tests for config**

Create `src/config/config.test.ts`:
```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { Config, DEFAULT_CONFIG } from "./config"
import { unlink, mkdir } from "fs/promises"
import { existsSync } from "fs"

const TEST_CONFIG_PATH = "/tmp/battleship-tui-test/config.json"

describe("Config", () => {
  beforeEach(async () => {
    // Clean up test config
    if (existsSync(TEST_CONFIG_PATH)) {
      await unlink(TEST_CONFIG_PATH)
    }
  })

  afterEach(async () => {
    if (existsSync(TEST_CONFIG_PATH)) {
      await unlink(TEST_CONFIG_PATH)
    }
  })

  test("returns defaults when no config file exists", async () => {
    const config = new Config(TEST_CONFIG_PATH)
    await config.load()

    expect(config.get("pollInterval")).toBe(DEFAULT_CONFIG.pollInterval)
    expect(config.get("favorites")).toEqual([])
  })

  test("saves and loads config", async () => {
    const config = new Config(TEST_CONFIG_PATH)
    await config.load()

    config.set("pollInterval", 20)
    await config.save()

    const config2 = new Config(TEST_CONFIG_PATH)
    await config2.load()

    expect(config2.get("pollInterval")).toBe(20)
  })

  test("toggleFavorite adds and removes players", async () => {
    const config = new Config(TEST_CONFIG_PATH)
    await config.load()

    config.toggleFavorite("player-1")
    expect(config.isFavorite("player-1")).toBe(true)

    config.toggleFavorite("player-1")
    expect(config.isFavorite("player-1")).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/config/config.test.ts`
Expected: FAIL - modules not found

**Step 3: Implement Config class**

Create `src/config/config.ts`:
```typescript
import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname } from "path"
import { homedir } from "os"

export interface ConfigData {
  favorites: string[]
  pollInterval: number
  leaderboardSize: number
  theme: string
}

export const DEFAULT_CONFIG: ConfigData = {
  favorites: [],
  pollInterval: 10,
  leaderboardSize: 20,
  theme: "default",
}

const DEFAULT_CONFIG_PATH = `${homedir()}/.config/battleship-tui/config.json`

export class Config {
  private configPath: string
  private data: ConfigData = { ...DEFAULT_CONFIG }

  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath
  }

  async load(): Promise<void> {
    if (!existsSync(this.configPath)) {
      this.data = { ...DEFAULT_CONFIG }
      return
    }

    try {
      const content = await readFile(this.configPath, "utf-8")
      const parsed = JSON.parse(content)
      this.data = { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      this.data = { ...DEFAULT_CONFIG }
    }
  }

  async save(): Promise<void> {
    const dir = dirname(this.configPath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(this.configPath, JSON.stringify(this.data, null, 2))
  }

  get<K extends keyof ConfigData>(key: K): ConfigData[K] {
    return this.data[key]
  }

  set<K extends keyof ConfigData>(key: K, value: ConfigData[K]): void {
    this.data[key] = value
  }

  isFavorite(playerId: string): boolean {
    return this.data.favorites.includes(playerId)
  }

  toggleFavorite(playerId: string): boolean {
    const index = this.data.favorites.indexOf(playerId)
    if (index === -1) {
      this.data.favorites.push(playerId)
      return true
    } else {
      this.data.favorites.splice(index, 1)
      return false
    }
  }

  adjustPollInterval(delta: number): number {
    const newInterval = Math.max(5, Math.min(60, this.data.pollInterval + delta))
    this.data.pollInterval = newInterval
    return newInterval
  }
}
```

**Step 4: Run tests**

Run: `bun test src/config/config.test.ts`
Expected: All tests pass

**Step 5: Create barrel export**

Create `src/config/index.ts`:
```typescript
export * from "./config"
```

**Step 6: Commit**

```bash
git add src/config/
git commit -m "feat: add configuration management"
```

---

## Task 5: State Store

**Files:**
- Create: `src/state/store.ts`
- Create: `src/state/store.test.ts`

**Step 1: Write failing tests for state store**

Create `src/state/store.test.ts`:
```typescript
import { describe, expect, test } from "bun:test"
import { Store } from "./store"
import type { Player, Tournament } from "../api/types"

describe("Store", () => {
  const mockPlayers: Player[] = [
    {
      playerId: "p1",
      displayName: "TestBot",
      type: "Human",
      isConnected: false,
      createdAt: "2026-01-29T00:00:00Z",
    },
  ]

  const mockTournaments: Tournament[] = [
    {
      tournamentId: "t1",
      name: "Test Tournament",
      state: "FINISHED",
      config: { boardWidth: 10, boardHeight: 10, timeoutSeconds: 30 },
      playerIds: ["p1", "p2"],
      games: [
        {
          gameId: "g1",
          playerAId: "p1",
          playerBId: "p2",
          roundNumber: 1,
          winnerPlayerId: "p1",
          playerAHits: 17,
          playerBHits: 12,
          isComplete: true,
        },
      ],
      currentRound: 1,
      createdAt: "2026-01-29T00:00:00Z",
      startedAt: null,
      finishedAt: null,
    },
  ]

  test("updates state with players and tournaments", () => {
    const store = new Store()
    store.update(mockPlayers, mockTournaments)

    expect(store.getPlayers()).toHaveLength(1)
    expect(store.getTournaments()).toHaveLength(1)
  })

  test("computes leaderboard with ELO ratings", () => {
    const store = new Store()
    store.update(mockPlayers, mockTournaments)

    const leaderboard = store.getLeaderboard()
    expect(leaderboard.length).toBeGreaterThan(0)
    expect(leaderboard[0]).toHaveProperty("rating")
  })

  test("getPlayerName returns display name or unknown", () => {
    const store = new Store()
    store.update(mockPlayers, mockTournaments)

    expect(store.getPlayerName("p1")).toBe("TestBot")
    expect(store.getPlayerName("unknown")).toBe("[Unknown]")
  })

  test("getActiveTournaments filters by state", () => {
    const store = new Store()
    store.update(mockPlayers, mockTournaments)

    const active = store.getActiveTournaments()
    expect(active).toHaveLength(0) // All finished
  })

  test("getLiveGames returns incomplete games", () => {
    const tournamentsWithLive: Tournament[] = [
      {
        ...mockTournaments[0],
        state: "IN_PROGRESS",
        games: [
          {
            gameId: "g1",
            playerAId: "p1",
            playerBId: "p2",
            roundNumber: 1,
            winnerPlayerId: null,
            playerAHits: 5,
            playerBHits: 3,
            isComplete: false,
          },
        ],
      },
    ]

    const store = new Store()
    store.update(mockPlayers, tournamentsWithLive)

    const liveGames = store.getLiveGames("t1")
    expect(liveGames).toHaveLength(1)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/state/store.test.ts`
Expected: FAIL - Store not found

**Step 3: Implement Store**

Create `src/state/store.ts`:
```typescript
import type { Player, Tournament, Game } from "../api/types"
import { EloCalculator } from "../elo/calculator"

export interface LeaderboardEntry {
  playerId: string
  displayName: string
  rating: number
  ratingChange: number
  gameCount: number
  isProvisional: boolean
}

export class Store {
  private players: Map<string, Player> = new Map()
  private tournaments: Tournament[] = []
  private eloCalculator: EloCalculator = new EloCalculator()
  private lastUpdateTime: Date | null = null

  update(players: Player[], tournaments: Tournament[]): void {
    this.players.clear()
    for (const player of players) {
      this.players.set(player.playerId, player)
    }

    this.tournaments = tournaments
    this.eloCalculator.computeRatings(tournaments)
    this.lastUpdateTime = new Date()
  }

  getPlayers(): Player[] {
    return Array.from(this.players.values())
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId)
  }

  getPlayerName(playerId: string): string {
    return this.players.get(playerId)?.displayName ?? "[Unknown]"
  }

  getTournaments(): Tournament[] {
    return this.tournaments
  }

  getTournamentsSorted(): Tournament[] {
    return [...this.tournaments].sort((a, b) => {
      // IN_PROGRESS first, then CREATED, then FINISHED
      const stateOrder = { IN_PROGRESS: 0, CREATED: 1, FINISHED: 2 }
      const stateCompare = stateOrder[a.state] - stateOrder[b.state]
      if (stateCompare !== 0) return stateCompare
      // Then by date descending
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }

  getActiveTournaments(): Tournament[] {
    return this.tournaments.filter((t) => t.state === "IN_PROGRESS")
  }

  getLiveGames(tournamentId: string): Game[] {
    const tournament = this.tournaments.find((t) => t.tournamentId === tournamentId)
    if (!tournament) return []
    return tournament.games.filter((g) => !g.isComplete)
  }

  getLeaderboard(): LeaderboardEntry[] {
    const leaderboard = this.eloCalculator.getLeaderboard()
    return leaderboard.map((entry) => ({
      playerId: entry.playerId,
      displayName: this.getPlayerName(entry.playerId),
      rating: entry.rating,
      ratingChange: this.eloCalculator.getRatingChange(entry.playerId),
      gameCount: entry.gameCount,
      isProvisional: this.eloCalculator.isProvisional(entry.playerId),
    }))
  }

  getLastUpdateTime(): Date | null {
    return this.lastUpdateTime
  }

  getStats(): { playerCount: number; tournamentCount: number; gameCount: number } {
    const gameCount = this.tournaments.reduce((sum, t) => sum + t.games.length, 0)
    return {
      playerCount: this.players.size,
      tournamentCount: this.tournaments.length,
      gameCount,
    }
  }
}
```

**Step 4: Run tests**

Run: `bun test src/state/store.test.ts`
Expected: All tests pass

**Step 5: Create barrel export**

Create `src/state/index.ts`:
```typescript
export * from "./store"
```

**Step 6: Commit**

```bash
git add src/state/
git commit -m "feat: add state store with leaderboard computation"
```

---

## Task 6: Polling Service

**Files:**
- Create: `src/polling/service.ts`
- Create: `src/polling/service.test.ts`

**Step 1: Write failing tests for polling service**

Create `src/polling/service.test.ts`:
```typescript
import { describe, expect, test, mock, beforeEach } from "bun:test"
import { PollingService } from "./service"
import { Store } from "../state/store"
import { Config } from "../config/config"

describe("PollingService", () => {
  test("calls onUpdate when data is fetched", async () => {
    const store = new Store()
    const config = new Config("/tmp/test-config.json")
    await config.load()

    let updateCalled = false
    const service = new PollingService(store, config, {
      onUpdate: () => {
        updateCalled = true
      },
      onError: () => {},
    })

    await service.fetchOnce()
    expect(updateCalled).toBe(true)
  })

  test("calls onError when fetch fails", async () => {
    const store = new Store()
    const config = new Config("/tmp/test-config.json")
    await config.load()

    let errorCalled = false
    const service = new PollingService(store, config, {
      onUpdate: () => {},
      onError: () => {
        errorCalled = true
      },
      baseUrl: "https://invalid.example.com/api/v1", // Will fail
    })

    await service.fetchOnce()
    expect(errorCalled).toBe(true)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun test src/polling/service.test.ts`
Expected: FAIL - PollingService not found

**Step 3: Implement PollingService**

Create `src/polling/service.ts`:
```typescript
import { BattleshipClient } from "../api/client"
import { Store } from "../state/store"
import { Config } from "../config/config"

export interface PollingCallbacks {
  onUpdate: () => void
  onError: (error: Error) => void
  baseUrl?: string
}

export class PollingService {
  private client: BattleshipClient
  private store: Store
  private config: Config
  private callbacks: PollingCallbacks
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isPolling = false
  private consecutiveErrors = 0
  private maxBackoff = 60000 // 60 seconds

  constructor(store: Store, config: Config, callbacks: PollingCallbacks) {
    this.client = new BattleshipClient(callbacks.baseUrl)
    this.store = store
    this.config = config
    this.callbacks = callbacks
  }

  async fetchOnce(): Promise<boolean> {
    try {
      const { players, tournaments } = await this.client.fetchAll()
      this.store.update(players, tournaments)
      this.consecutiveErrors = 0
      this.callbacks.onUpdate()
      return true
    } catch (error) {
      this.consecutiveErrors++
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  private getBackoffInterval(): number {
    const baseInterval = this.config.get("pollInterval") * 1000
    if (this.consecutiveErrors === 0) return baseInterval

    // Exponential backoff: base * 2^errors, capped at maxBackoff
    const backoff = Math.min(
      baseInterval * Math.pow(2, this.consecutiveErrors),
      this.maxBackoff
    )
    return backoff
  }

  start(): void {
    if (this.isPolling) return
    this.isPolling = true
    this.scheduleNext()
  }

  private scheduleNext(): void {
    if (!this.isPolling) return

    const interval = this.getBackoffInterval()
    this.intervalId = setTimeout(async () => {
      await this.fetchOnce()
      this.scheduleNext()
    }, interval)
  }

  stop(): void {
    this.isPolling = false
    if (this.intervalId) {
      clearTimeout(this.intervalId)
      this.intervalId = null
    }
  }

  isActive(): boolean {
    return this.isPolling
  }

  getConsecutiveErrors(): number {
    return this.consecutiveErrors
  }
}
```

**Step 4: Run tests**

Run: `bun test src/polling/service.test.ts`
Expected: All tests pass

**Step 5: Create barrel export**

Create `src/polling/index.ts`:
```typescript
export * from "./service"
```

**Step 6: Commit**

```bash
git add src/polling/
git commit -m "feat: add polling service with exponential backoff"
```

---

## Task 7: UI Components - Leaderboard Pane

**Files:**
- Create: `src/ui/components/leaderboard.ts`

**Step 1: Create leaderboard component**

Create `src/ui/components/leaderboard.ts`:
```typescript
import type { BoxRenderable, TextRenderable, Renderer } from "@opentui/core"
import type { LeaderboardEntry } from "../../state/store"
import type { Config } from "../../config/config"

export interface LeaderboardProps {
  renderer: Renderer
  entries: LeaderboardEntry[]
  config: Config
  selectedIndex: number
  x: number
  y: number
  width: number
  height: number
}

export function formatRatingChange(change: number): string {
  if (change > 0) return `▲${change}`
  if (change < 0) return `▼${Math.abs(change)}`
  return "━"
}

export function getRatingChangeColor(change: number): string {
  if (change > 0) return "#22c55e" // green
  if (change < 0) return "#ef4444" // red
  return "#6b7280" // gray
}

export function createLeaderboardContent(
  entries: LeaderboardEntry[],
  config: Config,
  selectedIndex: number,
  maxEntries: number
): string[] {
  const lines: string[] = []
  lines.push("🏆 LEADERBOARD")
  lines.push("─".repeat(30))

  const displayEntries = entries.slice(0, maxEntries)

  for (let i = 0; i < displayEntries.length; i++) {
    const entry = displayEntries[i]
    const rank = (i + 1).toString().padStart(2, " ")
    const favorite = config.isFavorite(entry.playerId) ? "⭐" : "  "
    const name = entry.displayName.slice(0, 16).padEnd(16, " ")
    const rating = entry.rating.toString().padStart(4, " ")
    const change = formatRatingChange(entry.ratingChange)
    const provisional = entry.isProvisional ? "*" : " "
    const selected = i === selectedIndex ? ">" : " "

    lines.push(`${selected}${rank}. ${favorite} ${name} ${rating}${provisional} ${change}`)
  }

  return lines
}
```

**Step 2: Commit**

```bash
git add src/ui/components/leaderboard.ts
git commit -m "feat: add leaderboard UI component"
```

---

## Task 8: UI Components - Tournament Pane

**Files:**
- Create: `src/ui/components/tournaments.ts`

**Step 1: Create tournament component**

Create `src/ui/components/tournaments.ts`:
```typescript
import type { Tournament, Game } from "../../api/types"
import type { Store } from "../../state/store"

export function getTournamentStateEmoji(state: Tournament["state"]): string {
  switch (state) {
    case "IN_PROGRESS":
      return "🔴"
    case "FINISHED":
      return "🏁"
    case "CREATED":
      return "⚪"
  }
}

export function getTournamentStateColor(state: Tournament["state"]): string {
  switch (state) {
    case "IN_PROGRESS":
      return "#eab308" // yellow
    case "FINISHED":
      return "#6b7280" // gray
    case "CREATED":
      return "#06b6d4" // cyan
  }
}

export function createTournamentContent(
  tournaments: Tournament[],
  selectedIndex: number,
  maxEntries: number
): string[] {
  const lines: string[] = []
  lines.push("📋 TOURNAMENTS")
  lines.push("─".repeat(34))

  const displayTournaments = tournaments.slice(0, maxEntries)

  for (let i = 0; i < displayTournaments.length; i++) {
    const t = displayTournaments[i]
    const emoji = getTournamentStateEmoji(t.state)
    const name = t.name.slice(0, 20).padEnd(20, " ")
    const state = t.state.padEnd(11, " ")
    const selected = i === selectedIndex ? ">" : " "

    lines.push(`${selected}${emoji} ${name} ${state}`)

    const playerCount = t.playerIds.length
    const gameCount = t.games.length
    const roundInfo =
      t.state === "IN_PROGRESS"
        ? `📍 Round ${t.currentRound}`
        : t.state === "CREATED"
          ? "⏳ Not started"
          : `🎮 ${gameCount} games`

    lines.push(`    👥 ${playerCount}  ·  ${roundInfo}`)
  }

  return lines
}

export function createLiveGamesContent(
  games: Game[],
  store: Store,
  maxEntries: number
): string[] {
  const lines: string[] = []
  lines.push("⚔️  LIVE GAMES")
  lines.push("─".repeat(34))

  if (games.length === 0) {
    lines.push("  No active games")
    return lines
  }

  const displayGames = games.slice(0, maxEntries)

  for (const game of displayGames) {
    const playerA = store.getPlayerName(game.playerAId).slice(0, 12)
    const playerB = store.getPlayerName(game.playerBId).slice(0, 12)

    lines.push(`  ${playerA} vs ${playerB}`)

    const total = game.playerAHits + game.playerBHits
    const progressA = total > 0 ? Math.round((game.playerAHits / 17) * 10) : 0
    const bar = "▓".repeat(progressA) + "░".repeat(10 - progressA)

    lines.push(`     💥 ${game.playerAHits} - ${game.playerBHits}  ${bar}`)
  }

  return lines
}
```

**Step 2: Commit**

```bash
git add src/ui/components/tournaments.ts
git commit -m "feat: add tournament and live games UI components"
```

---

## Task 9: UI Components - Status Bar and Header

**Files:**
- Create: `src/ui/components/header.ts`
- Create: `src/ui/components/footer.ts`

**Step 1: Create header component**

Create `src/ui/components/header.ts`:
```typescript
export function createHeader(pollInterval: number, isError: boolean): string {
  const errorIndicator = isError ? "⚠️ " : ""
  return `🚢 BATTLESHIP TOURNAMENT MONITOR                    ${errorIndicator}⏱️ Auto: ${pollInterval}s  🔄`
}
```

**Step 2: Create footer component**

Create `src/ui/components/footer.ts`:
```typescript
export function createFooter(): string {
  return "↑↓ Navigate  ⇥ Switch pane  ⏎ Details  ★ Toggle fav  r Refresh  +/- Interval  q Quit"
}
```

**Step 3: Create barrel export for components**

Create `src/ui/components/index.ts`:
```typescript
export * from "./leaderboard"
export * from "./tournaments"
export * from "./header"
export * from "./footer"
```

**Step 4: Commit**

```bash
git add src/ui/components/
git commit -m "feat: add header and footer UI components"
```

---

## Task 10: Main Application

**Files:**
- Create: `src/ui/app.ts`
- Modify: `src/index.ts`

**Step 1: Create main app**

Create `src/ui/app.ts`:
```typescript
import { Renderer, BoxRenderable, TextRenderable } from "@opentui/core"
import { Store } from "../state/store"
import { Config } from "../config/config"
import { PollingService } from "../polling/service"
import {
  createLeaderboardContent,
  createTournamentContent,
  createLiveGamesContent,
  createHeader,
  createFooter,
} from "./components"

type Pane = "leaderboard" | "tournaments"

export class App {
  private renderer!: Renderer
  private store: Store
  private config: Config
  private polling!: PollingService
  private activePane: Pane = "tournaments"
  private leaderboardIndex = 0
  private tournamentIndex = 0
  private isError = false
  private isRunning = false

  // Renderables
  private headerText!: TextRenderable
  private leaderboardBox!: BoxRenderable
  private leaderboardText!: TextRenderable
  private tournamentsBox!: BoxRenderable
  private tournamentsText!: TextRenderable
  private liveGamesBox!: BoxRenderable
  private liveGamesText!: TextRenderable
  private footerText!: TextRenderable

  constructor(store: Store, config: Config) {
    this.store = store
    this.config = config
  }

  async init(): Promise<void> {
    this.renderer = new Renderer({
      fps: 30,
    })

    await this.renderer.start()

    this.setupLayout()
    this.setupInput()
    this.setupPolling()

    // Initial fetch
    console.log("🚢 Battleship TUI v0.1.0")
    console.log("   Fetching data...")
    await this.polling.fetchOnce()
    console.log("   Ready!")

    this.isRunning = true
    this.polling.start()
    this.render()
  }

  private setupLayout(): void {
    const { width, height } = this.renderer.size

    // Header
    this.headerText = new TextRenderable(this.renderer, {
      id: "header",
      position: "absolute",
      left: 0,
      top: 0,
      width,
      height: 1,
      backgroundColor: "#0891b2",
      color: "#ffffff",
    })
    this.renderer.root.add(this.headerText)

    // Leaderboard pane (left, 40%)
    const leaderboardWidth = Math.floor(width * 0.4)
    this.leaderboardBox = new BoxRenderable(this.renderer, {
      id: "leaderboard-box",
      position: "absolute",
      left: 0,
      top: 1,
      width: leaderboardWidth,
      height: height - 3,
      borderStyle: "single",
      borderColor: "#4b5563",
    })
    this.renderer.root.add(this.leaderboardBox)

    this.leaderboardText = new TextRenderable(this.renderer, {
      id: "leaderboard-text",
      position: "absolute",
      left: 1,
      top: 0,
      width: leaderboardWidth - 2,
      height: height - 5,
    })
    this.leaderboardBox.add(this.leaderboardText)

    // Tournaments pane (right top, 60%)
    const tournamentsWidth = width - leaderboardWidth
    const tournamentsHeight = Math.floor((height - 3) * 0.6)
    this.tournamentsBox = new BoxRenderable(this.renderer, {
      id: "tournaments-box",
      position: "absolute",
      left: leaderboardWidth,
      top: 1,
      width: tournamentsWidth,
      height: tournamentsHeight,
      borderStyle: "single",
      borderColor: "#4b5563",
    })
    this.renderer.root.add(this.tournamentsBox)

    this.tournamentsText = new TextRenderable(this.renderer, {
      id: "tournaments-text",
      position: "absolute",
      left: 1,
      top: 0,
      width: tournamentsWidth - 2,
      height: tournamentsHeight - 2,
    })
    this.tournamentsBox.add(this.tournamentsText)

    // Live games pane (right bottom)
    const liveGamesHeight = height - 3 - tournamentsHeight
    this.liveGamesBox = new BoxRenderable(this.renderer, {
      id: "live-games-box",
      position: "absolute",
      left: leaderboardWidth,
      top: 1 + tournamentsHeight,
      width: tournamentsWidth,
      height: liveGamesHeight,
      borderStyle: "single",
      borderColor: "#4b5563",
    })
    this.renderer.root.add(this.liveGamesBox)

    this.liveGamesText = new TextRenderable(this.renderer, {
      id: "live-games-text",
      position: "absolute",
      left: 1,
      top: 0,
      width: tournamentsWidth - 2,
      height: liveGamesHeight - 2,
    })
    this.liveGamesBox.add(this.liveGamesText)

    // Footer
    this.footerText = new TextRenderable(this.renderer, {
      id: "footer",
      position: "absolute",
      left: 0,
      top: height - 1,
      width,
      height: 1,
      backgroundColor: "#1f2937",
      color: "#9ca3af",
    })
    this.renderer.root.add(this.footerText)
  }

  private setupInput(): void {
    this.renderer.on("keypress", async (key: string) => {
      switch (key) {
        case "q":
        case "\x03": // Ctrl+C
          await this.quit()
          break
        case "\t": // Tab
          this.activePane = this.activePane === "leaderboard" ? "tournaments" : "leaderboard"
          break
        case "up":
        case "k":
          this.moveSelection(-1)
          break
        case "down":
        case "j":
          this.moveSelection(1)
          break
        case "f":
          this.toggleFavorite()
          break
        case "r":
          await this.polling.fetchOnce()
          break
        case "+":
        case "=":
          this.config.adjustPollInterval(5)
          await this.config.save()
          break
        case "-":
          this.config.adjustPollInterval(-5)
          await this.config.save()
          break
      }
      this.render()
    })
  }

  private moveSelection(delta: number): void {
    if (this.activePane === "leaderboard") {
      const max = Math.min(this.store.getLeaderboard().length - 1, this.config.get("leaderboardSize") - 1)
      this.leaderboardIndex = Math.max(0, Math.min(max, this.leaderboardIndex + delta))
    } else {
      const max = this.store.getTournamentsSorted().length - 1
      this.tournamentIndex = Math.max(0, Math.min(max, this.tournamentIndex + delta))
    }
  }

  private toggleFavorite(): void {
    if (this.activePane !== "leaderboard") return
    const leaderboard = this.store.getLeaderboard()
    const entry = leaderboard[this.leaderboardIndex]
    if (entry) {
      this.config.toggleFavorite(entry.playerId)
      this.config.save()
    }
  }

  private setupPolling(): void {
    this.polling = new PollingService(this.store, this.config, {
      onUpdate: () => {
        this.isError = false
        this.render()
      },
      onError: () => {
        this.isError = true
        this.render()
      },
    })
  }

  private render(): void {
    if (!this.isRunning) return

    // Header
    this.headerText.text = createHeader(this.config.get("pollInterval"), this.isError)

    // Leaderboard
    const leaderboard = this.store.getLeaderboard()
    const leaderboardLines = createLeaderboardContent(
      leaderboard,
      this.config,
      this.activePane === "leaderboard" ? this.leaderboardIndex : -1,
      this.config.get("leaderboardSize")
    )
    this.leaderboardText.text = leaderboardLines.join("\n")
    this.leaderboardBox.borderColor = this.activePane === "leaderboard" ? "#06b6d4" : "#4b5563"

    // Tournaments
    const tournaments = this.store.getTournamentsSorted()
    const tournamentLines = createTournamentContent(
      tournaments,
      this.activePane === "tournaments" ? this.tournamentIndex : -1,
      10
    )
    this.tournamentsText.text = tournamentLines.join("\n")
    this.tournamentsBox.borderColor = this.activePane === "tournaments" ? "#06b6d4" : "#4b5563"

    // Live games for selected tournament
    const selectedTournament = tournaments[this.tournamentIndex]
    const liveGames = selectedTournament
      ? this.store.getLiveGames(selectedTournament.tournamentId)
      : []
    const liveGamesLines = createLiveGamesContent(liveGames, this.store, 5)
    this.liveGamesText.text = liveGamesLines.join("\n")

    // Footer
    this.footerText.text = createFooter()
  }

  private async quit(): Promise<void> {
    this.isRunning = false
    this.polling.stop()
    await this.renderer.stop()
    process.exit(0)
  }
}
```

**Step 2: Update entry point**

Replace `src/index.ts`:
```typescript
import { Store } from "./state/store"
import { Config } from "./config/config"
import { App } from "./ui/app"

async function main() {
  const store = new Store()
  const config = new Config()
  await config.load()

  const app = new App(store, config)
  await app.init()
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
```

**Step 3: Create UI barrel export**

Create `src/ui/index.ts`:
```typescript
export * from "./app"
export * from "./components"
```

**Step 4: Verify it compiles**

Run: `bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add src/ui/ src/index.ts
git commit -m "feat: add main application with TUI layout"
```

---

## Task 11: Integration Testing and Polish

**Files:**
- Create: `src/app.test.ts`

**Step 1: Write integration test**

Create `src/app.test.ts`:
```typescript
import { describe, expect, test } from "bun:test"
import { Store } from "./state/store"
import { Config } from "./config/config"
import { BattleshipClient } from "./api/client"
import { EloCalculator } from "./elo/calculator"

describe("Integration", () => {
  test("full data flow from API to leaderboard", async () => {
    const client = new BattleshipClient()
    const store = new Store()

    const { players, tournaments } = await client.fetchAll()

    expect(players.length).toBeGreaterThan(0)
    expect(tournaments.length).toBeGreaterThan(0)

    store.update(players, tournaments)

    const leaderboard = store.getLeaderboard()
    expect(leaderboard.length).toBeGreaterThan(0)

    // Top player should have highest rating
    for (let i = 1; i < leaderboard.length; i++) {
      expect(leaderboard[i - 1].rating).toBeGreaterThanOrEqual(leaderboard[i].rating)
    }
  })

  test("config persists favorites", async () => {
    const configPath = "/tmp/battleship-tui-integration-test.json"
    const config = new Config(configPath)
    await config.load()

    config.toggleFavorite("test-player-id")
    await config.save()

    const config2 = new Config(configPath)
    await config2.load()

    expect(config2.isFavorite("test-player-id")).toBe(true)
  })
})
```

**Step 2: Run all tests**

Run: `bun test`
Expected: All tests pass

**Step 3: Test the application manually**

Run: `bun run start`
Expected: TUI launches, shows tournaments and leaderboard

**Step 4: Final commit**

```bash
git add src/app.test.ts
git commit -m "feat: add integration tests"
```

---

## Task 12: README and Final Polish

**Files:**
- Create: `README.md`

**Step 1: Create README**

Create `README.md`:
```markdown
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
```

**Step 2: Final commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Summary

| Task | Description |
|------|-------------|
| 0 | Project setup with bun and opentui |
| 1 | API type definitions |
| 2 | HTTP client for battleship API |
| 3 | ELO rating calculator |
| 4 | Configuration management |
| 5 | State store with leaderboard |
| 6 | Polling service with backoff |
| 7 | Leaderboard UI component |
| 8 | Tournament UI component |
| 9 | Header and footer components |
| 10 | Main application assembly |
| 11 | Integration testing |
| 12 | README and polish |
