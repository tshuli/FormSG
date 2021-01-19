import { IField, IFieldSchema } from './baseField'

export interface ISingleValueAPIField extends IField {
  apikey: string
  apiendpoint: string
}

export interface ISingleValueAPIFieldSchema
  extends ISingleValueAPIField,
    IFieldSchema {}
