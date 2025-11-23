import { BaseError } from "@/errors"
import { register, RETRYABLE_SQL_CODES } from "@/errors"
import type {
  DatabaseErrorContext,
  DatabaseErrorOptions,
  ErrorCauseType,
  MetadataObject,
} from "@/errors"

export class DatabaseError<
  Meta extends MetadataObject = MetadataObject,
  Cause extends ErrorCauseType = ErrorCauseType,
> extends BaseError<Meta, Cause> {
  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  public override name = "DatabaseError"
  public readonly dbContext?: DatabaseErrorContext

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  constructor(message: string, options?: DatabaseErrorOptions<Cause> & { metadata?: Meta }) {
    // Let BaseError handle the sophisticated constructor logic
    // Just add our database-specific defaults
    super(message, {
      ...options,
      category: options?.category ?? "database",
      code: options?.code ?? "DB_ERROR",
      metadata: (options?.metadata ?? (options?.dbContext as Meta) ?? {}) as Meta,
    })

    // Store database context for easy access
    this.dbContext = options?.dbContext
  }

  // ============================================================================
  // STATIC FACTORY METHODS
  // ============================================================================

  /**
   * Create a connection error with appropriate context
   */
  static connection<
    Meta extends MetadataObject = MetadataObject,
    T extends ErrorCauseType = ErrorCauseType,
  >(message: string, host?: string, cause?: T): DatabaseError<Meta, T> {
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
  static query<
    Meta extends MetadataObject = MetadataObject,
    T extends ErrorCauseType = ErrorCauseType,
  >(
    message: string,
    context: Pick<DatabaseErrorContext, "operation" | "table" | "database" | "executionTimeMs">,
    cause?: T,
  ): DatabaseError<Meta, T> {
    return new DatabaseError(message, {
      code: "DB_QUERY_ERROR",
      cause,
      dbContext: context,
    })
  }

  /**
   * Create a timeout error
   */
  static timeout<
    Meta extends MetadataObject = MetadataObject,
    T extends ErrorCauseType = ErrorCauseType,
  >(timeoutMs: number, operation?: string, cause?: T): DatabaseError<Meta, T> {
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
  static constraint<
    Meta extends MetadataObject = MetadataObject,
    T extends ErrorCauseType = ErrorCauseType,
  >(
    constraintType: "UNIQUE" | "FOREIGN_KEY" | "CHECK" | "NOT_NULL",
    table?: string,
    cause?: T,
  ): DatabaseError<Meta, T> {
    return new DatabaseError(`Database constraint violation: ${constraintType}`, {
      code: `DB_CONSTRAINT_${constraintType}`,
      cause,
      dbContext: {
        operation: "CONSTRAINT_VIOLATION",
        table,
      },
    })
  }

  // ============================================================================
  // PUBLIC ACCESSOR PROPERTIES
  // ============================================================================

  /** Get the database operation that failed */
  get operation(): string | undefined {
    return this.dbContext?.operation
  }

  /** Get the table involved in the failed operation */
  get table(): string | undefined {
    return this.dbContext?.table
  }

  /** Get the database name */
  get database(): string | undefined {
    return this.dbContext?.database
  }

  /** Get the database host */
  get host(): string | undefined {
    return this.dbContext?.host
  }

  /** Get the database driver type */
  get driver(): string | undefined {
    return this.dbContext?.driver
  }

  /** Get the SQL error code */
  get sqlCode(): string | number | undefined {
    return this.dbContext?.sqlCode
  }

  /** Get the SQL state */
  get sqlState(): string | undefined {
    return this.dbContext?.sqlState
  }

  /** Get the execution time in milliseconds */
  get executionTimeMs(): number | undefined {
    return this.dbContext?.executionTimeMs
  }

  /** Get the number of affected rows */
  get affectedRows(): number | undefined {
    return this.dbContext?.affectedRows
  }

  // ============================================================================
  // PUBLIC INSTANCE METHODS
  // ============================================================================

  /**
   * Enhanced toString with database context
   */
  override toString(): string {
    const baseStr = super.toString()

    if (!this.dbContext) return baseStr

    const { operation, table, database, host, executionTimeMs, sqlCode, affectedRows } =
      this.dbContext

    const contextParts: string[] = []
    if (operation) contextParts.push(`op: ${operation}`)
    if (table) contextParts.push(`table: ${table}`)
    if (database) contextParts.push(`db: ${database}`)
    if (host) contextParts.push(`host: ${host}`)
    if (executionTimeMs != null) contextParts.push(`time: ${executionTimeMs}ms`)
    if (sqlCode != null) contextParts.push(`sqlCode: ${sqlCode}`)
    if (affectedRows != null) contextParts.push(`rows: ${affectedRows}`)

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

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private isRetryableSqlCode(sqlCode: string | number): boolean {
    // Normalize to string for consistent comparison
    const normalizedCode = String(sqlCode)
    return RETRYABLE_SQL_CODES.includes(normalizedCode)
  }

  private static sanitizeConnectionString(connectionStr: string, maskPassword = true): string {
    if (!maskPassword) {
      return connectionStr
    }

    // Remove sensitive information from connection strings
    return connectionStr
      .replace(/password=[^;&]+/gi, "password=***")
      .replace(/pwd=[^;&]+/gi, "pwd=***")
      .replace(/:\/\/[^:]+:[^@]+@/, "://***:***@")
  }
}

// Auto-register DatabaseError for proper JSON reconstruction
register(DatabaseError)
