import { createCliRenderer, TextRenderable, BoxRenderable, type CliRenderer } from "@opentui/core"
import { ApiClient } from "./api"
import { Store, Config, LogWatcher, type LeaderboardEntry, type BotEvent } from "./state"
import type { Tournament, Game } from "./api"

// ============ UI Rendering Functions ============

function formatRatingChange(change: number): string {
  if (change > 0) return `▲${change}`
  if (change < 0) return `▼${Math.abs(change)}`
  return "━"
}

function renderLeaderboard(entries: LeaderboardEntry[], config: Config, selectedIndex: number, maxEntries: number): string {
  const lines = ["🏆 LEADERBOARD", "─".repeat(30)]

  for (let i = 0; i < Math.min(entries.length, maxEntries); i++) {
    const e = entries[i]!
    const rank = String(i + 1).padStart(2)
    const fav = config.isFavorite(e.playerId) ? "⭐" : "  "
    const name = e.displayName.slice(0, 16).padEnd(16)
    const rating = String(e.rating).padStart(4)
    const change = formatRatingChange(e.ratingChange)
    const prov = e.isProvisional ? "*" : " "
    const sel = i === selectedIndex ? ">" : " "
    lines.push(`${sel}${rank}. ${fav} ${name} ${rating}${prov} ${change}`)
  }

  return lines.join("\n")
}

function getTournamentEmoji(state: Tournament["state"]): string {
  return state === "IN_PROGRESS" ? "🔴" : state === "FINISHED" ? "🏁" : "⚪"
}

function renderTournaments(tournaments: Tournament[], selectedIndex: number, maxEntries: number): string {
  const lines = ["📋 TOURNAMENTS", "─".repeat(34)]

  if (tournaments.length === 0) {
    lines.push("  🏜️ No tournaments found")
    return lines.join("\n")
  }

  for (let i = 0; i < Math.min(tournaments.length, maxEntries); i++) {
    const t = tournaments[i]!
    const emoji = getTournamentEmoji(t.state)
    const name = t.name.slice(0, 20).padEnd(20)
    const state = t.state.padEnd(11)
    const sel = i === selectedIndex ? ">" : " "
    lines.push(`${sel}${emoji} ${name} ${state}`)

    const roundInfo = t.state === "IN_PROGRESS" ? `📍 Round ${t.currentRound}`
      : t.state === "CREATED" ? "⏳ Not started"
      : `🎮 ${t.games.length} games`
    lines.push(`    👥 ${t.playerIds.length}  ·  ${roundInfo}`)
  }

  return lines.join("\n")
}

function renderLiveGames(liveGames: Game[], recentGames: Game[], store: Store, maxEntries: number): string {
  const lines: string[] = []

  // Filter to only show games that have actually started (at least one shot fired)
  const activeGames = liveGames.filter(g => g.playerAHits > 0 || g.playerBHits > 0)
  const queuedCount = liveGames.length - activeGames.length

  if (activeGames.length > 0) {
    lines.push("⚔️  LIVE GAMES", "─".repeat(34))
    for (let i = 0; i < Math.min(activeGames.length, maxEntries); i++) {
      const g = activeGames[i]!
      const playerA = store.getPlayerName(g.playerAId).slice(0, 10)
      const playerB = store.getPlayerName(g.playerBId).slice(0, 10)
      const totalHits = g.playerAHits + g.playerBHits
      lines.push(`  ${playerA} vs ${playerB}`)
      lines.push(`     💥 ${g.playerAHits}-${g.playerBHits}  Turn ~${totalHits * 2}`)
    }
    if (queuedCount > 0) lines.push(`  ⏳ +${queuedCount} queued`)
  } else {
    // No active games - show recent results instead
    lines.push("🏁 RECENT GAMES", "─".repeat(34))
    if (recentGames.length === 0 && queuedCount === 0) {
      lines.push("  No games yet")
    } else {
      for (const g of recentGames.slice(0, maxEntries)) {
        const playerA = store.getPlayerName(g.playerAId).slice(0, 10)
        const playerB = store.getPlayerName(g.playerBId).slice(0, 10)
        const winnerName = store.getPlayerName(g.winnerPlayerId!)
        const winner = winnerName === playerA ? "A" : "B"
        lines.push(`  ${playerA} vs ${playerB}`)
        lines.push(`     🏆 ${winner} wins (${g.playerAHits}-${g.playerBHits})`)
      }
      if (queuedCount > 0) lines.push(`  ⏳ ${queuedCount} queued (bots offline?)`)
    }
  }

  return lines.join("\n")
}

function renderBotEvents(events: BotEvent[], maxLines: number): string {
  const lines = ["🤖 BOT ACTIVITY", "─".repeat(34)]

  if (events.length === 0) {
    lines.push("  Waiting for bot logs...")
    lines.push("  ~/.local/share/battleship-bot/")
    return lines.join("\n")
  }

  // Show recent events, newest first
  const recent = events.slice(-maxLines).reverse()
  for (const e of recent) {
    const time = new Date(e.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    switch (e.event) {
      case "game_start":
        lines.push(`  ${time} 🎮 Game started`)
        break
      case "shot_fired":
        lines.push(`  ${time} 🎯 Shot ${e.coordinate}`)
        break
      case "shot_result":
        const result = e.hit ? (e.sunk ? `💥 HIT! Sunk ${e.sunk}` : "💥 HIT!") : "💨 miss"
        lines.push(`  ${time}    → ${result}`)
        break
      case "opponent_shot":
        lines.push(`  ${time} 👊 Opp ${e.coordinate} ${e.hit ? "💥" : "💨"}`)
        break
      case "game_end":
        lines.push(`  ${time} ${e.won ? "🏆 WON" : "💀 LOST"} in ${e.turns} turns`)
        break
    }
  }

  return lines.join("\n")
}

function renderHeader(pollInterval: number, isError: boolean, botActive: boolean): string {
  const err = isError ? "⚠️ " : ""
  const bot = botActive ? "🤖 " : ""
  return `🚢 BATTLESHIP TOURNAMENT MONITOR                ${bot}${err}⏱️ Auto: ${pollInterval}s  🔄`
}

const FOOTER = "↑↓/jk Navigate  Tab Switch pane  x Favorite  r Refresh  +/- Interval  q Quit"

// ============ Polling Service ============

class Poller {
  private client: ApiClient
  private store: Store
  private config: Config
  private onUpdate: () => void
  private onError: () => void
  private timerId: ReturnType<typeof setTimeout> | null = null
  private running = false
  private errors = 0

  constructor(store: Store, config: Config, onUpdate: () => void, onError: () => void) {
    this.client = new ApiClient()
    this.store = store
    this.config = config
    this.onUpdate = onUpdate
    this.onError = onError
  }

  async fetchOnce(): Promise<boolean> {
    try {
      const data = await this.client.fetchAll()
      this.store.update(data.players, data.tournaments)
      this.errors = 0
      this.onUpdate()
      return true
    } catch {
      this.errors++
      this.onError()
      return false
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.scheduleNext()
  }

  stop(): void {
    this.running = false
    if (this.timerId) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  private scheduleNext(): void {
    if (!this.running) return
    const base = this.config.get("pollInterval") * 1000
    const interval = this.errors === 0 ? base : Math.min(base * Math.pow(2, this.errors), 60000)
    this.timerId = setTimeout(async () => {
      await this.fetchOnce()
      this.scheduleNext()
    }, interval)
  }
}

// ============ App ============

type Pane = "leaderboard" | "tournaments"

class App {
  private renderer!: CliRenderer
  private store: Store
  private config: Config
  private poller!: Poller
  private logWatcher!: LogWatcher
  private activePane: Pane = "tournaments"
  private leaderboardIdx = 0
  private tournamentIdx = 0
  private isError = false
  private running = false

  // UI elements
  private headerText!: TextRenderable
  private leaderboardBox!: BoxRenderable
  private leaderboardText!: TextRenderable
  private tournamentsBox!: BoxRenderable
  private tournamentsText!: TextRenderable
  private liveGamesBox!: BoxRenderable
  private liveGamesText!: TextRenderable
  private botActivityBox!: BoxRenderable
  private botActivityText!: TextRenderable
  private footerText!: TextRenderable

  constructor(store: Store, config: Config) {
    this.store = store
    this.config = config
  }

  async init(): Promise<void> {
    this.renderer = await createCliRenderer({ targetFps: 30, exitOnCtrlC: false })
    this.setupLayout()
    this.setupInput()
    this.poller = new Poller(
      this.store,
      this.config,
      () => { this.isError = false; this.render() },
      () => { this.isError = true; this.render() }
    )
    this.logWatcher = new LogWatcher(() => this.render())

    await this.poller.fetchOnce()
    await this.logWatcher.start()
    const stats = this.store.getStats()
    console.log(`🚢 Battleship TUI v0.3.0 - Ready! (${stats.playerCount} players, ${stats.tournamentCount} tournaments, ${stats.gameCount} games)`)

    this.running = true
    this.poller.start()
    this.render()
  }

  private setupLayout(): void {
    const { width, height } = this.renderer

    // Header
    this.headerText = new TextRenderable(this.renderer, {
      id: "header", position: "absolute", left: 0, top: 0, width, height: 1,
    })
    this.renderer.root.add(this.headerText)

    // Leaderboard (left 40%)
    const lbWidth = Math.floor(width * 0.4)
    this.leaderboardBox = new BoxRenderable(this.renderer, {
      id: "lb-box", position: "absolute", left: 0, top: 1,
      width: lbWidth, height: height - 3,
      border: true, borderStyle: "single", borderColor: "#4b5563",
    })
    this.renderer.root.add(this.leaderboardBox)

    this.leaderboardText = new TextRenderable(this.renderer, {
      id: "lb-text", position: "absolute", left: 1, top: 1,
      width: lbWidth - 4, height: height - 6,
    })
    this.leaderboardBox.add(this.leaderboardText)

    // Right side layout: tournaments (45%), live games (27.5%), bot activity (27.5%)
    const rWidth = width - lbWidth
    const rHeight = height - 3
    const tHeight = Math.floor(rHeight * 0.45)
    const lgHeight = Math.floor(rHeight * 0.275)
    const baHeight = rHeight - tHeight - lgHeight

    // Tournaments (right top)
    this.tournamentsBox = new BoxRenderable(this.renderer, {
      id: "t-box", position: "absolute", left: lbWidth, top: 1,
      width: rWidth, height: tHeight,
      border: true, borderStyle: "single", borderColor: "#4b5563",
    })
    this.renderer.root.add(this.tournamentsBox)

    this.tournamentsText = new TextRenderable(this.renderer, {
      id: "t-text", position: "absolute", left: 1, top: 1,
      width: rWidth - 4, height: tHeight - 4,
    })
    this.tournamentsBox.add(this.tournamentsText)

    // Live games (right middle)
    this.liveGamesBox = new BoxRenderable(this.renderer, {
      id: "lg-box", position: "absolute", left: lbWidth, top: 1 + tHeight,
      width: rWidth, height: lgHeight,
      border: true, borderStyle: "single", borderColor: "#4b5563",
    })
    this.renderer.root.add(this.liveGamesBox)

    this.liveGamesText = new TextRenderable(this.renderer, {
      id: "lg-text", position: "absolute", left: 1, top: 1,
      width: rWidth - 4, height: lgHeight - 4,
    })
    this.liveGamesBox.add(this.liveGamesText)

    // Bot activity (right bottom)
    this.botActivityBox = new BoxRenderable(this.renderer, {
      id: "ba-box", position: "absolute", left: lbWidth, top: 1 + tHeight + lgHeight,
      width: rWidth, height: baHeight,
      border: true, borderStyle: "single", borderColor: "#4b5563",
    })
    this.renderer.root.add(this.botActivityBox)

    this.botActivityText = new TextRenderable(this.renderer, {
      id: "ba-text", position: "absolute", left: 1, top: 1,
      width: rWidth - 4, height: baHeight - 4,
    })
    this.botActivityBox.add(this.botActivityText)

    // Footer
    this.footerText = new TextRenderable(this.renderer, {
      id: "footer", position: "absolute", left: 0, top: height - 1, width, height: 1,
    })
    this.renderer.root.add(this.footerText)
  }

  private setupInput(): void {
    this.renderer.keyInput.on("keypress", async (event) => {
      const key = event.name.toLowerCase()
      switch (key) {
        case "q": await this.quit(); break
        case "tab": this.activePane = this.activePane === "leaderboard" ? "tournaments" : "leaderboard"; break
        case "up": case "k": this.moveSelection(-1); break
        case "down": case "j": this.moveSelection(1); break
        case "x": await this.toggleFavorite(); break
        case "r": await this.poller.fetchOnce(); break
        case "+": case "=": this.config.adjustPollInterval(5); await this.config.save(); break
        case "-": this.config.adjustPollInterval(-5); await this.config.save(); break
      }
      this.render()
    })
  }

  private moveSelection(delta: number): void {
    if (this.activePane === "leaderboard") {
      const max = Math.min(this.store.getLeaderboard().length - 1, this.config.get("leaderboardSize") - 1)
      this.leaderboardIdx = Math.max(0, Math.min(max, this.leaderboardIdx + delta))
    } else {
      const max = this.store.getTournamentsSorted().length - 1
      this.tournamentIdx = Math.max(0, Math.min(max, this.tournamentIdx + delta))
    }
  }

  private async toggleFavorite(): Promise<void> {
    if (this.activePane !== "leaderboard") return
    const entry = this.store.getLeaderboard()[this.leaderboardIdx]
    if (entry) {
      this.config.toggleFavorite(entry.playerId)
      await this.config.save()
    }
  }

  private render(): void {
    if (!this.running) return

    const leaderboard = this.store.getLeaderboard()
    const tournaments = this.store.getTournamentsSorted()
    const selectedTournament = tournaments[this.tournamentIdx]
    const liveGames = selectedTournament ? this.store.getLiveGames(selectedTournament.tournamentId) : []
    const recentGames = selectedTournament ? this.store.getRecentGames(selectedTournament.tournamentId, 5) : []
    const botEvents = this.logWatcher.getRecentEvents(10)
    const botActive = this.logWatcher.isGameActive()

    this.headerText.content = renderHeader(this.config.get("pollInterval"), this.isError, botActive)
    this.leaderboardText.content = renderLeaderboard(leaderboard, this.config, this.activePane === "leaderboard" ? this.leaderboardIdx : -1, this.config.get("leaderboardSize"))
    this.tournamentsText.content = renderTournaments(tournaments, this.activePane === "tournaments" ? this.tournamentIdx : -1, 10)
    this.liveGamesText.content = renderLiveGames(liveGames, recentGames, this.store, 4)
    this.botActivityText.content = renderBotEvents(botEvents, 6)
    this.footerText.content = FOOTER

    this.leaderboardBox.borderColor = this.activePane === "leaderboard" ? "#06b6d4" : "#4b5563"
    this.tournamentsBox.borderColor = this.activePane === "tournaments" ? "#06b6d4" : "#4b5563"
    this.botActivityBox.borderColor = botActive ? "#22c55e" : "#4b5563"
  }

  private async quit(): Promise<void> {
    this.running = false
    this.poller.stop()
    this.logWatcher.stop()
    await this.renderer.stop()
    process.exit(0)
  }
}

// ============ Entry Point ============

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
