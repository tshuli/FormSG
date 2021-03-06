/* Type guards */
import {
  BasicField,
  IDateField,
  IDecimalField,
  IEmailFieldSchema,
  IField,
  IFieldSchema,
  IHomenoField,
  ILongTextField,
  IMobileField,
  INricField,
  IRadioField,
  IRatingField,
  ISectionFieldSchema,
  IShortTextField,
} from '..'

export const isSectionField = (
  formField: IField,
): formField is ISectionFieldSchema => {
  return formField.fieldType === BasicField.Section
}

export const isShortTextField = (
  formField: IField,
): formField is IShortTextField => {
  return formField.fieldType === BasicField.ShortText
}

export const isLongTextField = (
  formField: IField,
): formField is ILongTextField => {
  return formField.fieldType === BasicField.LongText
}

export const isNricField = (formField: IField): formField is INricField => {
  return formField.fieldType === BasicField.Nric
}

export const isHomeNumberField = (
  formField: IField,
): formField is IHomenoField => {
  return formField.fieldType === BasicField.HomeNo
}

export const isRadioButtonField = (
  formField: IField,
): formField is IRadioField => {
  return formField.fieldType === BasicField.Radio
}

export const isRatingField = (formField: IField): formField is IRatingField => {
  return formField.fieldType === BasicField.Rating
}

export const isMobileNumberField = (
  formField: IField,
): formField is IMobileField => {
  return formField.fieldType === BasicField.Mobile
}

export const isDateField = (formField: IField): formField is IDateField => {
  return formField.fieldType === BasicField.Date
}

export const isDecimalField = (
  formField: IField,
): formField is IDecimalField => {
  return formField.fieldType === BasicField.Decimal
}

export const isEmailField = (
  formField: IFieldSchema,
): formField is IEmailFieldSchema => {
  return formField.fieldType === BasicField.Email
}
