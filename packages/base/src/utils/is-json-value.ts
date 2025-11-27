import { isObject } from "@/utils"
import type { JsonValue } from "type-fest"

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return true
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (isObject(value)) return Object.values(value).every(isJsonValue)
  return false
}
