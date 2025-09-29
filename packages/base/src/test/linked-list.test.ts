import { beforeEach, describe, expect, test, vi } from 'vitest'
import { LinkedList, ListNode } from '../data/index.js'

describe('ListNode', () => {
  test('should create a node with value', () => {
    const node = new ListNode(42)
    expect(node.value).toBe(42)
    expect(node.next).toBeNull()
  })

  test('should handle different value types', () => {
    const stringNode = new ListNode('hello')
    const objectNode = new ListNode({ id: 1 })
    const arrayNode = new ListNode([1, 2, 3])

    expect(stringNode.value).toBe('hello')
    expect(objectNode.value).toEqual({ id: 1 })
    expect(arrayNode.value).toEqual([1, 2, 3])
  })
})

describe('LinkedList', () => {
  let list: LinkedList<number>

  beforeEach(() => {
    list = new LinkedList<number>()
  })

  describe('constructor', () => {
    test('should create empty list', () => {
      expect(list.size).toBe(0)
    })

    test('should create list from iterable', () => {
      const list = new LinkedList([1, 2, 3, 4])
      expect(list.size).toBe(4)
      expect(list.toArray()).toEqual([1, 2, 3, 4])
    })

    test('should create sorted list with comparator', () => {
      const list = new LinkedList<number>((a, b) => a - b)
      list.push(3).push(1).push(4).push(2)
      expect(list.toArray()).toEqual([1, 2, 3, 4])
    })

    test('should create list from iterable with comparator', () => {
      const list = new LinkedList([3, 1, 4, 2], (a, b) => a - b)
      expect(list.toArray()).toEqual([1, 2, 3, 4])
    })

    test('should handle empty iterable', () => {
      const list = new LinkedList([])
      expect(list.size).toBe(0)
      expect(list.toArray()).toEqual([])
    })

    test('should create from Set', () => {
      const set = new Set([1, 2, 3, 2, 1]) // Duplicates removed by Set
      const list = new LinkedList(set)
      expect(list.size).toBe(3)
      expect(list.toArray()).toEqual([1, 2, 3])
    })

    test('should create from string (iterable)', () => {
      const list = new LinkedList('hello')
      expect(list.size).toBe(5)
      expect(list.toArray()).toEqual(['h', 'e', 'l', 'l', 'o'])
    })

    test('should create from generator function', () => {
      function* numberGen() {
        yield 1
        yield 2
        yield 3
      }
      const list = new LinkedList(numberGen())
      expect(list.toArray()).toEqual([1, 2, 3])
    })

    test('should handle sorted list creation with duplicate values', () => {
      const list = new LinkedList([3, 1, 2, 1, 3], (a, b) => a - b)
      expect(list.toArray()).toEqual([1, 1, 2, 3, 3])
    })

    test('should properly set comparator when only comparator is provided', () => {
      const list = new LinkedList<number>((a, b) => b - a) // Reverse sort
      list.push(1).push(3).push(2)
      expect(list.toArray()).toEqual([3, 2, 1])
    })
  })

  describe('push', () => {
    test('should add to empty list', () => {
      list.push(1)
      expect(list.size).toBe(1)
      expect(list.get(0)).toBe(1)
    })

    test('should add multiple items', () => {
      list.push(1).push(2).push(3)
      expect(list.size).toBe(3)
      expect(list.toArray()).toEqual([1, 2, 3])
    })

    test('should return this for chaining', () => {
      const result = list.push(1)
      expect(result).toBe(list)
    })

    test('should maintain sorted order when comparator is set', () => {
      const sortedList = new LinkedList<number>((a, b) => a - b)
      sortedList.push(3).push(1).push(4).push(2)
      expect(sortedList.toArray()).toEqual([1, 2, 3, 4])
    })
  })

  describe('unshift', () => {
    test('should add to front of empty list', () => {
      list.unshift(1)
      expect(list.size).toBe(1)
      expect(list.get(0)).toBe(1)
    })

    test('should add to front of populated list', () => {
      list.push(2).push(3).unshift(1)
      expect(list.toArray()).toEqual([1, 2, 3])
    })

    test('should return this for chaining', () => {
      const result = list.unshift(1)
      expect(result).toBe(list)
    })

    test('should use sortedInsert when comparator is set', () => {
      const sortedList = new LinkedList<number>((a, b) => a - b)
      sortedList.unshift(3).unshift(1).unshift(2)
      expect(sortedList.toArray()).toEqual([1, 2, 3])
    })
  })

  describe('shift', () => {
    test('should return undefined from empty list', () => {
      expect(list.shift()).toBeUndefined()
    })

    test('should remove and return first item', () => {
      list.push(1).push(2).push(3)
      const result = list.shift()
      expect(result).toBe(1)
      expect(list.size).toBe(2)
      expect(list.toArray()).toEqual([2, 3])
    })

    test('should handle single item list', () => {
      list.push(42)
      const result = list.shift()
      expect(result).toBe(42)
      expect(list.size).toBe(0)
    })
  })

  describe('get', () => {
    beforeEach(() => {
      list.push(10).push(20).push(30).push(40)
    })

    test('should get item by index', () => {
      expect(list.get(0)).toBe(10)
      expect(list.get(1)).toBe(20)
      expect(list.get(2)).toBe(30)
      expect(list.get(3)).toBe(40)
    })

    test('should return undefined for invalid indices', () => {
      expect(list.get(-1)).toBeUndefined()
      expect(list.get(4)).toBeUndefined()
      expect(list.get(100)).toBeUndefined()
    })

    test('should return undefined from empty list', () => {
      const emptyList = new LinkedList<number>()
      expect(emptyList.get(0)).toBeUndefined()
    })
  })

  describe('remove', () => {
    beforeEach(() => {
      list.push(10).push(20).push(30).push(20).push(40)
    })

    test('should remove first occurrence', () => {
      const result = list.remove(20)
      expect(result).toBe(true)
      expect(list.toArray()).toEqual([10, 30, 20, 40])
      expect(list.size).toBe(4)
    })

    test('should remove from head', () => {
      const result = list.remove(10)
      expect(result).toBe(true)
      expect(list.toArray()).toEqual([20, 30, 20, 40])
      expect(list.size).toBe(4)
    })

    test('should remove from tail', () => {
      const result = list.remove(40)
      expect(result).toBe(true)
      expect(list.toArray()).toEqual([10, 20, 30, 20])
      expect(list.size).toBe(4)
    })

    test('should return false for non-existent item', () => {
      const result = list.remove(999)
      expect(result).toBe(false)
      expect(list.size).toBe(5)
    })

    test('should return false from empty list', () => {
      const emptyList = new LinkedList<number>()
      const result = emptyList.remove(10)
      expect(result).toBe(false)
    })
  })

  describe('toArray', () => {
    test('should return empty array for empty list', () => {
      expect(list.toArray()).toEqual([])
    })

    test('should return array with all items', () => {
      list.push(1).push(2).push(3)
      expect(list.toArray()).toEqual([1, 2, 3])
    })
  })

  describe('clear', () => {
    test('should clear empty list', () => {
      list.clear()
      expect(list.size).toBe(0)
    })

    test('should clear populated list', () => {
      list.push(1).push(2).push(3)
      list.clear()
      expect(list.size).toBe(0)
      expect(list.toArray()).toEqual([])
    })
  })

  describe('fromArray', () => {
    test('should create list from array', () => {
      const list = LinkedList.fromArray([1, 2, 3, 4])
      expect(list.size).toBe(4)
      expect(list.toArray()).toEqual([1, 2, 3, 4])
    })

    test('should create empty list from empty array', () => {
      const list = LinkedList.fromArray([])
      expect(list.size).toBe(0)
    })

    test('should handle different types', () => {
      const stringList = LinkedList.fromArray(['a', 'b', 'c'])
      expect(stringList.toArray()).toEqual(['a', 'b', 'c'])
    })

    test('should create from any iterable', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ])
      const list = LinkedList.fromArray(map)
      expect(list.size).toBe(2)
      expect(list.toArray()).toEqual([
        ['a', 1],
        ['b', 2],
      ])
    })

    test('should handle large arrays', () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => i)
      const list = LinkedList.fromArray(largeArray)
      expect(list.size).toBe(1000)
      expect(list.get(0)).toBe(0)
      expect(list.get(999)).toBe(999)
    })

    test('should create independent list from array', () => {
      const originalArray = [1, 2, 3]
      const list = LinkedList.fromArray(originalArray)
      originalArray.push(4)
      expect(list.toArray()).toEqual([1, 2, 3]) // Should not be affected
    })
  })

  describe('iteration', () => {
    beforeEach(() => {
      list.push(1).push(2).push(3)
    })

    test('should be iterable with for...of', () => {
      const items: number[] = []
      for (const item of list) {
        items.push(item)
      }
      expect(items).toEqual([1, 2, 3])
    })

    test('should work with spread operator', () => {
      expect([...list]).toEqual([1, 2, 3])
    })

    test('should work with Array.from', () => {
      expect(Array.from(list)).toEqual([1, 2, 3])
    })

    test('should handle empty list iteration', () => {
      const emptyList = new LinkedList<number>()
      const items: number[] = []
      for (const item of emptyList) {
        items.push(item)
      }
      expect(items).toEqual([])
      expect([...emptyList]).toEqual([])
    })

    test('should work with iterator protocol directly', () => {
      const iterator = list[Symbol.iterator]()
      expect(iterator.next().value).toBe(1)
      expect(iterator.next().value).toBe(2)
      expect(iterator.next().value).toBe(3)
      expect(iterator.next().done).toBe(true)
    })

    test('should handle multiple concurrent iterators', () => {
      const iter1 = list[Symbol.iterator]()
      const iter2 = list[Symbol.iterator]()

      expect(iter1.next().value).toBe(1)
      expect(iter2.next().value).toBe(1)
      expect(iter1.next().value).toBe(2)
      expect(iter2.next().value).toBe(2)
    })

    test('should work with destructuring assignment', () => {
      const [first, second, third] = list
      expect(first).toBe(1)
      expect(second).toBe(2)
      expect(third).toBe(3)
    })

    test('should work with rest parameters', () => {
      const [first, ...rest] = list
      expect(first).toBe(1)
      expect(rest).toEqual([2, 3])
    })
  })

  describe('forEach', () => {
    test('should call function for each item', () => {
      list.push(10).push(20).push(30)
      const items: number[] = []
      const indices: number[] = []

      list.forEach((value, index) => {
        items.push(value)
        indices.push(index)
      })

      expect(items).toEqual([10, 20, 30])
      expect(indices).toEqual([0, 1, 2])
    })

    test('should handle empty list', () => {
      const mockFn = vi.fn()
      list.forEach(mockFn)
      expect(mockFn).not.toHaveBeenCalled()
    })
  })

  describe('insertAt', () => {
    beforeEach(() => {
      list.push(10).push(30).push(50)
    })

    test('should insert at beginning', () => {
      const result = list.insertAt(0, 5)
      expect(result).toBe(true)
      expect(list.toArray()).toEqual([5, 10, 30, 50])
      expect(list.size).toBe(4)
    })

    test('should insert at middle', () => {
      const result = list.insertAt(2, 40)
      expect(result).toBe(true)
      expect(list.toArray()).toEqual([10, 30, 40, 50])
      expect(list.size).toBe(4)
    })

    test('should insert at end', () => {
      const result = list.insertAt(3, 60)
      expect(result).toBe(true)
      expect(list.toArray()).toEqual([10, 30, 50, 60])
      expect(list.size).toBe(4)
    })

    test('should return false for invalid indices', () => {
      expect(list.insertAt(-1, 999)).toBe(false)
      expect(list.insertAt(4, 999)).toBe(false)
      expect(list.size).toBe(3)
    })

    test('should handle empty list', () => {
      const emptyList = new LinkedList<number>()
      const result = emptyList.insertAt(0, 42)
      expect(result).toBe(true)
      expect(emptyList.toArray()).toEqual([42])
    })
  })

  describe('sortedInsert', () => {
    test('should insert into empty list', () => {
      list.sortedInsert(5)
      expect(list.toArray()).toEqual([5])
    })

    test('should insert at head when smallest', () => {
      list.push(10).push(20).push(30)
      list.sortedInsert(5)
      expect(list.toArray()).toEqual([5, 10, 20, 30])
    })

    test('should insert at tail when largest', () => {
      list.push(10).push(20).push(30)
      list.sortedInsert(40)
      expect(list.toArray()).toEqual([10, 20, 30, 40])
    })

    test('should insert in middle', () => {
      list.push(10).push(30).push(50)
      list.sortedInsert(25)
      expect(list.toArray()).toEqual([10, 25, 30, 50])
    })

    test('should use custom comparator', () => {
      // Reverse order comparator
      list.sortedInsert(20, (a, b) => b - a)
      list.sortedInsert(10, (a, b) => b - a)
      list.sortedInsert(30, (a, b) => b - a)
      list.sortedInsert(25, (a, b) => b - a)
      expect(list.toArray()).toEqual([30, 25, 20, 10])
    })

    test('should handle duplicate values', () => {
      list.push(10).push(20).push(30)
      list.sortedInsert(20)
      expect(list.toArray()).toEqual([10, 20, 20, 30])
    })

    test('should work with string comparisons', () => {
      const stringList = new LinkedList<string>()
      stringList.sortedInsert('banana')
      stringList.sortedInsert('apple')
      stringList.sortedInsert('cherry')
      stringList.sortedInsert('date')
      expect(stringList.toArray()).toEqual(['apple', 'banana', 'cherry', 'date'])
    })

    test('should handle equal values with custom comparator returning 0', () => {
      const equalComparator = () => 0 // All values are "equal"
      list.sortedInsert(10, equalComparator)
      list.sortedInsert(20, equalComparator)
      list.sortedInsert(30, equalComparator)
      // Should insert at head each time when compareFn returns 0
      expect(list.toArray()).toEqual([30, 20, 10])
    })

    test('should work with object comparisons', () => {
      interface Person {
        name: string
        age: number
      }

      const personList = new LinkedList<Person>()
      const comparator = (a: Person, b: Person) => a.age - b.age

      personList.sortedInsert({ name: 'Alice', age: 30 }, comparator)
      personList.sortedInsert({ name: 'Bob', age: 25 }, comparator)
      personList.sortedInsert({ name: 'Charlie', age: 35 }, comparator)

      const result = personList.toArray()
      expect(result).toHaveLength(3)
      expect(result[0]!.age).toBe(25)
      expect(result[1]!.age).toBe(30)
      expect(result[2]!.age).toBe(35)
    })

    test('should handle sortedInsert without comparator on unsorted list', () => {
      list.push(30).push(10).push(20) // Unsorted
      list.sortedInsert(15) // Uses default comparison (a < b ? -1 : a > b ? 1 : 0)
      // Should insert 15 in correct position based on default comparison: 10 < 15 < 20 < 30
      expect(list.toArray()).toEqual([15, 30, 10, 20])
    })

    test('should maintain sort order with mixed sortedInsert and constructor comparator', () => {
      const sortedList = new LinkedList<number>((a, b) => a - b)
      sortedList.push(20).push(10).push(30) // Should be auto-sorted
      sortedList.sortedInsert(25) // Should use instance comparator
      expect(sortedList.toArray()).toEqual([10, 20, 25, 30])
    })
  })

  describe('filter', () => {
    beforeEach(() => {
      list.push(1).push(2).push(3).push(4).push(5)
    })

    test('should filter even numbers', () => {
      const evens = list.filter((value) => value % 2 === 0)
      expect(evens).toEqual([2, 4])
    })

    test('should filter with index', () => {
      const firstTwo = list.filter((value, index) => index < 2)
      expect(firstTwo).toEqual([1, 2])
    })

    test('should return empty array when no matches', () => {
      const result = list.filter(() => false)
      expect(result).toEqual([])
    })

    test('should return all items when all match', () => {
      const result = list.filter(() => true)
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    test('should handle empty list', () => {
      const emptyList = new LinkedList<number>()
      const result = emptyList.filter(() => true)
      expect(result).toEqual([])
    })
  })

  describe('edge cases and complex scenarios', () => {
    test('should handle alternating push/shift operations', () => {
      list.push(1)
      expect(list.shift()).toBe(1)
      list.push(2).push(3)
      expect(list.shift()).toBe(2)
      list.push(4)
      expect(list.toArray()).toEqual([3, 4])
    })

    test('should maintain correct size during mixed operations', () => {
      list.push(1).push(2).push(3)
      expect(list.size).toBe(3)
      list.remove(2)
      expect(list.size).toBe(2)
      list.insertAt(1, 5)
      expect(list.size).toBe(3)
      list.shift()
      expect(list.size).toBe(2)
    })

    test('should work with complex objects', () => {
      interface Item {
        id: number
        name: string
      }

      const objectList = new LinkedList<Item>()
      const item1 = { id: 1, name: 'first' }
      const item2 = { id: 2, name: 'second' }

      objectList.push(item1).push(item2)
      expect(objectList.toArray()).toEqual([item1, item2])
      expect(objectList.remove(item1)).toBe(true)
      expect(objectList.toArray()).toEqual([item2])
    })

    test('should handle large datasets efficiently', () => {
      const largeList = new LinkedList<number>()
      const size = 1000

      // Add items
      for (let i = 0; i < size; i++) {
        largeList.push(i)
      }
      expect(largeList.size).toBe(size)

      // Remove every other item
      for (let i = 0; i < size; i += 2) {
        largeList.remove(i)
      }
      expect(largeList.size).toBe(size / 2)
    })

    test('should handle null and undefined values gracefully', () => {
      const mixedList = new LinkedList<number | null | undefined>()
      mixedList.push(null).push(undefined).push(0).push(1)
      expect(mixedList.toArray()).toEqual([null, undefined, 0, 1])
      expect(mixedList.size).toBe(4)
      expect(mixedList.remove(null)).toBe(true)
      expect(mixedList.remove(undefined)).toBe(true)
      expect(mixedList.toArray()).toEqual([0, 1])
    })

    test('should handle rapid add/remove cycles', () => {
      const cycleList = new LinkedList<number>()
      for (let i = 0; i < 100; i++) {
        cycleList.push(i)
        if (i > 0) cycleList.shift()
      }
      expect(cycleList.size).toBe(1)
      expect(cycleList.get(0)).toBe(99)
    })

    test('should handle identical object references correctly', () => {
      const obj = { value: 42 }
      list.push(1).push(2)
      const objList = new LinkedList<typeof obj>()
      objList.push(obj).push(obj).push(obj)
      expect(objList.size).toBe(3)
      expect(objList.remove(obj)).toBe(true)
      expect(objList.size).toBe(2) // Should only remove first occurrence
    })

    test('should handle empty operations on populated list', () => {
      list.push(1).push(2).push(3)
      const originalArray = list.toArray()

      // Operations that shouldn't change anything
      expect(list.remove(999)).toBe(false)
      expect(list.insertAt(-1, 999)).toBe(false)
      expect(list.insertAt(999, 999)).toBe(false)
      expect(list.get(-1)).toBeUndefined()
      expect(list.get(999)).toBeUndefined()

      // List should remain unchanged
      expect(list.toArray()).toEqual(originalArray)
      expect(list.size).toBe(3)
    })

    test('should handle NaN values correctly', () => {
      const nanList = new LinkedList<number>()
      nanList.push(NaN).push(1).push(NaN)
      expect(nanList.size).toBe(3)

      // NaN !== NaN, so remove should return false
      expect(nanList.remove(NaN)).toBe(false)
      expect(nanList.size).toBe(3)

      // But getting by index should work
      expect(Number.isNaN(nanList.get(0)!)).toBe(true)
      expect(Number.isNaN(nanList.get(2)!)).toBe(true)
    })

    test('should handle zero and negative zero correctly', () => {
      list.push(0).push(-0).push(1)
      expect(list.size).toBe(3)
      expect(list.remove(0)).toBe(true) // Should remove first 0
      expect(list.size).toBe(2)
      expect(list.toArray()).toEqual([-0, 1])
    })

    test('should maintain head and tail pointers correctly during all operations', () => {
      // Test head/tail through observable behavior
      list.push(1) // head=tail=1
      expect(list.get(0)).toBe(1)
      expect(list.shift()).toBe(1) // head=tail=null
      expect(list.size).toBe(0)

      list.push(1).push(2) // head=1, tail=2
      list.unshift(0) // head=0, tail=2
      expect(list.toArray()).toEqual([0, 1, 2])

      list.remove(2) // head=0, tail=1
      expect(list.toArray()).toEqual([0, 1])

      list.remove(0) // head=1, tail=1
      expect(list.toArray()).toEqual([1])
      expect(list.get(0)).toBe(1)
    })
  })
})
