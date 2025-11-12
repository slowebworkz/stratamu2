// Example usage: robust try-catch with error chaining
import { BaseError, DatabaseError, logErrorChainAsync, logFullErrorChainAsync } from './index.ts'

export function exampleErrorChaining() {
  try {
    try {
      try {
        // Simulate a low-level error
        throw new Error('DB connection timed out')
      } catch (networkErr) {
        throw new DatabaseError('Failed to connect to database', { cause: networkErr })
      }
    } catch (dbErr) {
      throw new BaseError('Unable to save user data', { cause: dbErr })
    }
  } catch (finalErr) {
    logErrorChainAsync(finalErr)
    logFullErrorChainAsync(finalErr)
  }
}
