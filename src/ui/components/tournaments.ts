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

  if (tournaments.length === 0) {
    lines.push("  🏜️ No tournaments found")
    return lines
  }

  const displayTournaments = tournaments.slice(0, maxEntries)

  for (let i = 0; i < displayTournaments.length; i++) {
    const t = displayTournaments[i]
    if (!t) continue
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

    const progressA = Math.min(10, Math.round((game.playerAHits / 17) * 10))
    const bar = "▓".repeat(progressA) + "░".repeat(10 - progressA)

    lines.push(`     💥 ${game.playerAHits} - ${game.playerBHits}  ${bar}`)
  }

  return lines
}
