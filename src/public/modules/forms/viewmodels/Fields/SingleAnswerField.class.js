const AnswerField = require('./AnswerField.class')

/**
 * Superclass for all fields which return a single answer as opposed
 * to an array.
 */
class SingleAnswerField extends AnswerField {
  constructor(fieldData) {
    super(fieldData)
    // This check prevents overriding of injected MyInfo values
    if (!this.fieldValue) {
      this.fieldValue = ''
    }
  }

  /**
   * Returns the answer to the field if it is given, or an empty
   * string if answer is not defined.
   */
  getResponse() {
    const response = super.getResponse()
    response.answer =
      this.fieldValue === undefined || this.fieldValue === null
        ? ''
        : String(this.fieldValue)
    return response
  }

  clear(shouldClearMyInfo) {
    if (this.myInfo && this.myInfo.attr && !shouldClearMyInfo) {
      return
    }
    this.fieldValue = ''
  }
}

module.exports = SingleAnswerField
