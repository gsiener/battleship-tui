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
      const stateOrder: Record<Tournament["state"], number> = { IN_PROGRESS: 0, CREATED: 1, FINISHED: 2 }
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
