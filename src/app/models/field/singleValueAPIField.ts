import { Schema } from 'mongoose'

import { ISingleValueAPIFieldSchema } from '../../../types'

const createSingleValueAPIFieldSchema = () => {
  return new Schema<ISingleValueAPIFieldSchema>({
    apikey: {
      type: String,
      required: true,
    },
    apiendpoint: { type: String, required: true },
    apijsonkey: { type: String, required: true },
  })
}
export default createSingleValueAPIFieldSchema
