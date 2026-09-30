import { join } from "node:path"

import {
  AberMUDAdapter,
  FileAccountStore,
  FileInventoryStore,
  FilePersonaStore,
  runAberMUDLogin,
} from "@stratamu/adapter-abermud"
import { Engine } from "@stratamu/engine-core"
import { createLineServer } from "@stratamu/plugin-telnet"

import { populateWorld } from "./world.ts"

const DATA_DIR = process.env.STRATAMU_DATA ?? join(process.cwd(), "data")
const PORT = Number(process.env.STRATAMU_PORT ?? 4000)

const accountStore = new FileAccountStore(join(DATA_DIR, "accounts.json"))
const personaStore = new FilePersonaStore(join(DATA_DIR, "uaf.rand"))
const inventoryStore = new FileInventoryStore(join(DATA_DIR, "inventory"))

const adapter = new AberMUDAdapter({ accountStore, personaStore, inventoryStore })
const engine = new Engine(adapter)
const startingRoom = populateWorld(engine.world, adapter)

const server = createLineServer(connection => {
  runAberMUDLogin({
    connection,
    engine,
    adapter,
    onLoggedIn: (character, session) => {
      engine.world.locate(character, startingRoom)
      engine.receive({ session, raw: "look" })
      void engine.runtime.pump(100)
    },
  })
})

const boundPort = await server.listen(PORT)
console.log(`AberMUD server listening on port ${boundPort}`)
console.log(`Connect with: telnet localhost ${boundPort}`)
console.log(`Data directory: ${DATA_DIR}`)
console.log("Press Ctrl+C to stop.")

process.on("SIGINT", async () => {
  console.log("\nShutting down...")
  await server.close()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  await server.close()
  process.exit(0)
})
