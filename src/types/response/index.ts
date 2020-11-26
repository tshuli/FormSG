import { BasicField, IFieldSchema, IMyInfo } from '../field'

export type AttachmentsMap = Record<IFieldSchema['_id'], File>

interface IBaseResponse {
  _id: IFieldSchema['_id']
  fieldType: BasicField
  question: string
  myInfo?: IMyInfo
}

export interface ISingleAnswerResponse extends IBaseResponse {
  answer: string
}

export interface IAttachmentResponse extends ISingleAnswerResponse {
  filename: string
  content: Buffer
}

export interface ICheckboxResponse extends IBaseResponse {
  answerArray: string[]
}

export interface ITableResponse extends IBaseResponse {
  answerArray: string[][]
}

export type FieldResponse =
  | ISingleAnswerResponse
  | ICheckboxResponse
  | ITableResponse
  | IAttachmentResponse

interface IClientSubmission {
  attachments: AttachmentsMap
  captchaResponse: string
  isPreview: boolean
  responses: FieldResponse[]
}

export type IClientEmailSubmission = IClientSubmission

export interface IClientEncryptSubmission extends IClientSubmission {
  encryptedContent: string
  version: number
}

type ProcessedResponse = {
  isVisible?: boolean
  isUserVerified?: boolean
}

export type ProcessedSingleAnswerResponse = ISingleAnswerResponse &
  ProcessedResponse

export type ProcessedCheckboxResponse = ICheckboxResponse & ProcessedResponse
export type ProcessedTableResponse = ITableResponse & ProcessedResponse
export type ProcessedAttachmentResponse = IAttachmentResponse &
  ProcessedResponse

export type ProcessedFieldResponse =
  | ProcessedSingleAnswerResponse
  | ProcessedCheckboxResponse
  | ProcessedTableResponse
  | ProcessedAttachmentResponse
