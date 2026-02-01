import { existsSync, watch, type FSWatcher } from "fs"
import { mkdir, readFile, writeFile, open } from "fs/promises"
import { dirname } from "path"
import { homedir } from "os"
import type { Player, Tournament, Game } from "./api"

// ============ Bot Event Log Types ============

export type BotEvent =
  | { event: "game_start"; gameId: string; opponentId: string; timestamp: string }
  | { event: "shot_fired"; gameId: string; coordinate: string; timestamp: string }
  | { event: "shot_result"; gameId: string; coordinate: string; hit: boolean; sunk: string | null; timestamp: string }
  | { event: "opponent_shot"; gameId: string; coordinate: string; hit: boolean; timestamp: string }
  | { event: "game_end"; gameId: string; won: boolean; turns: number; timestamp: string }

export type ShotResult = "miss" | "hit" | "sunk"

export interface GameBoard {
  gameId: string
  opponentId: string
  yourShots: Map<string, ShotResult>
  opponentShots: Map<string, "miss" | "hit">
  turnCount: number
  status: "live" | "won" | "lost"
}

const BOT_LOG_PATH = `${homedir()}/.local/share/battleship-bot/game-events.jsonl`

export class LogWatcher {
  private watcher: FSWatcher | null = null
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private filePosition = 0
  private onUpdate: () => void
  private currentGame: GameBoard | null = null
  private lastCompletedGame: GameBoard | null = null
  private pendingShot: string | null = null

  constructor(onUpdate: () => void) {
    this.onUpdate = onUpdate
  }

  async start(): Promise<void> {
    await this.readNewLines()

    if (existsSync(BOT_LOG_PATH)) {
      this.watcher = watch(BOT_LOG_PATH, async () => {
        await this.readNewLines()
      })
    } else {
      this.checkInterval = setInterval(async () => {
        if (existsSync(BOT_LOG_PATH)) {
          if (this.checkInterval) {
            clearInterval(this.checkInterval)
            this.checkInterval = null
          }
          await this.readNewLines()
          this.watcher = watch(BOT_LOG_PATH, async () => {
            await this.readNewLines()
          })
        }
      }, 2000)
    }
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
  }

  private async readNewLines(): Promise<void> {
    if (!existsSync(BOT_LOG_PATH)) return

    try {
      const handle = await open(BOT_LOG_PATH, "r")
      const stats = await handle.stat()

      if (stats.size < this.filePosition) {
        this.filePosition = 0
        this.currentGame = null
        this.pendingShot = null
      }

      if (stats.size > this.filePosition) {
        const buffer = Buffer.alloc(stats.size - this.filePosition)
        await handle.read(buffer, 0, buffer.length, this.filePosition)
        this.filePosition = stats.size

        const lines = buffer.toString("utf-8").split("\n").filter(l => l.trim())
        let changed = false

        for (const line of lines) {
          try {
            const event = JSON.parse(line) as BotEvent
            if (this.processEvent(event)) changed = true
          } catch {
            // Skip malformed lines
          }
        }

        if (changed) this.onUpdate()
      }

      await handle.close()
    } catch {
      // File access error - ignore
    }
  }

  private processEvent(event: BotEvent): boolean {
    switch (event.event) {
      case "game_start":
        this.currentGame = {
          gameId: event.gameId,
          opponentId: event.opponentId,
          yourShots: new Map(),
          opponentShots: new Map(),
          turnCount: 0,
          status: "live",
        }
        this.pendingShot = null
        return true

      case "shot_fired":
        if (this.currentGame && this.currentGame.gameId === event.gameId) {
          this.pendingShot = event.coordinate
          this.currentGame.turnCount++
          return true
        }
        return false

      case "shot_result":
        if (this.currentGame && this.currentGame.gameId === event.gameId) {
          const coord = event.coordinate
          const result: ShotResult = event.sunk ? "sunk" : event.hit ? "hit" : "miss"
          this.currentGame.yourShots.set(coord, result)
          this.pendingShot = null
          return true
        }
        return false

      case "opponent_shot":
        if (this.currentGame && this.currentGame.gameId === event.gameId) {
          this.currentGame.opponentShots.set(event.coordinate, event.hit ? "hit" : "miss")
          return true
        }
        return false

      case "game_end":
        if (this.currentGame && this.currentGame.gameId === event.gameId) {
          this.currentGame.status = event.won ? "won" : "lost"
          this.currentGame.turnCount = event.turns
          this.lastCompletedGame = this.currentGame
          this.currentGame = null
          this.pendingShot = null
          return true
        }
        return false
    }
    return false
  }

  getGameBoard(): GameBoard | null {
    return this.currentGame ?? this.lastCompletedGame
  }

  isGameActive(): boolean {
    return this.currentGame !== null
  }
}

// ============ Player Name Cache (Persistent) ============

const PLAYER_CACHE_PATH = `${homedir()}/.config/battleship-tui/player-cache.json`

export class PlayerNameCache {
  private cache = new Map<string, string>()

  async load(): Promise<void> {
    if (!existsSync(PLAYER_CACHE_PATH)) return
    try {
      const content = await readFile(PLAYER_CACHE_PATH, "utf-8")
      const data = JSON.parse(content) as Record<string, string>
      this.cache = new Map(Object.entries(data))
    } catch {
      // Ignore errors, start with empty cache
    }
  }

  async save(): Promise<void> {
    const dir = dirname(PLAYER_CACHE_PATH)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    const data = Object.fromEntries(this.cache)
    await writeFile(PLAYER_CACHE_PATH, JSON.stringify(data, null, 2))
  }

  update(players: Player[]): boolean {
    let changed = false
    for (const p of players) {
      if (!this.cache.has(p.playerId)) {
        this.cache.set(p.playerId, p.displayName)
        changed = true
      }
    }
    return changed
  }

  getName(playerId: string): string | undefined {
    return this.cache.get(playerId)
  }
}

// ============ Config ============

export interface ConfigData {
  favorites: string[]
  pollInterval: number
  leaderboardSize: number
}

const DEFAULT_CONFIG: ConfigData = {
  favorites: [],
  pollInterval: 10,
  leaderboardSize: 20,
}

const CONFIG_PATH = `${homedir()}/.config/battleship-tui/config.json`

export class Config {
  private data: ConfigData = { ...DEFAULT_CONFIG }

  async load(): Promise<void> {
    if (!existsSync(CONFIG_PATH)) return
    try {
      const content = await readFile(CONFIG_PATH, "utf-8")
      this.data = { ...DEFAULT_CONFIG, ...JSON.parse(content) }
    } catch {
      // Use defaults on error
    }
  }

  async save(): Promise<void> {
    const dir = dirname(CONFIG_PATH)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(CONFIG_PATH, JSON.stringify(this.data, null, 2))
  }

  get<K extends keyof ConfigData>(key: K): ConfigData[K] {
    return this.data[key]
  }

  isFavorite(playerId: string): boolean {
    return this.data.favorites.includes(playerId)
  }

  toggleFavorite(playerId: string): void {
    const idx = this.data.favorites.indexOf(playerId)
    if (idx === -1) this.data.favorites.push(playerId)
    else this.data.favorites.splice(idx, 1)
  }

  adjustPollInterval(delta: number): number {
    this.data.pollInterval = Math.max(5, Math.min(60, this.data.pollInterval + delta))
    return this.data.pollInterval
  }
}

// ============ ELO Calculator (Incremental) ============

const INITIAL_RATING = 1500
const K_FACTOR = 32

function expectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400))
}

function newRating(rating: number, oppRating: number, won: boolean): number {
  const expected = expectedScore(rating, oppRating)
  return Math.round(rating + K_FACTOR * ((won ? 1 : 0) - expected))
}

class EloCalculator {
  private ratings = new Map<string, number>()
  private previousRatings = new Map<string, number>()
  private gameCounts = new Map<string, number>()
  private processedGameIds = new Set<string>()
  private lastGameCount = 0

  // Returns true if ratings changed
  processNewGames(tournaments: Tournament[]): boolean {
    // Quick check: count total games
    let totalGames = 0
    for (const t of tournaments) totalGames += t.games.length
    if (totalGames === this.lastGameCount) return false

    // Store previous ratings for change calculation
    this.previousRatings = new Map(this.ratings)

    // Sort tournaments by creation date for consistent ordering
    const sorted = tournaments.slice().sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    let processed = 0
    for (const tournament of sorted) {
      for (const game of tournament.games) {
        if (this.processGame(game)) processed++
      }
    }

    this.lastGameCount = totalGames
    return processed > 0
  }

  private processGame(game: Game): boolean {
    if (!game.isComplete || !game.winnerPlayerId) return false
    if (this.processedGameIds.has(game.gameId)) return false

    this.processedGameIds.add(game.gameId)

    const { playerAId, playerBId, winnerPlayerId } = game

    // Ensure both players exist
    if (!this.ratings.has(playerAId)) {
      this.ratings.set(playerAId, INITIAL_RATING)
      this.gameCounts.set(playerAId, 0)
    }
    if (!this.ratings.has(playerBId)) {
      this.ratings.set(playerBId, INITIAL_RATING)
      this.gameCounts.set(playerBId, 0)
    }

    const rA = this.ratings.get(playerAId)!
    const rB = this.ratings.get(playerBId)!
    const aWon = winnerPlayerId === playerAId

    this.ratings.set(playerAId, newRating(rA, rB, aWon))
    this.ratings.set(playerBId, newRating(rB, rA, !aWon))
    this.gameCounts.set(playerAId, this.gameCounts.get(playerAId)! + 1)
    this.gameCounts.set(playerBId, this.gameCounts.get(playerBId)! + 1)

    return true
  }

  getRating(playerId: string): number {
    return this.ratings.get(playerId) ?? INITIAL_RATING
  }

  getRatingChange(playerId: string): number {
    const current = this.ratings.get(playerId) ?? INITIAL_RATING
    const previous = this.previousRatings.get(playerId) ?? INITIAL_RATING
    return current - previous
  }

  getGameCount(playerId: string): number {
    return this.gameCounts.get(playerId) ?? 0
  }

  isProvisional(playerId: string): boolean {
    return this.getGameCount(playerId) < 5
  }

  getAllPlayerIds(): string[] {
    return Array.from(this.ratings.keys())
  }
}

// ============ Store (with caching) ============

export interface LeaderboardEntry {
  playerId: string
  displayName: string
  rating: number
  ratingChange: number
  gameCount: number
  isProvisional: boolean
  isOnline: boolean
}

export class Store {
  private players = new Map<string, Player>()
  private tournaments: Tournament[] = []
  private elo = new EloCalculator()
  private playerNameCache: PlayerNameCache

  // Cached values - invalidated on update
  private _leaderboardCache: LeaderboardEntry[] | null = null
  private _tournamentCache: Tournament[] | null = null

  constructor(playerNameCache: PlayerNameCache) {
    this.playerNameCache = playerNameCache
  }

  async update(players: Player[], tournaments: Tournament[]): Promise<void> {
    // Update players
    this.players.clear()
    for (const p of players) this.players.set(p.playerId, p)

    // Update persistent name cache
    if (this.playerNameCache.update(players)) {
      await this.playerNameCache.save()
    }

    // Update tournaments
    this.tournaments = tournaments

    // Process ELO (incremental - only new games)
    this.elo.processNewGames(tournaments)

    // Always invalidate caches - online status may have changed
    this._leaderboardCache = null
    this._tournamentCache = null
  }

  getPlayerName(playerId: string): string {
    // Try current players first
    const current = this.players.get(playerId)?.displayName
    if (current) return current

    // Fall back to persistent cache
    return this.playerNameCache.getName(playerId) ?? "[Unknown]"
  }

  // Cached and sorted by ELO descending
  getLeaderboard(): LeaderboardEntry[] {
    if (this._leaderboardCache) return this._leaderboardCache

    const entries: LeaderboardEntry[] = []
    for (const playerId of this.elo.getAllPlayerIds()) {
      const player = this.players.get(playerId)
      entries.push({
        playerId,
        displayName: this.getPlayerName(playerId),
        rating: this.elo.getRating(playerId),
        ratingChange: this.elo.getRatingChange(playerId),
        gameCount: this.elo.getGameCount(playerId),
        isProvisional: this.elo.isProvisional(playerId),
        isOnline: player?.isConnected ?? false,
      })
    }

    entries.sort((a, b) => b.rating - a.rating)
    this._leaderboardCache = entries
    return entries
  }

  getOnlineCount(): number {
    let count = 0
    for (const player of this.players.values()) {
      if (player.isConnected) count++
    }
    return count
  }

  // Cached and sorted: IN_PROGRESS first, then by date
  // Filters out IN_PROGRESS tournaments with no live games
  getTournamentsSorted(): Tournament[] {
    if (this._tournamentCache) return this._tournamentCache

    const stateOrder = { IN_PROGRESS: 0, CREATED: 1, FINISHED: 2 } as const
    const filtered = this.tournaments.filter(t => {
      // Hide IN_PROGRESS tournaments with no live (incomplete) games
      if (t.state === "IN_PROGRESS") {
        return t.games.some(g => !g.isComplete)
      }
      return true
    })

    const sorted = filtered.sort((a, b) => {
      const stateCompare = stateOrder[a.state] - stateOrder[b.state]
      if (stateCompare !== 0) return stateCompare
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

    this._tournamentCache = sorted
    return sorted
  }

  getLiveGames(tournamentId: string): Game[] {
    const t = this.tournaments.find(t => t.tournamentId === tournamentId)
    return t ? t.games.filter(g => !g.isComplete) : []
  }

  // Get most recent completed games for a tournament
  getRecentGames(tournamentId: string, limit: number): Game[] {
    const t = this.tournaments.find(t => t.tournamentId === tournamentId)
    if (!t) return []
    // Games are typically in order, take last N completed
    const completed = t.games.filter(g => g.isComplete && g.winnerPlayerId)
    return completed.slice(-limit).reverse()
  }

  getStats() {
    let gameCount = 0
    for (const t of this.tournaments) gameCount += t.games.length
    return {
      playerCount: this.players.size,
      tournamentCount: this.tournaments.length,
      gameCount,
    }
  }
}
