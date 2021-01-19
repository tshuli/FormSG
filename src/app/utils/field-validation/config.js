const { types: basicTypes } = require('../../../shared/resources/basic')
const { types: customAPITypes } = require('../../../shared/resources/customapi')

const FIELDS_TO_REJECT = [...basicTypes, ...customAPITypes]
  .filter((f) => !f.submitted)
  .map((f) => f.name)

// deprecated
const ALLOWED_VALIDATORS = [
  'YesNoValidator',
  'EmailValidator',
  'DropdownValidator',
  'NumberValidator',
  'MobileValidator',
  'RatingValidator',
  'TextValidator',
  'TableValidator',
  'AttachmentValidator',
  'CheckboxValidator',
  // BaseFieldValidator can be constructed by the FieldValidatorFactory,
  // but is missing from this list.
  // 'BaseFieldValidator',
]

module.exports = {
  FIELDS_TO_REJECT,
  ALLOWED_VALIDATORS,
}
