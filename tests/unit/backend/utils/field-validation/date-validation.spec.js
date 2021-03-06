const {
  validateField,
} = require('../../../../../dist/backend/app/utils/field-validation')

const {
  ValidateFieldError,
} = require('../../../../../dist/backend/app/modules/submission/submission.errors')

describe('Date field validation', () => {
  beforeAll(() => {
    jasmine.clock().install()
    jasmine.clock().mockDate(new Date('2020-01-01'))
  })
  afterAll(() => {
    jasmine.clock().uninstall()
  })
  it('should allow valid date <DD MMM YYYY>', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '09 Jan 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
    expect(validateResult._unsafeUnwrap()).toEqual(true)
  })

  it('should allow empty string when not required', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: false,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
    expect(validateResult._unsafeUnwrap()).toEqual(true)
  })

  it('should allow valid leap year date', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: false,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '29 Feb 2016',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
    expect(validateResult._unsafeUnwrap()).toEqual(true)
  })

  it('should disallow 00 date', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '00 Jan 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow date less than 2 char', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '9 Jan 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow date more than 2 char', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '009 Jan 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow date not in month', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '32 Jan 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow invalid month', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '31 Jon 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow month less then 3 chars', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '16 Jn 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow month more then 3 chars', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '03 June 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow text year', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '31 Jan hello',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow year less than 4 chars', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '31 Jan 201',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow year more than 4 chars', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '31 Jan 02019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow empty string when required', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow invalid leap year date', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '29 Feb 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should allow past dates for normal date fields', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '09 Jan 2019',
    }

    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
    expect(validateResult._unsafeUnwrap()).toEqual(true)
  })

  it('should allow past dates if disallow past dates is not set', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '01 Jan 2019',
    }

    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
    expect(validateResult._unsafeUnwrap()).toEqual(true)
  })

  it('should disallow past dates if disallow past dates is set', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      dateValidation: { selectedDateValidation: 'Disallow past dates' },
      required: true,
    }

    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '29 Feb 2019',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should allow future dates if disallow future dates is not set', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '01 Jan 2021',
    }

    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
    expect(validateResult._unsafeUnwrap()).toEqual(true)
  })

  it('should disallow future dates if disallow future dates is set', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      dateValidation: { selectedDateValidation: 'Disallow future dates' },
      required: true,
    }

    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '01 Jan 2021',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should allow dates inside of Custom Date Range if set', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      dateValidation: {
        selectedDateValidation: 'Custom date range',
        customMinDate: '2020-06-25',
        customMaxDate: '2020-06-28',
      },
      required: true,
    }

    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '25 Jun 2020',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isOk()).toBe(true)
    expect(validateResult._unsafeUnwrap()).toEqual(true)
  })

  it('should disallow dates outside of Custom Date Range if set', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      dateValidation: {
        selectedDateValidation: 'Custom date range',
        customMinDate: '2020-06-25',
        customMaxDate: '2020-06-28',
      },
      required: true,
    }

    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: true,
      answer: '22 Jun 2020',
    }
    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Invalid answer submitted'),
    )
  })

  it('should disallow responses submitted for hidden fields', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'date',
      dateValidation: {
        customMinDate: '2020-06-25',
        customMaxDate: '2020-06-28',
      },
      required: true,
    }

    const response = {
      _id: 'abc123',
      fieldType: 'date',
      isVisible: false,
      answer: '22 Jun 2020',
    }

    const validateResult = validateField('formId', formField, response)
    expect(validateResult.isErr()).toBe(true)
    expect(validateResult._unsafeUnwrapErr()).toEqual(
      new ValidateFieldError('Attempted to submit response on a hidden field'),
    )
  })
})
