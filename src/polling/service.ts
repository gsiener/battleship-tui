import { BattleshipClient } from "../api/client"
import { Store } from "../state/store"
import { Config } from "../config/config"

export interface PollingCallbacks {
  onUpdate: () => void
  onError: (error: Error) => void
  baseUrl?: string
}

export class PollingService {
  private client: BattleshipClient
  private store: Store
  private config: Config
  private callbacks: PollingCallbacks
  private intervalId: ReturnType<typeof setTimeout> | null = null
  private isPolling = false
  private consecutiveErrors = 0
  private maxBackoff = 60000 // 60 seconds

  constructor(store: Store, config: Config, callbacks: PollingCallbacks) {
    this.client = new BattleshipClient(callbacks.baseUrl)
    this.store = store
    this.config = config
    this.callbacks = callbacks
  }

  async fetchOnce(): Promise<boolean> {
    try {
      const { players, tournaments } = await this.client.fetchAll()
      this.store.update(players, tournaments)
      this.consecutiveErrors = 0
      this.callbacks.onUpdate()
      return true
    } catch (error) {
      this.consecutiveErrors++
      this.callbacks.onError(error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }

  private getBackoffInterval(): number {
    const baseInterval = this.config.get("pollInterval") * 1000
    if (this.consecutiveErrors === 0) return baseInterval

    // Exponential backoff: base * 2^errors, capped at maxBackoff
    const backoff = Math.min(
      baseInterval * Math.pow(2, this.consecutiveErrors),
      this.maxBackoff
    )
    return backoff
  }

  start(): void {
    if (this.isPolling) return
    this.isPolling = true
    this.scheduleNext()
  }

  private scheduleNext(): void {
    if (!this.isPolling) return

    const interval = this.getBackoffInterval()
    this.intervalId = setTimeout(async () => {
      await this.fetchOnce()
      this.scheduleNext()
    }, interval)
  }

  stop(): void {
    this.isPolling = false
    if (this.intervalId) {
      clearTimeout(this.intervalId)
      this.intervalId = null
    }
  }

  isActive(): boolean {
    return this.isPolling
  }

  getConsecutiveErrors(): number {
    return this.consecutiveErrors
  }
}
