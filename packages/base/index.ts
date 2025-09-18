export class BaseClass {
  constructor(public name: string) {}

  greet(): string {
    return `Hello, ${this.name}!`
  }
}
