// Database-specific error with connection and query context
import type { ErrorCauseType, BaseErrorOptions } from "@/errors"
import { BaseError, ErrorRegistry } from "@/errors"

export interface DatabaseErrorContext {
  /** Database operation type (SELECT, INSERT, UPDATE, DELETE, etc.) */
  operation?: string
  /** Table or collection name */
  table?: string
  /** Database name */
  database?: string
  /** Connection string or host (sanitized) */
  host?: string
  /** Database driver/client type */
  driver?: string
  /** Query execution time in milliseconds */
  executionTimeMs?: number
  /** Number of affected rows */
  affectedRows?: number
  /** SQL error code (if applicable) */
  sqlCode?: string | number
  /** SQL state (if applicable) */
  sqlState?: string
}

export interface DatabaseErrorOptions<Cause extends ErrorCauseType>
  extends BaseErrorOptions<Cause> {
  /** Database-specific context information */
  dbContext?: DatabaseErrorContext
}

export class DatabaseError<Cause extends ErrorCauseType> extends BaseError<Cause> {
  public override name = "DatabaseError"
  public readonly dbContext?: DatabaseErrorContext

  constructor(message: string, options?: DatabaseErrorOptions<Cause>) {
    super(message, {
      ...options,
      category: options?.category ?? "database",
      code: options?.code ?? "DB_ERROR",
    })

    this.dbContext = options?.dbContext
  }

  /**
   * Create a connection error with appropriate context
   */
  static connection<T extends ErrorCauseType = unknown>(
    message: string,
    host?: string,
    cause?: T,
  ): DatabaseError<T> {
    return new DatabaseError(message, {
      code: "DB_CONNECTION_ERROR",
      cause,
      dbContext: {
        operation: "CONNECT",
        host: host ? this.sanitizeConnectionString(host) : undefined,
      },
    })
  }

  /**
   * Create a query error with execution context
   */
  static query<T extends ErrorCauseType = unknown>(
    message: string,
    context: Pick<DatabaseErrorContext, "operation" | "table" | "database" | "executionTimeMs">,
    cause?: T,
  ): DatabaseError<T> {
    return new DatabaseError(message, {
      code: "DB_QUERY_ERROR",
      cause,
      dbContext: context,
    })
  }

  /**
   * Create a timeout error
   */
  static timeout<T extends ErrorCauseType = unknown>(
    timeoutMs: number,
    operation?: string,
    cause?: T,
  ): DatabaseError<T> {
    return new DatabaseError(`Database operation timed out after ${timeoutMs}ms`, {
      code: "DB_TIMEOUT",
      cause,
      dbContext: {
        operation: operation ?? "UNKNOWN",
        executionTimeMs: timeoutMs,
      },
    })
  }

  /**
   * Create a constraint violation error
   */
  static constraint<T extends ErrorCauseType = unknown>(
    constraintType: "UNIQUE" | "FOREIGN_KEY" | "CHECK" | "NOT_NULL",
    table?: string,
    cause?: T,
  ): DatabaseError<T> {
    return new DatabaseError(`Database constraint violation: ${constraintType}`, {
      code: `DB_CONSTRAINT_${constraintType}`,
      cause,
      dbContext: {
        operation: "CONSTRAINT_VIOLATION",
        table,
      },
    })
  }

  /**
   * Enhanced toString with database context
   */
  override toString(): string {
    const baseStr = super.toString()

    if (!this.dbContext) return baseStr

    const contextParts: string[] = []
    if (this.dbContext.operation) contextParts.push(`op: ${this.dbContext.operation}`)
    if (this.dbContext.table) contextParts.push(`table: ${this.dbContext.table}`)
    if (this.dbContext.database) contextParts.push(`db: ${this.dbContext.database}`)
    if (this.dbContext.host) contextParts.push(`host: ${this.dbContext.host}`)
    if (this.dbContext.executionTimeMs)
      contextParts.push(`time: ${this.dbContext.executionTimeMs}ms`)
    if (this.dbContext.sqlCode) contextParts.push(`sqlCode: ${this.dbContext.sqlCode}`)

    if (contextParts.length === 0) return baseStr

    return `${baseStr}\n  Database context: ${contextParts.join(", ")}`
  }

  /**
   * Enhanced JSON serialization with database context
   */
  override toJSON() {
    return {
      ...super.toJSON(),
      dbContext: this.dbContext,
    }
  }

  /**
   * Check if this is a retryable database error
   */
  isRetryable(): boolean {
    const retryableCodes = [
      "DB_CONNECTION_ERROR",
      "DB_TIMEOUT",
      "ECONNRESET",
      "ENOTFOUND",
      "ETIMEDOUT",
    ]

    return (
      retryableCodes.includes(this.code || "") ||
      (this.dbContext?.sqlCode ? this.isRetryableSqlCode(this.dbContext.sqlCode) : false)
    )
  }

  private isRetryableSqlCode(sqlCode: string | number): boolean {
    const retryableSqlCodes = [
      // Connection issues
      2002,
      2003,
      2006,
      2013, // MySQL connection errors
      "08001",
      "08003",
      "08006", // SQL state connection errors
      // Timeout errors
      1205,
      1213, // MySQL lock timeouts
      "40001", // SQL state serialization failure
    ]

    return retryableSqlCodes.includes(sqlCode)
  }

  private static sanitizeConnectionString(connectionStr: string): string {
    // Remove sensitive information from connection strings
    return connectionStr
      .replace(/password=[^;&]+/gi, "password=***")
      .replace(/pwd=[^;&]+/gi, "pwd=***")
      .replace(/:\/\/[^:]+:[^@]+@/, "://***:***@")
  }
}

// Auto-register DatabaseError for proper JSON reconstruction
ErrorRegistry.register(DatabaseError)
