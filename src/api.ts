// Types
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

export interface Tournament {
  tournamentId: string
  name: string
  state: "CREATED" | "IN_PROGRESS" | "FINISHED"
  config: { boardWidth: number; boardHeight: number; timeoutSeconds: number }
  playerIds: string[]
  games: Game[]
  currentRound: number
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

// API Client with smart player caching
const API_BASE = "https://battleships.devrel.hny.wtf/api/v1"
const PLAYER_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export class ApiClient {
  private baseUrl: string
  private cachedPlayers: Player[] = []
  private knownPlayerIds = new Set<string>()
  private lastPlayerFetch = 0

  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl
  }

  private async fetchPlayers(): Promise<Player[]> {
    const response = await fetch(`${this.baseUrl}/players`)
    if (!response.ok) throw new Error(`Failed to fetch players: ${response.status}`)
    return response.json()
  }

  private async fetchTournaments(): Promise<Tournament[]> {
    const response = await fetch(`${this.baseUrl}/tournaments`)
    if (!response.ok) throw new Error(`Failed to fetch tournaments: ${response.status}`)
    return response.json()
  }

  async fetchAll(): Promise<{ players: Player[]; tournaments: Tournament[] }> {
    const tournaments = await this.fetchTournaments()

    // Check if we need to refetch players
    const now = Date.now()
    const cacheExpired = now - this.lastPlayerFetch > PLAYER_CACHE_TTL
    const newPlayerIds = this.findNewPlayerIds(tournaments)

    if (cacheExpired || newPlayerIds.length > 0 || this.cachedPlayers.length === 0) {
      this.cachedPlayers = await this.fetchPlayers()
      this.lastPlayerFetch = now
      this.knownPlayerIds = new Set(this.cachedPlayers.map(p => p.playerId))
    }

    return { players: this.cachedPlayers, tournaments }
  }

  private findNewPlayerIds(tournaments: Tournament[]): string[] {
    const newIds: string[] = []
    for (const t of tournaments) {
      // Check tournament player IDs
      for (const id of t.playerIds) {
        if (!this.knownPlayerIds.has(id)) {
          newIds.push(id)
        }
      }
      // Also check player IDs from games (in case players left tournament)
      for (const game of t.games) {
        if (!this.knownPlayerIds.has(game.playerAId)) {
          newIds.push(game.playerAId)
        }
        if (!this.knownPlayerIds.has(game.playerBId)) {
          newIds.push(game.playerBId)
        }
      }
    }
    return newIds
  }
}
