import { Store } from "./state/store"
import { Config } from "./config/config"
import { App } from "./ui/app"

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
