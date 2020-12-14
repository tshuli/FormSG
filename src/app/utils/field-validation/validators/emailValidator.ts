import { chain, left, right } from 'fp-ts/lib/Either'
import { flow } from 'fp-ts/lib/function'
import isEmail from 'validator/lib/isEmail'

import { IEmailField } from 'src/types/field'
import { ResponseValidator } from 'src/types/field/utils/validation'
import { ISingleAnswerResponse } from 'src/types/response'

import { notEmptySingleAnswerResponse } from './common'

type EmailValidator = ResponseValidator<ISingleAnswerResponse>
type EmailValidatorConstructor = (emailField: IEmailField) => EmailValidator

const emailFormatValidator: EmailValidator = (response) => {
  const { answer } = response
  return isEmail(answer)
    ? right(response)
    : left(`EmailValidator:\t answer is not a valid email`)
}

const makeEmailValidator: EmailValidatorConstructor = (emailField) => (
  response,
) => {
  const {
    isVerifiable,
    hasAllowedEmailDomains,
    allowedEmailDomains,
  } = emailField
  const { answer } = response
  const emailAddress = String(answer)
  if (!(isVerifiable && hasAllowedEmailDomains && allowedEmailDomains.length))
    return left('failed')
  const emailDomain = '@' + emailAddress.split('@').pop()

  return allowedEmailDomains.includes(emailDomain)
    ? right(response)
    : left(`EmailValidator:\t answer is not an accepted domain`)
}

export const constructEmailValidator: EmailValidatorConstructor = (
  emailField,
) =>
  flow(
    notEmptySingleAnswerResponse,
    chain(emailFormatValidator),
    chain(makeEmailValidator(emailField)),
  )
