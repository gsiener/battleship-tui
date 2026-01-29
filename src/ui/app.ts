import { createCliRenderer, TextRenderable, BoxRenderable, type CliRenderer } from "@opentui/core"
import { Store } from "../state/store"
import { Config } from "../config/config"
import { PollingService } from "../polling/service"
import {
  createLeaderboardContent,
  createTournamentContent,
  createLiveGamesContent,
  createHeader,
  createFooter,
} from "./components"

type Pane = "leaderboard" | "tournaments"

export class App {
  private renderer!: CliRenderer
  private store: Store
  private config: Config
  private polling!: PollingService
  private activePane: Pane = "tournaments"
  private leaderboardIndex = 0
  private tournamentIndex = 0
  private isError = false
  private isRunning = false

  // Renderables
  private headerText!: TextRenderable
  private leaderboardBox!: BoxRenderable
  private leaderboardText!: TextRenderable
  private tournamentsBox!: BoxRenderable
  private tournamentsText!: TextRenderable
  private liveGamesBox!: BoxRenderable
  private liveGamesText!: TextRenderable
  private footerText!: TextRenderable

  constructor(store: Store, config: Config) {
    this.store = store
    this.config = config
  }

  async init(): Promise<void> {
    this.renderer = await createCliRenderer({
      targetFps: 30,
      exitOnCtrlC: false,
    })

    this.setupLayout()
    this.setupInput()
    this.setupPolling()

    // Initial fetch
    await this.polling.fetchOnce()
    const stats = this.store.getStats()
    console.log(`🚢 Battleship TUI v0.1.0 - Ready! (${stats.playerCount} players, ${stats.tournamentCount} tournaments, ${stats.gameCount} games)`)

    this.isRunning = true
    this.polling.start()
    this.render()
  }

  private setupLayout(): void {
    const width = this.renderer.width
    const height = this.renderer.height

    // Header
    this.headerText = new TextRenderable(this.renderer, {
      id: "header",
      position: "absolute",
      left: 0,
      top: 0,
      width,
      height: 1,
    })
    this.renderer.root.add(this.headerText)

    // Leaderboard pane (left, 40%)
    const leaderboardWidth = Math.floor(width * 0.4)
    this.leaderboardBox = new BoxRenderable(this.renderer, {
      id: "leaderboard-box",
      position: "absolute",
      left: 0,
      top: 1,
      width: leaderboardWidth,
      height: height - 3,
      borderStyle: "single",
      border: true,
      borderColor: "#4b5563",
    })
    this.renderer.root.add(this.leaderboardBox)

    this.leaderboardText = new TextRenderable(this.renderer, {
      id: "leaderboard-text",
      position: "absolute",
      left: 1,
      top: 1,
      width: leaderboardWidth - 4,
      height: height - 6,
    })
    this.leaderboardBox.add(this.leaderboardText)

    // Tournaments pane (right top, 60%)
    const tournamentsWidth = width - leaderboardWidth
    const tournamentsHeight = Math.floor((height - 3) * 0.6)
    this.tournamentsBox = new BoxRenderable(this.renderer, {
      id: "tournaments-box",
      position: "absolute",
      left: leaderboardWidth,
      top: 1,
      width: tournamentsWidth,
      height: tournamentsHeight,
      borderStyle: "single",
      border: true,
      borderColor: "#4b5563",
    })
    this.renderer.root.add(this.tournamentsBox)

    this.tournamentsText = new TextRenderable(this.renderer, {
      id: "tournaments-text",
      position: "absolute",
      left: 1,
      top: 1,
      width: tournamentsWidth - 4,
      height: tournamentsHeight - 4,
    })
    this.tournamentsBox.add(this.tournamentsText)

    // Live games pane (right bottom)
    const liveGamesHeight = height - 3 - tournamentsHeight
    this.liveGamesBox = new BoxRenderable(this.renderer, {
      id: "live-games-box",
      position: "absolute",
      left: leaderboardWidth,
      top: 1 + tournamentsHeight,
      width: tournamentsWidth,
      height: liveGamesHeight,
      borderStyle: "single",
      border: true,
      borderColor: "#4b5563",
    })
    this.renderer.root.add(this.liveGamesBox)

    this.liveGamesText = new TextRenderable(this.renderer, {
      id: "live-games-text",
      position: "absolute",
      left: 1,
      top: 1,
      width: tournamentsWidth - 4,
      height: liveGamesHeight - 4,
    })
    this.liveGamesBox.add(this.liveGamesText)

    // Footer
    this.footerText = new TextRenderable(this.renderer, {
      id: "footer",
      position: "absolute",
      left: 0,
      top: height - 1,
      width,
      height: 1,
    })
    this.renderer.root.add(this.footerText)
  }

  private setupInput(): void {
    this.renderer.on("keypress", async (event: { key: string }) => {
      const key = event.key
      switch (key) {
        case "q":
          await this.quit()
          break
        case "Tab":
          this.activePane = this.activePane === "leaderboard" ? "tournaments" : "leaderboard"
          break
        case "Up":
        case "k":
          this.moveSelection(-1)
          break
        case "Down":
        case "j":
          this.moveSelection(1)
          break
        case "f":
          await this.toggleFavorite()
          break
        case "r":
          await this.polling.fetchOnce()
          break
        case "+":
        case "=":
          this.config.adjustPollInterval(5)
          await this.config.save()
          break
        case "-":
          this.config.adjustPollInterval(-5)
          await this.config.save()
          break
      }
      this.render()
    })
  }

  private moveSelection(delta: number): void {
    if (this.activePane === "leaderboard") {
      const max = Math.min(this.store.getLeaderboard().length - 1, this.config.get("leaderboardSize") - 1)
      this.leaderboardIndex = Math.max(0, Math.min(max, this.leaderboardIndex + delta))
    } else {
      const max = this.store.getTournamentsSorted().length - 1
      this.tournamentIndex = Math.max(0, Math.min(max, this.tournamentIndex + delta))
    }
  }

  private async toggleFavorite(): Promise<void> {
    if (this.activePane !== "leaderboard") return
    const leaderboard = this.store.getLeaderboard()
    const entry = leaderboard[this.leaderboardIndex]
    if (entry) {
      this.config.toggleFavorite(entry.playerId)
      await this.config.save()
    }
  }

  private setupPolling(): void {
    this.polling = new PollingService(this.store, this.config, {
      onUpdate: () => {
        this.isError = false
        this.render()
      },
      onError: () => {
        this.isError = true
        this.render()
      },
    })
  }

  private render(): void {
    if (!this.isRunning) return

    // Header
    this.headerText.content = createHeader(this.config.get("pollInterval"), this.isError)

    // Leaderboard
    const leaderboard = this.store.getLeaderboard()
    const leaderboardLines = createLeaderboardContent(
      leaderboard,
      this.config,
      this.activePane === "leaderboard" ? this.leaderboardIndex : -1,
      this.config.get("leaderboardSize")
    )
    this.leaderboardText.content = leaderboardLines.join("\n")
    this.leaderboardBox.borderColor = this.activePane === "leaderboard" ? "#06b6d4" : "#4b5563"

    // Tournaments
    const tournaments = this.store.getTournamentsSorted()
    const tournamentLines = createTournamentContent(
      tournaments,
      this.activePane === "tournaments" ? this.tournamentIndex : -1,
      10
    )
    this.tournamentsText.content = tournamentLines.join("\n")
    this.tournamentsBox.borderColor = this.activePane === "tournaments" ? "#06b6d4" : "#4b5563"

    // Live games for selected tournament
    const selectedTournament = tournaments[this.tournamentIndex]
    const liveGames = selectedTournament
      ? this.store.getLiveGames(selectedTournament.tournamentId)
      : []
    const liveGamesLines = createLiveGamesContent(liveGames, this.store, 5)
    this.liveGamesText.content = liveGamesLines.join("\n")

    // Footer
    this.footerText.content = createFooter()
  }

  private async quit(): Promise<void> {
    this.isRunning = false
    this.polling.stop()
    await this.renderer.stop()
    process.exit(0)
  }
}
