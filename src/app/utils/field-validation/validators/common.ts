import { left, right } from 'fp-ts/lib/Either'

import { ResponseValidator } from 'src/types/field/utils/validation'
import { ISingleAnswerResponse } from 'src/types/response'

export const notEmptySingleAnswerResponse: ResponseValidator<ISingleAnswerResponse> = (
  response,
) => {
  console.log(
    `response.answer.trim().length === 0 is ${
      response.answer.trim().length === 0
    }`,
  )
  console.log(response)
  if (response.answer.trim().length === 0)
    return left(
      'CommonValidator.notEmptySingleAnswerResponse:\tanswer is an empty string',
    )
  return right(response)
}
