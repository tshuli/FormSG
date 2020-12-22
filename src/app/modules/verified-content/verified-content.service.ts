import { err, ok, Result } from 'neverthrow'
import { UnreachableCaseError } from 'ts-essentials'

import formsgSdk from '../../../config/formsg-sdk'
import { createLoggerWithLabel } from '../../../config/logger'
import { AuthType } from '../../../types'

import { EncryptVerifiedContentError } from './verified-content.errors'
import {
  CpVerifiedContent,
  EncryptVerificationContentParams,
  GetVerifiedContentParams,
  SpVerifiedContent,
  VerifiedContentResult,
} from './verified-content.types'
import {
  assertCpVerifiedContentShape,
  assertSpVerifiedContentShape,
  mapDataToKey,
} from './verified-content.utils'

const logger = createLoggerWithLabel(module)

export const getVerifiedContent = ({
  type,
  data,
}: GetVerifiedContentParams): VerifiedContentResult<
  CpVerifiedContent | SpVerifiedContent
> => {
  const processedVerifiedContent = mapDataToKey({ type, data })
  switch (type) {
    case AuthType.SP:
      return assertSpVerifiedContentShape(processedVerifiedContent)
    case AuthType.CP:
      return assertCpVerifiedContentShape(processedVerifiedContent)
    default:
      throw new UnreachableCaseError(type)
  }
}

export const encryptVerifiedContent = ({
  verifiedContent,
  formPublicKey,
  signingSecretKey,
}: EncryptVerificationContentParams & {
  signingSecretKey: string
}): Result<string, EncryptVerifiedContentError> => {
  try {
    const encryptedContent = formsgSdk.crypto.encrypt(
      verifiedContent,
      formPublicKey,
      signingSecretKey,
    )
    return ok(encryptedContent)
  } catch (error) {
    logger.error({
      message: 'Unable to encrypt verified content',
      meta: {
        action: 'encryptVerifiedContent',
      },
      error,
    })

    return err(new EncryptVerifiedContentError())
  }
}
