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
