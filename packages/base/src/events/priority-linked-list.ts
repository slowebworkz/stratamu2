// PriorityLinkedList: a branded LinkedList for event emitter internals
import type { LinkedList } from "@/data"

export type PriorityLinkedList<T> = LinkedList<T> & { __brand: "PriorityLinkedList" }

export function brandPriorityLinkedList<T>(list: LinkedList<T>): PriorityLinkedList<T> {
  ; (list as unknown as { __brand: string }).__brand = "PriorityLinkedList"
  return list as unknown as PriorityLinkedList<T>
}

export function isPriorityLinkedList<T>(list: LinkedList<T>): list is PriorityLinkedList<T> {
  return (list as unknown as { __brand?: string }).__brand === "PriorityLinkedList"
}
