import { createCliRenderer, TextRenderable, BoxRenderable, type CliRenderer } from "@opentui/core"
import { ApiClient } from "./api"
import { Store, Config, LogWatcher, type LeaderboardEntry, type GameBoard } from "./state"

// ============ UI Rendering Functions ============

function formatRatingChange(change: number): string {
  if (change > 0) return `▲${change}`
  if (change < 0) return `▼${Math.abs(change)}`
  return "━"
}

function renderLeaderboard(
  entries: LeaderboardEntry[],
  config: Config,
  selectedIndex: number,
  scrollOffset: number,
  viewportHeight: number,
  filterActive: boolean
): string {
  const title = filterActive ? "🏆 LEADERBOARD (filtered)" : "🏆 LEADERBOARD"
  const lines = [title, "─".repeat(28)]

  const visibleCount = viewportHeight - 2
  const endIdx = Math.min(scrollOffset + visibleCount, entries.length)

  for (let i = scrollOffset; i < endIdx; i++) {
    const e = entries[i]!
    const rank = String(i + 1).padStart(2)
    const online = e.isOnline ? "🟢" : "  "
    const fav = config.isFavorite(e.playerId) ? "⭐" : " "
    const name = e.displayName.slice(0, 11).padEnd(11)
    const rating = String(e.rating).padStart(4)
    const change = formatRatingChange(e.ratingChange)
    const prov = e.isProvisional ? "*" : " "
    const sel = i === selectedIndex ? ">" : " "
    lines.push(`${sel}${rank}.${online}${fav}${name} ${rating}${prov} ${change}`)
  }

  // Scroll indicators
  if (scrollOffset > 0) {
    lines[2] = "  ↑ more above" + lines[2]!.slice(14)
  }
  if (endIdx < entries.length) {
    lines.push(`  ↓ ${entries.length - endIdx} more`)
  }

  return lines.join("\n")
}

function renderBoard(shots: Map<string, string>, title: string): string[] {
  const lines: string[] = []
  lines.push(title)
  lines.push("  A B C D E F G H I J")

  for (let row = 1; row <= 10; row++) {
    let line = String(row).padStart(2)
    for (let col = 0; col < 10; col++) {
      const coord = String.fromCharCode(65 + col) + row
      const shot = shots.get(coord)
      let char = "·"
      if (shot === "miss") char = "○"
      else if (shot === "hit") char = "✕"
      else if (shot === "sunk") char = "█"
      line += " " + char
    }
    lines.push(line)
  }

  return lines
}

function renderGameBoard(game: GameBoard | null, store: Store): string {
  const lines: string[] = ["⚔️  GAME BOARD", "─".repeat(50)]

  if (!game) {
    lines.push("")
    lines.push("  Waiting for game...")
    lines.push("  Start your bot to see the board here.")
    lines.push("")
    lines.push("  Log file: ~/.local/share/battleship-bot/")
    lines.push("            game-events.jsonl")
    return lines.join("\n")
  }

  const opponentName = store.getPlayerName(game.opponentId)

  // Render both boards side by side
  const yourBoard = renderBoard(
    new Map([...game.yourShots].map(([k, v]) => [k, v])),
    "YOUR SHOTS"
  )
  const oppBoard = renderBoard(
    new Map([...game.opponentShots].map(([k, v]) => [k, v])),
    "OPPONENT SHOTS"
  )

  // Combine side by side with spacing
  for (let i = 0; i < yourBoard.length; i++) {
    const left = yourBoard[i]!.padEnd(24)
    const right = oppBoard[i] ?? ""
    lines.push(left + right)
  }

  // Status line
  lines.push("")
  const statusEmoji = game.status === "live" ? "🔴 LIVE" :
    game.status === "won" ? "🏆 WON" : "💀 LOST"
  lines.push(`vs ${opponentName}  ·  Turn ${game.turnCount}  ·  ${statusEmoji}`)

  // Legend
  lines.push("")
  lines.push("· unknown  ○ miss  ✕ hit  █ sunk")

  return lines.join("\n")
}

function renderHeader(pollInterval: number, isError: boolean, botActive: boolean, onlineCount: number, width: number): string {
  const left = "🚢 BATTLESHIP"
  const online = onlineCount > 0 ? `🟢 ${onlineCount} online` : ""
  const bot = botActive ? "🔴 LIVE" : ""
  const err = isError ? "⚠️" : ""
  const right = `${online}  ${bot}  ${err}  ⏱️ ${pollInterval}s`.replace(/\s+/g, " ").trim()
  const padding = Math.max(0, width - left.length - right.length - 2)
  return `${left}${" ".repeat(padding)}${right}`
}

const FOOTER = "↑↓/jk Scroll  x Favorite  f Filter  r Refresh  +/- Interval  q Quit"

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

class App {
  private renderer!: CliRenderer
  private store: Store
  private config: Config
  private poller!: Poller
  private logWatcher!: LogWatcher
  private leaderboardIdx = 0
  private scrollOffset = 0
  private isError = false
  private running = false
  private filterActive = false

  // UI elements
  private headerText!: TextRenderable
  private leaderboardBox!: BoxRenderable
  private leaderboardText!: TextRenderable
  private gameBoardBox!: BoxRenderable
  private gameBoardText!: TextRenderable
  private footerText!: TextRenderable

  // Layout dimensions
  private lbViewportHeight = 0

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
    console.log(`🚢 Battleship TUI v0.4.0 - Ready! (${stats.playerCount} players, ${stats.tournamentCount} tournaments, ${stats.gameCount} games)`)

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

    // Leaderboard (left 35%)
    const lbWidth = Math.floor(width * 0.35)
    const contentHeight = height - 3
    this.lbViewportHeight = contentHeight - 4

    this.leaderboardBox = new BoxRenderable(this.renderer, {
      id: "lb-box", position: "absolute", left: 0, top: 1,
      width: lbWidth, height: contentHeight,
      border: true, borderStyle: "single", borderColor: "#06b6d4",
    })
    this.renderer.root.add(this.leaderboardBox)

    this.leaderboardText = new TextRenderable(this.renderer, {
      id: "lb-text", position: "absolute", left: 1, top: 1,
      width: lbWidth - 4, height: contentHeight - 4,
    })
    this.leaderboardBox.add(this.leaderboardText)

    // Game board (right 65%)
    const gbWidth = width - lbWidth
    this.gameBoardBox = new BoxRenderable(this.renderer, {
      id: "gb-box", position: "absolute", left: lbWidth, top: 1,
      width: gbWidth, height: contentHeight,
      border: true, borderStyle: "single", borderColor: "#4b5563",
    })
    this.renderer.root.add(this.gameBoardBox)

    this.gameBoardText = new TextRenderable(this.renderer, {
      id: "gb-text", position: "absolute", left: 1, top: 1,
      width: gbWidth - 4, height: contentHeight - 4,
    })
    this.gameBoardBox.add(this.gameBoardText)

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
        case "up": case "k": this.moveSelection(-1); break
        case "down": case "j": this.moveSelection(1); break
        case "x": await this.toggleFavorite(); break
        case "f": this.toggleFilter(); break
        case "r": await this.poller.fetchOnce(); break
        case "+": case "=": this.config.adjustPollInterval(5); await this.config.save(); break
        case "-": this.config.adjustPollInterval(-5); await this.config.save(); break
      }
      this.render()
    })
  }

  private moveSelection(delta: number): void {
    const entries = this.getFilteredLeaderboard()
    const max = Math.max(0, entries.length - 1)
    this.leaderboardIdx = Math.max(0, Math.min(max, this.leaderboardIdx + delta))

    // Adjust scroll to keep selection visible
    const visibleCount = this.lbViewportHeight - 2
    if (this.leaderboardIdx < this.scrollOffset) {
      this.scrollOffset = this.leaderboardIdx
    } else if (this.leaderboardIdx >= this.scrollOffset + visibleCount) {
      this.scrollOffset = this.leaderboardIdx - visibleCount + 1
    }
  }

  private async toggleFavorite(): Promise<void> {
    const leaderboard = this.getFilteredLeaderboard()
    const entry = leaderboard[this.leaderboardIdx]
    if (entry) {
      this.config.toggleFavorite(entry.playerId)
      await this.config.save()
    }
  }

  private toggleFilter(): void {
    this.filterActive = !this.filterActive
    this.leaderboardIdx = 0
    this.scrollOffset = 0
  }

  private getFilteredLeaderboard(): LeaderboardEntry[] {
    const all = this.store.getLeaderboard()
    if (!this.filterActive) return all
    return all.filter(e => e.isOnline || this.config.isFavorite(e.playerId))
  }

  private render(): void {
    if (!this.running) return

    const leaderboard = this.getFilteredLeaderboard()
    const gameBoard = this.logWatcher.getGameBoard()
    const botActive = this.logWatcher.isGameActive()
    const onlineCount = this.store.getOnlineCount()

    this.headerText.content = renderHeader(this.config.get("pollInterval"), this.isError, botActive, onlineCount, this.renderer.width)
    this.leaderboardText.content = renderLeaderboard(
      leaderboard,
      this.config,
      this.leaderboardIdx,
      this.scrollOffset,
      this.lbViewportHeight,
      this.filterActive
    )
    this.gameBoardText.content = renderGameBoard(gameBoard, this.store)
    this.footerText.content = FOOTER

    // Highlight game board when active
    this.gameBoardBox.borderColor = botActive ? "#22c55e" : "#4b5563"
  }

  private async quit(): Promise<void> {
    this.running = false
    this.poller.stop()
    this.logWatcher.stop()

    // Clear all UI elements before stopping renderer
    this.renderer.root.children.forEach(child => this.renderer.root.remove(child))

    // Stop renderer and give it time to restore terminal
    await this.renderer.stop()

    // Small delay to ensure terminal state is fully restored
    await new Promise(resolve => setTimeout(resolve, 50))

    // Explicitly restore terminal state
    process.stdout.write("\x1b[?25h") // Show cursor
    process.stdout.write("\x1b[0m")   // Reset colors/styles
    process.stdout.write("\x1bc")     // Reset terminal

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
