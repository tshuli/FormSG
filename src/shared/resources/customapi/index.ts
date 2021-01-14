import { CustomAPIField } from '../../../types'

interface ICustomAPIFieldType {
  name: CustomAPIField
  value: string
  submitted: boolean
  answerArray: boolean
}

export const types: ICustomAPIFieldType[] = [
  {
    name: CustomAPIField.Single,
    value: 'Single Value API',
    submitted: false,
    answerArray: false,
  },
]
