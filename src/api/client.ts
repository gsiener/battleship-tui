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
