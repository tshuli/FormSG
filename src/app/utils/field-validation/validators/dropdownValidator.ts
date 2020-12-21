import { chain, left, right } from 'fp-ts/lib/Either'
import { flow } from 'fp-ts/lib/function'

import { ProcessedSingleAnswerResponse } from 'src/app/modules/submission/submission.types'
import { IDropdownField } from 'src/types/field'
import { ResponseValidator } from 'src/types/field/utils/validation'

import { notEmptySingleAnswerResponse } from './common'
import { isOneOfOptions } from './options'

type DropdownValidator = ResponseValidator<ProcessedSingleAnswerResponse>
type DropdownValidatorConstructor = (
  dropdownField: IDropdownField,
) => DropdownValidator

const makeDropdownValidator: DropdownValidatorConstructor = (dropdownField) => (
  response,
) => {
  const { fieldOptions } = dropdownField
  const { answer } = response
  return isOneOfOptions(fieldOptions, answer)
    ? right(response)
    : left(`DropdownValidator:\t answer is not a valid dropdown option`)
}

export const constructDropdownValidator: DropdownValidatorConstructor = (
  dropdownField,
) =>
  flow(
    notEmptySingleAnswerResponse,
    chain(makeDropdownValidator(dropdownField)),
  )
