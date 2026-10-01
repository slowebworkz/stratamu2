import { join } from "node:path"

import {
  AberMUDAdapter,
  FileAccountStore,
  FileInventoryStore,
  FilePersonaStore,
  runAberMUDLogin,
} from "@stratamu/adapter-abermud"
import { ManualClock } from "@stratamu/clock"
import type { ClockId } from "@stratamu/engine-core"
import { Engine } from "@stratamu/engine-core"
import type { Connection } from "@stratamu/plugin-telnet"
import { createLineServer } from "@stratamu/plugin-telnet"
import { Duration, Instant } from "@stratamu/primitives"

import { createRuntimeDriver } from "./runtime-driver.ts"
import { createShutdown } from "./shutdown.ts"
import { populateWorld } from "./world.ts"

const DATA_DIR = process.env.STRATAMU_DATA ?? join(process.cwd(), "data")
const PORT = Number(process.env.STRATAMU_PORT ?? 4000)
const TICK_MS = Number(process.env.STRATAMU_TICK_MS ?? 1000)

const accountStore = new FileAccountStore(join(DATA_DIR, "accounts.json"))
const personaStore = new FilePersonaStore(join(DATA_DIR, "uaf.rand"))
const inventoryStore = new FileInventoryStore(join(DATA_DIR, "inventory"))

/** Domain marker for the combat clock's ticks, matching the adapter test fixture's own
 * `CombatTick` (`adapters/abermud/test/fixtures/world.ts`). */
type CombatTick = { readonly kind: "combat-tick" }
const COMBAT_CLOCK: ClockId = "abermud.combat"

const adapter = new AberMUDAdapter({
  accountStore,
  personaStore,
  inventoryStore,
  combatClockId: COMBAT_CLOCK,
})
const engine = new Engine(adapter)
const startingRoom = populateWorld(engine.world, adapter)

const combatClock = new ManualClock(Instant.from<CombatTick>(0n))
engine.runtime.attachClock(COMBAT_CLOCK, combatClock)
const driver = createRuntimeDriver({
  runtime: engine.runtime,
  combatClock: {
    advance: units => combatClock.advance(Duration.from<CombatTick>(BigInt(units))),
  },
  tickMs: TICK_MS,
})

const connections = new Set<Connection>()
const server = createLineServer(connection => {
  connections.add(connection)
  connection.onClose(() => connections.delete(connection))
  runAberMUDLogin({
    connection,
    engine,
    adapter,
    onLoggedIn: (character, session) => {
      engine.world.locate(character, startingRoom)
      engine.receive({ session, raw: "look" })
      driver.kick()
    },
    kick: () => driver.kick(),
  })
})

const boundPort = await server.listen(PORT)
console.log(`AberMUD server listening on port ${boundPort}`)
console.log(`Connect with: telnet localhost ${boundPort}`)
console.log(`Data directory: ${DATA_DIR}`)
console.log("Press Ctrl+C to stop.")

driver.start()

const shutdown = createShutdown({ server, driver, connections })

process.on("SIGINT", async () => {
  await shutdown()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  await shutdown()
  process.exit(0)
})
