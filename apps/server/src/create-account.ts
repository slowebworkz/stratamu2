/**
 * Creates an account in the server's account store. Run once before starting the server:
 *
 *   node dist/create-account.js --name alice --password secret
 *
 * STRATAMU_DATA defaults to ./data, the same as the server.
 */
import { join } from "node:path"

import { FileAccountStore } from "@stratamu/adapter-abermud"

const DATA_DIR = process.env.STRATAMU_DATA ?? join(process.cwd(), "data")
const args = process.argv.slice(2)

function arg(flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index !== -1 ? args[index + 1] : undefined
}

const name = arg("--name")
const password = arg("--password")

if (!name || !password) {
  console.error("Usage: create-account --name <name> --password <password>")
  process.exit(1)
}

const store = new FileAccountStore(join(DATA_DIR, "accounts.json"))
await store.create(name, password)
console.log(`Account created: ${name}`)
