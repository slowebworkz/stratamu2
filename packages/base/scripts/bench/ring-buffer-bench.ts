import { RingBuffer } from "../../src/data/ring-buffer"

function bench(name: string, fn: () => void) {
  const t0 = performance.now()
  fn()
  const t1 = performance.now()
  console.log(`${name}: ${(t1 - t0).toFixed(3)}ms`)
}

const N = 1_000_000
const batch = Array.from({ length: 1000 }, (_, i) => i)

bench("push loop", () => {
  const rb = new RingBuffer<number>(1000)
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < batch.length; j++) rb.push(batch[j])
  }
})

bench("pushMany array", () => {
  const rb = new RingBuffer<number>(1000)
  for (let i = 0; i < N; i++) {
    rb.pushMany(batch)
  }
})

bench("array shift simulation", () => {
  const cap = 1000
  const arr: number[] = []
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < batch.length; j++) {
      arr.push(batch[j])
      if (arr.length > cap) arr.shift()
    }
  }
})
