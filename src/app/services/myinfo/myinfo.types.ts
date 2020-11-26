import {
  IFieldSchema,
  IMyInfo,
  MyInfoAttribute,
  ProcessedFieldResponse,
} from '../../../types'

export interface IPossiblyPrefilledField extends IFieldSchema {
  fieldValue?: string
}

export type MyInfoHashPromises = Partial<
  Record<MyInfoAttribute, Promise<string>>
>

export type VisibleMyInfoResponse = ProcessedFieldResponse & {
  myInfo: IMyInfo
  isVisible: true
  answer: string
}

export type MyInfoComparePromises = Map<string, Promise<boolean>>
