import validateField from 'src/app/utils/field-validation'
import EmailValidator from 'src/app/utils/field-validation/validators/EmailValidator.class'

describe('Email field validation', () => {
  beforeEach(() => {
    jest
      .spyOn(EmailValidator.prototype, '_isSignatureValid')
      .mockImplementation(() => true)
  })

  it('should allow valid emails', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      answer: 'valid@email.com',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).not.toThrow()
  })

  it('should disallow invalid emails', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      answer: 'invalidemail.com',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).toThrow()
  })

  it('should allow empty answer for required logic field that is not visible', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
      required: true,
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      isVisible: false,
      answer: '',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).not.toThrow()
  })

  it('should allow email addresses whose email domain belongs to allowedEmailDomains when isVerifiable is true, hasAllowedEmailDomains is true and allowedEmailDomains is not empty', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
      required: true,
      isVerifiable: true,
      hasAllowedEmailDomains: true,
      allowedEmailDomains: ['@test.gov.sg'],
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      isVisible: true,
      answer: 'volunteer-testing@test.gov.sg',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).not.toThrow()
  })

  it('should not allow email addresses whose email domain does not belong to allowedEmailDomains when isVerifiable is true, hasAllowedEmailDomains is true and allowedEmailDomains is not empty', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
      required: true,
      isVerifiable: true,
      hasAllowedEmailDomains: true,
      allowedEmailDomains: ['@example.com'],
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      isVisible: true,
      answer: 'volunteer-testing@test.gov.sg',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).toThrow()
  })

  it('should allow any valid email address when isVerifiable is true, hasAllowedEmailDomains is true but allowedEmailDomains is empty', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
      required: true,
      isVerifiable: true,
      hasAllowedEmailDomains: true,
      allowedEmailDomains: [],
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      isVisible: true,
      answer: 'volunteer-testing@test.gov.sg',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).not.toThrow()
  })

  it('should allow any valid email address when isVerifiable is true and hasAllowedEmailDomains is false, regardless of the cardinality of allowedEmailDomains', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
      required: true,
      isVerifiable: true,
      hasAllowedEmailDomains: false,
      allowedEmailDomains: ['@example.com'],
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      isVisible: true,
      answer: 'volunteer-testing@test.gov.sg',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).not.toThrow()
  })

  it('should allow any valid email address when isVerifiable is false and hasAllowedEmailDomains is true, regardless of the cardinality of allowedEmailDomains', () => {
    const formField = {
      _id: 'abc123',
      fieldType: 'email',
      required: true,
      isVerifiable: false,
      hasAllowedEmailDomains: true,
      allowedEmailDomains: ['@example.com'],
    }
    const response = {
      _id: 'abc123',
      fieldType: 'email',
      isVisible: true,
      answer: 'volunteer-testing@test.gov.sg',
    }
    const testFunc = () => validateField('formId', formField, response)
    expect(testFunc).not.toThrow()
  })
})