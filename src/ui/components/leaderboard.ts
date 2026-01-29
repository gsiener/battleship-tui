import type { LeaderboardEntry } from "../../state/store"
import type { Config } from "../../config/config"

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
    if (!entry) continue
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
