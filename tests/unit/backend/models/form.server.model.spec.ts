import { ObjectId } from 'bson-ext'
import { merge, omit, orderBy, pick } from 'lodash'
import mongoose from 'mongoose'

import getFormModel, {
  getEmailFormModel,
  getEncryptedFormModel,
} from 'src/app/models/form.server.model'
import {
  IEmailForm,
  IEmailFormSchema,
  IEncryptedForm,
  IFormSchema,
  IPopulatedUser,
  Permission,
  ResponseMode,
  Status,
} from 'src/types'

import dbHandler from '../helpers/jest-db'

const Form = getFormModel(mongoose)
const EncryptedForm = getEncryptedFormModel(mongoose)
const EmailForm = getEmailFormModel(mongoose)

const MOCK_ADMIN_OBJ_ID = new ObjectId()
const MOCK_ADMIN_DOMAIN = 'example.com'
const MOCK_ADMIN_EMAIL = `test@${MOCK_ADMIN_DOMAIN}`

const MOCK_FORM_PARAMS = {
  title: 'Test Form',
  admin: MOCK_ADMIN_OBJ_ID,
}
const MOCK_ENCRYPTED_FORM_PARAMS = {
  ...MOCK_FORM_PARAMS,
  publicKey: 'mockPublicKey',
  responseMode: ResponseMode.Encrypt,
}
const MOCK_EMAIL_FORM_PARAMS = {
  ...MOCK_FORM_PARAMS,
  emails: [MOCK_ADMIN_EMAIL],
  responseMode: ResponseMode.Email,
}

const FORM_DEFAULTS = {
  authType: 'NIL',
  inactiveMessage:
    'If you think this is a mistake, please contact the agency that gave you the form link.',
  isListed: true,
  startPage: {
    colorTheme: 'blue',
  },
  endPage: {
    title: 'Thank you for filling out the form.',
    buttonText: 'Submit another form',
  },
  hasCaptcha: true,
  form_fields: [],
  form_logics: [],
  permissionList: [],
  webhook: {
    url: '',
  },
  status: 'PRIVATE',
}

describe('Form Model', () => {
  let populatedAdmin: IPopulatedUser

  beforeAll(async () => await dbHandler.connect())
  beforeEach(async () => {
    const preloaded = await dbHandler.insertFormCollectionReqs({
      userId: MOCK_ADMIN_OBJ_ID,
      mailDomain: MOCK_ADMIN_DOMAIN,
    })

    populatedAdmin = merge(preloaded.user, { agency: preloaded.agency })
  })
  afterEach(async () => await dbHandler.clearDatabase())
  afterAll(async () => await dbHandler.closeDatabase())

  describe('Schema', () => {
    describe('Base Schema', () => {
      it('should create and save successfully', async () => {
        // Arrange + Act
        const validForm = new Form(MOCK_FORM_PARAMS)
        const saved = await validForm.save()

        // Assert
        // All fields should exist
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        const expectedObject = merge({}, FORM_DEFAULTS, MOCK_FORM_PARAMS)
        expect(actualSavedObject).toEqual(expectedObject)
      })

      it('should save successfully, but not save fields that is not defined in the schema', async () => {
        // Arrange
        const formParamsWithExtra = merge({}, MOCK_FORM_PARAMS, {
          extra: 'somethingExtra',
        })

        // Act
        const validForm = new Form(formParamsWithExtra)
        const saved = await validForm.save()

        // Assert
        // All fields should exist
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        const expectedObject = merge({}, FORM_DEFAULTS, MOCK_FORM_PARAMS)
        expect(actualSavedObject).toEqual(expectedObject)

        // Extra key should not be saved
        expect(Object.keys(saved)).not.toContain('extra')
      })

      it('should create and save successfully with valid permissionList emails', async () => {
        // Arrange
        // permissionList has email with valid domain
        // Write is also set to true
        const permissionList = [{ email: 'newEmail@example.com', write: true }]
        const formParams = merge({}, MOCK_FORM_PARAMS, {
          permissionList,
        })

        const validForm = new Form(formParams)
        const saved = await validForm.save()

        // Assert
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        // Remove permissionList too due to objects inside having
        // indeterministic IDs, check separately.
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
          'permissionList',
        ])
        const expectedObject = merge(
          {},
          omit(FORM_DEFAULTS, 'permissionList'),
          MOCK_FORM_PARAMS,
        )
        expect(actualSavedObject).toEqual(expectedObject)

        // Remove indeterministic id from actual permission list
        const actualPermissionList = saved
          .toObject()
          .permissionList.map((permission: Permission[]) =>
            omit(permission, '_id'),
          )
        expect(actualPermissionList).toEqual(permissionList)
      })

      it('should save new admin successfully but remove new admin from permissionList', async () => {
        // Arrange
        const newAdmin = await dbHandler.insertUser({
          agencyId: populatedAdmin.agency._id,
          mailDomain: MOCK_ADMIN_DOMAIN,
          mailName: 'newAdmin',
        })
        // Create new form with newAdmin as collaborator
        const validForm = await new Form({
          ...MOCK_FORM_PARAMS,
          permissionList: [{ email: newAdmin.email, write: false }],
        }).save()

        // Act
        validForm.admin = newAdmin._id
        const updatedForm = (await validForm.save()).toObject()

        // Assert
        expect(updatedForm.admin).toEqual(newAdmin._id)
        // PermissionList should now be empty.
        expect(updatedForm.permissionList).toEqual([])
      })

      it('should reject when admin id is invalid', async () => {
        // Arrange
        const invalidAdminId = new ObjectId()
        const paramsWithInvalidAdmin = merge({}, MOCK_FORM_PARAMS, {
          admin: invalidAdminId,
        })

        // Act
        const invalidForm = new Form(paramsWithInvalidAdmin)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          'Admin for this form is not found.',
        )
      })

      it('should reject when form title is missing', async () => {
        // Arrange
        const paramsWithoutTitle = omit(MOCK_FORM_PARAMS, 'title')

        // Act
        const invalidForm = new Form(paramsWithoutTitle)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when form admin is missing', async () => {
        // Arrange
        const paramsWithoutAdmin = omit(MOCK_FORM_PARAMS, 'admin')

        // Act
        const invalidForm = new Form(paramsWithoutAdmin)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          'Admin for this form is not found.',
        )
      })

      it('should reject when form permissionList[].email is missing', async () => {
        // Arrange
        // permissionList has missing email key
        const invalidPermissionList = [{ write: true }]
        const malformedParams = merge({}, MOCK_FORM_PARAMS, {
          permissionList: invalidPermissionList,
        })

        // Act
        const invalidForm = new Form(malformedParams)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when form permissionList[].email is not in the Agency collection', async () => {
        // Arrange
        // permissionList has an email domain not inside Agency collection
        const invalidPermissionList = [
          { email: 'test@example2.com', write: true },
        ]
        const malformedParams = merge({}, MOCK_FORM_PARAMS, {
          permissionList: invalidPermissionList,
        })

        // Act
        const invalidForm = new Form(malformedParams)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })
    })

    describe('Encrypted form schema', () => {
      const ENCRYPT_FORM_DEFAULTS = merge(
        { responseMode: 'encrypt' },
        FORM_DEFAULTS,
      )

      it('should create and save successfully', async () => {
        // Arrange + Act
        const validForm = new EncryptedForm(MOCK_ENCRYPTED_FORM_PARAMS)
        const saved = await validForm.save()

        // Assert
        // All fields should exist
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        const expectedObject = merge(
          {},
          ENCRYPT_FORM_DEFAULTS,
          MOCK_ENCRYPTED_FORM_PARAMS,
        )
        expect(actualSavedObject).toEqual(expectedObject)
      })

      it('should save successfully, but not save fields that is not defined in the schema', async () => {
        // Arrange
        const formParamsWithExtra = merge({}, MOCK_ENCRYPTED_FORM_PARAMS, {
          extra: 'somethingExtra',
        })

        // Act
        const validForm = new EncryptedForm(formParamsWithExtra)
        const saved = await validForm.save()

        // Assert
        // All fields should exist
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        const expectedObject = merge(
          {},
          ENCRYPT_FORM_DEFAULTS,
          MOCK_ENCRYPTED_FORM_PARAMS,
        )
        expect(actualSavedObject).toEqual(expectedObject)

        // Extra key should not be saved
        expect(Object.keys(saved)).not.toContain('extra')
      })

      it('should create and save successfully with valid permissionList emails', async () => {
        // Arrange
        // permissionList has email with valid domain
        // Write is also set to true
        const permissionList = [{ email: 'newEmail2@example.com', write: true }]
        const formParams = merge({}, MOCK_ENCRYPTED_FORM_PARAMS, {
          permissionList,
        })

        const validForm = new EncryptedForm(formParams)
        const saved = await validForm.save()

        // Assert
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        // Remove permissionList too due to objects inside having
        // indeterministic IDs, check separately.
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
          'permissionList',
        ])
        const expectedObject = merge(
          {},
          omit(ENCRYPT_FORM_DEFAULTS, 'permissionList'),
          MOCK_ENCRYPTED_FORM_PARAMS,
        )
        expect(actualSavedObject).toEqual(expectedObject)

        // Remove indeterministic id from actual permission list
        const actualPermissionList = (saved.toObject() as IEncryptedForm).permissionList?.map(
          (permission) => omit(permission, '_id'),
        )
        expect(actualPermissionList).toEqual(permissionList)
      })

      it('should save new admin successfully but remove new admin from permissionList', async () => {
        // Arrange
        const newAdmin = await dbHandler.insertUser({
          agencyId: populatedAdmin.agency._id,
          mailDomain: MOCK_ADMIN_DOMAIN,
          mailName: 'newAdmin',
        })
        // Create new form with newAdmin as collaborator
        const validForm = await new Form({
          ...MOCK_ENCRYPTED_FORM_PARAMS,
          permissionList: [{ email: newAdmin.email, write: false }],
        }).save()

        // Act
        validForm.admin = newAdmin._id
        const updatedForm = (await validForm.save()).toObject()

        // Assert
        expect(updatedForm.admin).toEqual(newAdmin._id)
        // PermissionList should now be empty.
        expect(updatedForm.permissionList).toEqual([])
      })

      it('should reject when publicKey is missing', async () => {
        // Arrange
        const paramsWithoutPublicKey = omit(
          MOCK_ENCRYPTED_FORM_PARAMS,
          'publicKey',
        )

        // Act
        const invalidForm = new EncryptedForm(paramsWithoutPublicKey)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when admin id is invalid', async () => {
        // Arrange
        const invalidAdminId = new ObjectId()
        const paramsWithInvalidAdmin = merge({}, MOCK_ENCRYPTED_FORM_PARAMS, {
          admin: invalidAdminId,
        })

        // Act
        const invalidForm = new EncryptedForm(paramsWithInvalidAdmin)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          'Admin for this form is not found.',
        )
      })

      it('should reject when form title is missing', async () => {
        // Arrange
        const paramsWithoutTitle = omit(MOCK_ENCRYPTED_FORM_PARAMS, 'title')

        // Act
        const invalidForm = new EncryptedForm(paramsWithoutTitle)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when form admin is missing', async () => {
        // Arrange
        const paramsWithoutAdmin = omit(MOCK_ENCRYPTED_FORM_PARAMS, 'admin')

        // Act
        const invalidForm = new EncryptedForm(paramsWithoutAdmin)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          'Admin for this form is not found.',
        )
      })

      it('should reject when form permissionList[].email is missing', async () => {
        // Arrange
        // permissionList has missing email key
        const invalidPermissionList = [{ write: true }]
        const malformedParams = merge({}, MOCK_ENCRYPTED_FORM_PARAMS, {
          permissionList: invalidPermissionList,
        })

        // Act
        const invalidForm = new EncryptedForm(malformedParams)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when form permissionList[].email is not in the Agency collection', async () => {
        // Arrange
        // permissionList has an email domain not inside Agency collection
        const invalidPermissionList = [
          { email: 'test@example2.com', write: true },
        ]
        const malformedParams = merge({}, MOCK_ENCRYPTED_FORM_PARAMS, {
          permissionList: invalidPermissionList,
        })

        // Act
        const invalidForm = new EncryptedForm(malformedParams)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })
    })

    describe('Email form schema', () => {
      const EMAIL_FORM_DEFAULTS = merge(
        { responseMode: 'email' },
        FORM_DEFAULTS,
      )

      it('should create and save successfully', async () => {
        // Arrange + Act
        const validForm = new EmailForm(MOCK_EMAIL_FORM_PARAMS)
        const saved = await validForm.save()

        // Assert
        // All fields should exist
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        const expectedObject = merge(
          {},
          EMAIL_FORM_DEFAULTS,
          MOCK_EMAIL_FORM_PARAMS,
        )
        expect(actualSavedObject).toEqual(expectedObject)
      })

      it('should save successfully, but not save fields that is not defined in the schema', async () => {
        // Arrange
        const formParamsWithExtra = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          extra: 'somethingExtra',
        })

        // Act
        const validForm = new EmailForm(formParamsWithExtra)
        const saved = await validForm.save()

        // Assert
        // All fields should exist
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        const expectedObject = merge(
          {},
          EMAIL_FORM_DEFAULTS,
          MOCK_EMAIL_FORM_PARAMS,
        )
        expect(actualSavedObject).toEqual(expectedObject)

        // Extra key should not be saved
        expect(Object.keys(saved)).not.toContain('extra')
      })

      it('should coerce comma-separated email string into an array of emails', async () => {
        // Arrange + Act
        const mockEmailsString = 'test1@b.com, test2@b.com'
        const mockEmailsArray = ['test1@b.com', 'test2@b.com']
        const formParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          emails: mockEmailsString,
        })
        const validForm = new EmailForm(formParams)
        const saved = await validForm.save()

        // Assert
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        // Remove permissionList too due to objects inside having
        // indeterministic IDs, check separately.
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
          'emails',
          'permissionList',
        ])
        const expectedObject = merge(
          {},
          omit(EMAIL_FORM_DEFAULTS, 'permissionList'),
          omit(MOCK_EMAIL_FORM_PARAMS, 'emails'),
        )
        expect(actualSavedObject).toEqual(expectedObject)

        const actualEmails = saved.toObject().emails
        expect(actualEmails).toEqual(mockEmailsArray)
      })

      it('should create and save successfully with valid permissionList emails', async () => {
        // Arrange
        // permissionList has email with valid domain
        // Write is also set to true
        const permissionList = [{ email: 'another1@example.com', write: true }]
        const formParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          permissionList: permissionList,
        })

        const validForm = new EmailForm(formParams)
        const saved = await validForm.save()

        // Assert
        // Object Id should be defined when successfully saved to MongoDB.
        expect(saved._id).toBeDefined()
        expect(saved.created).toBeInstanceOf(Date)
        expect(saved.lastModified).toBeInstanceOf(Date)
        // Retrieve object and compare to params, remove indeterministic keys
        // Remove permissionList too due to objects inside having
        // indeterministic IDs, check separately.
        const actualSavedObject = omit(saved.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
          'permissionList',
        ])
        const expectedObject = merge(
          {},
          omit(EMAIL_FORM_DEFAULTS, 'permissionList'),
          MOCK_EMAIL_FORM_PARAMS,
        )
        expect(actualSavedObject).toEqual(expectedObject)

        // Remove indeterministic id from actual permission list
        const actualPermissionList = saved
          .toObject()
          .permissionList.map((permission: Permission[]) =>
            omit(permission, '_id'),
          )
        expect(actualPermissionList).toEqual(permissionList)
      })

      it('should save new admin successfully but remove new admin from permissionList', async () => {
        // Arrange
        const newAdmin = await dbHandler.insertUser({
          agencyId: populatedAdmin.agency._id,
          mailDomain: MOCK_ADMIN_DOMAIN,
          mailName: 'newAdmin',
        })
        // Create new form with newAdmin as collaborator
        const validForm = await new Form({
          ...MOCK_EMAIL_FORM_PARAMS,
          permissionList: [{ email: newAdmin.email, write: true }],
        }).save()

        // Act
        validForm.admin = newAdmin._id
        const updatedForm = (await validForm.save()).toObject()

        // Assert
        expect(updatedForm.admin).toEqual(newAdmin._id)
        // PermissionList should now be empty.
        expect(updatedForm.permissionList).toEqual([])
      })

      it('should reject when emails array is missing', async () => {
        // Arrange
        const paramsWithoutEmailsArray = omit(MOCK_EMAIL_FORM_PARAMS, 'emails')

        // Act
        const invalidForm = new EmailForm(paramsWithoutEmailsArray)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when emails array is empty', async () => {
        // Arrange
        const paramsWithEmptyEmailsArray = {
          ...MOCK_EMAIL_FORM_PARAMS,
          emails: [],
        }

        // Act
        const invalidForm = new EmailForm(paramsWithEmptyEmailsArray)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when admin id is invalid', async () => {
        // Arrange
        const invalidAdminId = new ObjectId()
        const paramsWithInvalidAdmin = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          admin: invalidAdminId,
        })

        // Act
        const invalidForm = new EmailForm(paramsWithInvalidAdmin)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          'Admin for this form is not found.',
        )
      })

      it('should reject when form title is missing', async () => {
        // Arrange
        const paramsWithoutTitle = omit(MOCK_EMAIL_FORM_PARAMS, 'title')

        // Act
        const invalidForm = new EmailForm(paramsWithoutTitle)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when form admin is missing', async () => {
        // Arrange
        const paramsWithoutAdmin = omit(MOCK_EMAIL_FORM_PARAMS, 'admin')

        // Act
        const invalidForm = new EmailForm(paramsWithoutAdmin)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          'Admin for this form is not found.',
        )
      })

      it('should reject when form permissionList[].email is missing', async () => {
        // Arrange
        // permissionList has missing email key
        const invalidPermissionList = [{ write: true }]
        const malformedParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          permissionList: invalidPermissionList,
        })

        // Act
        const invalidForm = new EmailForm(malformedParams)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })

      it('should reject when form permissionList[].email is not in the Agency collection', async () => {
        // Arrange
        // permissionList has an email domain not inside Agency collection
        const invalidPermissionList = [
          { email: 'test@example2.com', write: true },
        ]
        const malformedParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          permissionList: invalidPermissionList,
        })

        // Act
        const invalidForm = new EmailForm(malformedParams)

        // Assert
        await expect(invalidForm.save()).rejects.toThrowError(
          mongoose.Error.ValidationError,
        )
      })
    })
  })

  describe('Statics', () => {
    describe('deactivateById', () => {
      it('should correctly deactivate form for valid ID', async () => {
        const formParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          admin: populatedAdmin,
          status: Status.Public,
        })
        const form = await Form.create(formParams)
        await Form.deactivateById(form._id)
        const updated = await Form.findById(form._id)
        expect(updated!.status).toBe('PRIVATE')
      })

      it('should not deactivate archived form', async () => {
        const formParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          admin: populatedAdmin,
          status: Status.Archived,
        })
        const form = await Form.create(formParams)
        await Form.deactivateById(form._id)
        const updated = await Form.findById(form._id)
        expect(updated!.status).toBe('ARCHIVED')
      })

      it('should return null for invalid form ID', async () => {
        const returned = await Form.deactivateById(String(new ObjectId()))
        expect(returned).toBeNull()
      })
    })

    describe('getFullFormById', () => {
      it('should return null when the formId is invalid', async () => {
        // Arrange
        const invalidFormId = new ObjectId()

        // Act
        const form = await Form.getFullFormById(String(invalidFormId))

        // Assert
        expect(form).toBeNull()
      })

      it('should return the populated email form when formId is valid', async () => {
        // Arrange
        const emailFormParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          admin: populatedAdmin,
        })
        // Create a form
        const form = (await Form.create(emailFormParams)).toObject()

        // Act
        const actualForm = (await Form.getFullFormById(form._id))?.toObject()

        // Assert
        // Form should be returned
        expect(actualForm).not.toBeNull()
        // Omit admin key since it is populated is not ObjectId anymore.
        expect(omit(actualForm, 'admin')).toEqual(omit(form, 'admin'))
        // Verify populated admin shape
        expect(actualForm.admin).not.toBeNull()
        expect(actualForm.admin.email).toEqual(populatedAdmin.email)
        // Remove indeterministic keys
        const expectedAgency = omit(populatedAdmin.agency.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        expect(actualForm.admin.agency).toEqual(
          expect.objectContaining(expectedAgency),
        )
      })

      it('should return the populated encrypt form when formId is valid', async () => {
        // Arrange
        const encryptFormParams = merge({}, MOCK_ENCRYPTED_FORM_PARAMS, {
          admin: populatedAdmin,
        })
        // Create a form
        const form = (await Form.create(encryptFormParams)).toObject()

        // Act
        const actualForm = (await Form.getFullFormById(form._id))?.toObject()

        // Assert
        // Form should be returned
        expect(actualForm).not.toBeNull()
        // Omit admin key since it is populated is not ObjectId anymore.
        expect(omit(actualForm, 'admin')).toEqual(omit(form, 'admin'))
        // Verify populated admin shape
        expect(actualForm.admin).not.toBeNull()
        expect(actualForm.admin.email).toEqual(populatedAdmin.email)
        // Remove indeterministic keys
        const expectedAgency = omit(populatedAdmin.agency.toObject(), [
          '_id',
          'created',
          'lastModified',
          '__v',
        ])
        expect(actualForm.admin.agency).toEqual(
          expect.objectContaining(expectedAgency),
        )
      })
    })

    describe('getOtpData', () => {
      it('should return null when formId does not exist', async () => {
        // Arrange
        const invalidFormId = new ObjectId()

        // Act
        const form = await Form.getOtpData(String(invalidFormId))

        // Assert
        expect(form).toBeNull()
      })

      it('should return otpData of an email form when formId is valid', async () => {
        // Arrange
        const emailFormParams = merge({}, MOCK_EMAIL_FORM_PARAMS, {
          msgSrvcName: 'mockSrvcName',
        })
        // Create a form with msgSrvcName
        const form = await Form.create(emailFormParams)

        // Act
        const actualOtpData = await Form.getOtpData(form._id)

        // Assert
        // OtpData should be returned
        expect(actualOtpData).not.toBeNull()
        // Check shape
        const expectedOtpData = {
          form: form._id,
          formAdmin: {
            email: populatedAdmin.email,
            userId: populatedAdmin._id,
          },
          msgSrvcName: emailFormParams.msgSrvcName,
        }
        expect(actualOtpData).toEqual(expectedOtpData)
      })

      it('should return otpData of an encrypt form when formId is valid', async () => {
        // Arrange
        const encryptFormParams = merge({}, MOCK_ENCRYPTED_FORM_PARAMS, {
          msgSrvcName: 'mockSrvcName',
        })
        // Create a form with msgSrvcName
        const form = await Form.create(encryptFormParams)

        // Act
        const actualOtpData = await Form.getOtpData(form._id)

        // Assert
        // OtpData should be returned
        expect(actualOtpData).not.toBeNull()
        // Check shape
        const expectedOtpData = {
          form: form._id,
          formAdmin: {
            email: populatedAdmin.email,
            userId: populatedAdmin._id,
          },
          msgSrvcName: encryptFormParams.msgSrvcName,
        }
        expect(actualOtpData).toEqual(expectedOtpData)
      })
    })

    describe('getMetaByUserIdOrEmail', () => {
      it('should return empty array when user has no forms to view', async () => {
        // Arrange
        const randomUserId = new ObjectId()
        const invalidEmail = 'not-valid@example.com'

        // Act
        const actual = await Form.getMetaByUserIdOrEmail(
          randomUserId,
          invalidEmail,
        )

        // Assert
        expect(actual).toEqual([])
      })

      it('should return array of forms user is permitted to view', async () => {
        // Arrange
        // Add additional user.
        const differentUserId = new ObjectId()
        const diffPreload = await dbHandler.insertFormCollectionReqs({
          userId: differentUserId,
          mailName: 'something-else',
          mailDomain: MOCK_ADMIN_DOMAIN,
        })
        const diffPopulatedAdmin = merge(diffPreload.user, {
          agency: diffPreload.agency,
        })
        // Populate multiple forms with different permissions.
        // Is admin.
        const userOwnedForm = await Form.create(MOCK_EMAIL_FORM_PARAMS)
        // Has write permissions.
        const userWritePermissionForm = await Form.create({
          ...MOCK_ENCRYPTED_FORM_PARAMS,
          admin: diffPopulatedAdmin._id,
          permissionList: [{ email: populatedAdmin.email, write: true }],
        })
        // Has read permissions.
        const userReadPermissionForm = await Form.create({
          ...MOCK_ENCRYPTED_FORM_PARAMS,
          admin: diffPopulatedAdmin._id,
          // Only read permissions, no write permission.
          permissionList: [{ email: populatedAdmin.email, write: false }],
        })
        // Should not be fetched since form is archived.
        await Form.create({
          ...MOCK_ENCRYPTED_FORM_PARAMS,
          status: Status.Archived,
        })
        // Should not be fetched (not collab or admin).
        await Form.create({
          ...MOCK_ENCRYPTED_FORM_PARAMS,
          admin: differentUserId,
          // currentUser does not have permissions.
        })

        // Act
        const actual = await Form.getMetaByUserIdOrEmail(
          populatedAdmin._id,
          populatedAdmin.email,
        )

        // Assert
        // Coerce into expected shape.
        const keysToPick = [
          '_id',
          'title',
          'lastModified',
          'status',
          'responseMode',
        ]
        const expected = orderBy(
          [
            // Should return form with admin themselves.
            merge(pick(userOwnedForm.toObject(), keysToPick), {
              admin: populatedAdmin.toObject(),
            }),
            // Should return form where admin has write permission.
            merge(pick(userWritePermissionForm.toObject(), keysToPick), {
              admin: diffPopulatedAdmin.toObject(),
            }),
            // Should return form where admin has read permission.
            merge(pick(userReadPermissionForm.toObject(), keysToPick), {
              admin: diffPopulatedAdmin.toObject(),
            }),
          ],
          'lastModified',
          'desc',
        )
        // Should return list containing only three forms:
        // (admin, read perms, write perms),
        // even though there are 5 forms in the collection.
        await expect(Form.countDocuments()).resolves.toEqual(5)
        expect(actual.length).toEqual(3)
        expect(actual).toEqual(expected)
      })
    })
  })

  describe('Methods', () => {
    // TODO(#102): Add tests for other form instance methods.
    let validForm: IFormSchema

    beforeEach(async () => {
      validForm = await Form.create<IEmailFormSchema>({
        admin: populatedAdmin._id,
        responseMode: ResponseMode.Email,
        title: 'mock email form',
        emails: [populatedAdmin.email],
      })
    })

    describe('archive', () => {
      it('should successfully set email form status to archived', async () => {
        // Arrange
        const form = await Form.create<IEmailForm>({
          admin: populatedAdmin._id,
          emails: [populatedAdmin.email],
          responseMode: ResponseMode.Email,
          title: 'mock email form',
          status: Status.Private,
        })
        expect(form).toBeDefined()

        // Act
        const actual = await form.archive()

        // Assert
        expect(actual.status).toEqual(Status.Archived)
      })

      it('should successfully set encrypt form status to archived', async () => {
        // Arrange
        const form = await Form.create<IEncryptedForm>({
          admin: populatedAdmin._id,
          publicKey: 'any public key',
          responseMode: ResponseMode.Encrypt,
          title: 'mock encrypt form',
          status: Status.Public,
        })
        expect(form).toBeDefined()

        // Act
        const actual = await form.archive()

        // Assert
        expect(actual.status).toEqual(Status.Archived)
      })

      it('should stay archived if original form is already archived', async () => {
        // Arrange
        const form = await Form.create<IEncryptedForm>({
          admin: populatedAdmin._id,
          publicKey: 'any public key',
          responseMode: ResponseMode.Encrypt,
          title: 'mock encrypt form',
          status: Status.Archived,
        })
        expect(form).toBeDefined()

        // Act
        const actual = await form.archive()

        // Assert
        expect(actual.status).toEqual(Status.Archived)
      })
    })

    describe('getDashboardView', () => {
      it('should return dashboard view of email mode form', async () => {
        // Arrange
        const form = await Form.create<IEmailForm>({
          admin: populatedAdmin._id,
          emails: [populatedAdmin.email],
          responseMode: ResponseMode.Email,
          title: 'mock email form',
          status: Status.Private,
        })
        expect(form).toBeDefined()
        // Add additional user.
        const diffPreload = await dbHandler.insertFormCollectionReqs({
          userId: new ObjectId(),
          mailName: 'another',
          mailDomain: MOCK_ADMIN_DOMAIN,
        })
        const diffPopulatedAdmin = merge(diffPreload.user, {
          agency: diffPreload.agency,
        })

        // Act
        const actual = form.getDashboardView(diffPopulatedAdmin)

        // Assert
        expect(actual).toEqual({
          _id: form._id,
          title: form.title,
          status: form.status,
          lastModified: form.lastModified,
          responseMode: form.responseMode,
          admin: diffPopulatedAdmin,
        })
      })

      it('should return dashboard view of encrypt mode form', async () => {
        // Arrange
        const form = await Form.create<IEncryptedForm>({
          admin: populatedAdmin._id,
          responseMode: ResponseMode.Encrypt,
          publicKey: 'some public key',
          title: 'mock email form',
          status: Status.Private,
        })
        expect(form).toBeDefined()
        // Add additional user.
        const diffPreload = await dbHandler.insertFormCollectionReqs({
          userId: new ObjectId(),
          mailName: 'another-thing',
          mailDomain: MOCK_ADMIN_DOMAIN,
        })
        const diffPopulatedAdmin = merge(diffPreload.user, {
          agency: diffPreload.agency,
        })

        // Act
        const actual = form.getDashboardView(diffPopulatedAdmin)

        // Assert
        expect(actual).toEqual({
          _id: form._id,
          title: form.title,
          status: form.status,
          lastModified: form.lastModified,
          responseMode: form.responseMode,
          admin: diffPopulatedAdmin,
        })
      })
    })

    describe('transferOwner', () => {
      it('should successfully transfer form ownership', async () => {
        // Arrange
        const newUser = await dbHandler.insertUser({
          agencyId: populatedAdmin.agency._id,
          mailName: 'newUser',
          mailDomain: MOCK_ADMIN_DOMAIN,
        })

        // Act
        const actual = await validForm.transferOwner(populatedAdmin, newUser)

        // Assert
        expect(actual).toBeDefined()
        // New admin should be new user.
        expect(actual.admin).toEqual(newUser._id)
        // Previous user should now be in permissionList with editor
        // permissions.
        expect(actual.toObject().permissionList).toEqual([
          { email: populatedAdmin.email, write: true, _id: expect.anything() },
        ])
      })
    })
  })
})
