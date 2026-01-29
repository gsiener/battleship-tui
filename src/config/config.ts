import { existsSync } from "fs"
import { mkdir, readFile, writeFile } from "fs/promises"
import { dirname } from "path"
import { homedir } from "os"

export interface ConfigData {
  favorites: string[]
  pollInterval: number
  leaderboardSize: number
  theme: string
}

export const DEFAULT_CONFIG: ConfigData = {
  favorites: [],
  pollInterval: 10,
  leaderboardSize: 20,
  theme: "default",
}

const DEFAULT_CONFIG_PATH = `${homedir()}/.config/battleship-tui/config.json`

export class Config {
  private configPath: string
  private data: ConfigData = { ...DEFAULT_CONFIG }

  constructor(configPath: string = DEFAULT_CONFIG_PATH) {
    this.configPath = configPath
  }

  async load(): Promise<void> {
    if (!existsSync(this.configPath)) {
      this.data = { ...DEFAULT_CONFIG }
      return
    }

    try {
      const content = await readFile(this.configPath, "utf-8")
      const parsed = JSON.parse(content)
      this.data = { ...DEFAULT_CONFIG, ...parsed }
    } catch {
      this.data = { ...DEFAULT_CONFIG }
    }
  }

  async save(): Promise<void> {
    const dir = dirname(this.configPath)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }
    await writeFile(this.configPath, JSON.stringify(this.data, null, 2))
  }

  get<K extends keyof ConfigData>(key: K): ConfigData[K] {
    return this.data[key]
  }

  set<K extends keyof ConfigData>(key: K, value: ConfigData[K]): void {
    this.data[key] = value
  }

  isFavorite(playerId: string): boolean {
    return this.data.favorites.includes(playerId)
  }

  toggleFavorite(playerId: string): boolean {
    const index = this.data.favorites.indexOf(playerId)
    if (index === -1) {
      this.data.favorites.push(playerId)
      return true
    } else {
      this.data.favorites.splice(index, 1)
      return false
    }
  }

  adjustPollInterval(delta: number): number {
    const newInterval = Math.max(5, Math.min(60, this.data.pollInterval + delta))
    this.data.pollInterval = newInterval
    return newInterval
  }
}
