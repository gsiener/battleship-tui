import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname } from "path"
import { homedir } from "os"
import type { Player, Tournament, Game } from "./api"

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
}

export class Store {
  private players = new Map<string, Player>()
  private tournaments: Tournament[] = []
  private elo = new EloCalculator()

  // Cached values - invalidated on update
  private _leaderboardCache: LeaderboardEntry[] | null = null
  private _tournamentCache: Tournament[] | null = null

  update(players: Player[], tournaments: Tournament[]): void {
    // Update players
    this.players.clear()
    for (const p of players) this.players.set(p.playerId, p)

    // Update tournaments
    this.tournaments = tournaments

    // Process ELO (incremental - only new games)
    const changed = this.elo.processNewGames(tournaments)

    // Invalidate caches
    if (changed) this._leaderboardCache = null
    this._tournamentCache = null
  }

  getPlayerName(playerId: string): string {
    return this.players.get(playerId)?.displayName ?? "[Unknown]"
  }

  // Cached and sorted by ELO descending
  getLeaderboard(): LeaderboardEntry[] {
    if (this._leaderboardCache) return this._leaderboardCache

    const entries: LeaderboardEntry[] = []
    for (const playerId of this.elo.getAllPlayerIds()) {
      entries.push({
        playerId,
        displayName: this.getPlayerName(playerId),
        rating: this.elo.getRating(playerId),
        ratingChange: this.elo.getRatingChange(playerId),
        gameCount: this.elo.getGameCount(playerId),
        isProvisional: this.elo.isProvisional(playerId),
      })
    }

    entries.sort((a, b) => b.rating - a.rating)
    this._leaderboardCache = entries
    return entries
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
