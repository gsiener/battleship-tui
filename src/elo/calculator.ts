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
