import { IField, IFieldSchema } from './baseField'

export interface ISingleValueAPIField extends IField {
  apikey: string
  apiendpoint: string
  apijsonkey: string
}

export interface ISingleValueAPIFieldSchema
  extends ISingleValueAPIField,
    IFieldSchema {}
