import { FeatureNames } from 'src/config/feature-manager'

/**
 * A custom base error class that encapsulates the name, message, status code,
 * and logging meta string (if any) for the error.
 */
export class ApplicationError extends Error {
  /**
   * Http status code for the error to be returned in the response.
   */
  status: number
  /**
   * Meta string to be logged by the application logger, if any.
   */
  meta?: string

  constructor(message?: string, status?: number, meta?: string) {
    super()

    Error.captureStackTrace(this, this.constructor)

    this.name = this.constructor.name

    this.message = message || 'Something went wrong. Please try again.'

    this.status = status || 500

    this.meta = meta
  }
}

export class DatabaseError extends ApplicationError {
  constructor(message?: string) {
    super(message)
  }
}

export class DatabaseValidationError extends ApplicationError {
  constructor(message: string) {
    super(message)
  }
}

export class DatabaseConflictError extends ApplicationError {
  constructor(message: string) {
    super(message)
  }
}

export class DatabasePayloadSizeError extends ApplicationError {
  constructor(message: string) {
    super(message)
  }
}
export class MalformedParametersError extends ApplicationError {
  constructor(message: string) {
    super(message)
  }
}

/**
 * Error thrown when feature-specific functions are called
 * despite those features not being activated.
 */
export class MissingFeatureError extends ApplicationError {
  constructor(missingFeature: FeatureNames) {
    super(
      `${missingFeature} is not activated, but a feature-specific function was called.`,
    )
  }
}
