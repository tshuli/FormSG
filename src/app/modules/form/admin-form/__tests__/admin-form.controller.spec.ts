import { PresignedPost } from 'aws-sdk/clients/s3'
import { ObjectId } from 'bson-ext'
import { merge } from 'lodash'
import { errAsync, okAsync } from 'neverthrow'
import { PassThrough } from 'stream'
import { mocked } from 'ts-jest/utils'

import * as AuthService from 'src/app/modules/auth/auth.service'
import {
  DatabaseConflictError,
  DatabaseError,
  DatabasePayloadSizeError,
  DatabaseValidationError,
} from 'src/app/modules/core/core.errors'
import * as FeedbackService from 'src/app/modules/feedback/feedback.service'
import { FeedbackResponse } from 'src/app/modules/feedback/feedback.types'
import * as SubmissionService from 'src/app/modules/submission/submission.service'
import { MissingUserError } from 'src/app/modules/user/user.errors'
import {
  FormMetaView,
  IForm,
  IFormSchema,
  IPopulatedForm,
  IPopulatedUser,
  IUserSchema,
  ResponseMode,
} from 'src/types'

import expressHandler from 'tests/unit/backend/helpers/jest-express'

import * as UserService from '../../../user/user.service'
import {
  ForbiddenFormError,
  FormDeletedError,
  FormNotFoundError,
  PrivateFormError,
  TransferOwnershipError,
} from '../../form.errors'
import { removePrivateDetailsFromForm } from '../../form.utils'
import * as AdminFormController from '../admin-form.controller'
import {
  CreatePresignedUrlError,
  InvalidFileTypeError,
} from '../admin-form.errors'
import * as AdminFormService from '../admin-form.service'
import { DuplicateFormBody, PermissionLevel } from '../admin-form.types'

jest.mock('src/app/modules/auth/auth.service')
const MockAuthService = mocked(AuthService)
jest.mock('src/app/modules/feedback/feedback.service')
const MockFeedbackService = mocked(FeedbackService)
jest.mock('src/app/modules/submission/submission.service')
const MockSubmissionService = mocked(SubmissionService)
jest.mock('../admin-form.service')
const MockAdminFormService = mocked(AdminFormService)
jest.mock('../../../user/user.service')
const MockUserService = mocked(UserService)

describe('admin-form.controller', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('handleListDashboardForms', () => {
    const MOCK_REQ = expressHandler.mockRequest({
      session: {
        user: {
          _id: 'exists',
        },
      },
    })
    it('should return 200 with list of forms', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock return array.
      MockAdminFormService.getDashboardForms.mockReturnValueOnce(okAsync([]))

      // Act
      await AdminFormController.handleListDashboardForms(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith([])
    })

    it('should return 422 on MissingUserError', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockAdminFormService.getDashboardForms.mockReturnValueOnce(
        errAsync(new MissingUserError()),
      )

      // Act
      await AdminFormController.handleListDashboardForms(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toBeCalledWith(422)
      expect(mockRes.json).toBeCalledWith({ message: 'User not found' })
    })

    it('should return 500 when database error occurs', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'something went wrong'
      MockAdminFormService.getDashboardForms.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleListDashboardForms(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toBeCalledWith(500)
      expect(mockRes.json).toBeCalledWith({ message: mockErrorString })
    })
  })

  describe('handleCreateForm', () => {
    const MOCK_USER_ID = new ObjectId()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IUserSchema
    const MOCK_FORM = {
      admin: MOCK_USER_ID,
      _id: new ObjectId(),
      title: 'mock title',
    } as IFormSchema
    const MOCK_FORM_PARAMS: Omit<IForm, 'admin'> = {
      responseMode: ResponseMode.Encrypt,
      publicKey: 'some public key',
      title: 'some form title',
    }
    const MOCK_REQ = expressHandler.mockRequest({
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
      body: {
        form: MOCK_FORM_PARAMS,
      },
    })

    it('should return 200 with created form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.findUserById.mockReturnValueOnce(okAsync(MOCK_USER))
      MockAdminFormService.createForm.mockReturnValueOnce(okAsync(MOCK_FORM))

      // Act
      await AdminFormController.handleCreateForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(MOCK_FORM)
      expect(MockUserService.findUserById).toHaveBeenCalledWith(
        MOCK_REQ.session?.user?._id,
      )
      expect(MockAdminFormService.createForm).toHaveBeenCalledWith({
        ...MOCK_FORM_PARAMS,
        admin: MOCK_USER._id,
      })
    })

    it('should return 409 on DatabaseConflictError', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.findUserById.mockReturnValueOnce(okAsync(MOCK_USER))
      const mockErrorString = 'conflict conflict'
      MockAdminFormService.createForm.mockReturnValueOnce(
        errAsync(new DatabaseConflictError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreateForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      expect(mockRes.status).toBeCalledWith(409)
      expect(mockRes.json).toBeCalledWith({ message: mockErrorString })
      expect(MockUserService.findUserById).toHaveBeenCalledWith(
        MOCK_REQ.session?.user?._id,
      )
      expect(MockAdminFormService.createForm).toHaveBeenCalledWith({
        ...MOCK_FORM_PARAMS,
        admin: MOCK_USER._id,
      })
    })

    it('should return 413 on DatabasePayloadSizeError', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.findUserById.mockReturnValueOnce(okAsync(MOCK_USER))
      const mockErrorString = 'size exceeds limit'
      MockAdminFormService.createForm.mockReturnValueOnce(
        errAsync(new DatabasePayloadSizeError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreateForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      expect(mockRes.status).toBeCalledWith(413)
      expect(mockRes.json).toBeCalledWith({ message: mockErrorString })
      expect(MockUserService.findUserById).toHaveBeenCalledWith(
        MOCK_REQ.session?.user?._id,
      )
      expect(MockAdminFormService.createForm).toHaveBeenCalledWith({
        ...MOCK_FORM_PARAMS,
        admin: MOCK_USER._id,
      })
    })

    it('should return 422 on DatabaseValidationError', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.findUserById.mockReturnValueOnce(okAsync(MOCK_USER))
      const mockErrorString = 'invalid form'
      MockAdminFormService.createForm.mockReturnValueOnce(
        errAsync(new DatabaseValidationError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreateForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      expect(mockRes.status).toBeCalledWith(422)
      expect(mockRes.json).toBeCalledWith({ message: mockErrorString })
      expect(MockUserService.findUserById).toHaveBeenCalledWith(
        MOCK_REQ.session?.user?._id,
      )
      expect(MockAdminFormService.createForm).toHaveBeenCalledWith({
        ...MOCK_FORM_PARAMS,
        admin: MOCK_USER._id,
      })
    })

    it('should return 422 on MissingUserError', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.findUserById.mockReturnValueOnce(
        errAsync(new MissingUserError()),
      )

      // Act
      await AdminFormController.handleCreateForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      expect(mockRes.status).toBeCalledWith(422)
      expect(mockRes.json).toBeCalledWith({ message: 'User not found' })
      expect(MockUserService.findUserById).toHaveBeenCalledWith(
        MOCK_REQ.session?.user?._id,
      )
      expect(MockAdminFormService.createForm).not.toHaveBeenCalled()
    })

    it('should return 500 when database error occurs during form creation', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.findUserById.mockReturnValueOnce(okAsync(MOCK_USER))
      const mockErrorString = 'something went wrong'
      MockAdminFormService.createForm.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreateForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      expect(mockRes.status).toBeCalledWith(500)
      expect(mockRes.json).toBeCalledWith({ message: mockErrorString })
      expect(MockUserService.findUserById).toHaveBeenCalledWith(
        MOCK_REQ.session?.user?._id,
      )
      expect(MockAdminFormService.createForm).toHaveBeenCalledWith({
        ...MOCK_FORM_PARAMS,
        admin: MOCK_USER._id,
      })
    })

    it('should return 500 when database error occurs during user retrieval', async () => {
      // Arrange
      const mockErrorString = 'db ded'
      const mockRes = expressHandler.mockResponse()
      MockUserService.findUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreateForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      expect(mockRes.status).toBeCalledWith(500)
      expect(mockRes.json).toBeCalledWith({ message: mockErrorString })
      expect(MockUserService.findUserById).toHaveBeenCalledWith(
        MOCK_REQ.session?.user?._id,
      )
      expect(MockAdminFormService.createForm).not.toHaveBeenCalled()
    })
  })

  describe('handleGetAdminForm', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with queried admin form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )

      // Act
      await AdminFormController.handleGetAdminForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({ form: MOCK_FORM })
    })

    it('should return 403 when ForbiddenFormError is returned when verifying user permissions', async () => {
      // Arrange
      const expectedErrorString = 'no read access'

      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetAdminForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 404 when FormNotFoundError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is not found'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetAdminForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 410 when FormDeletedError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is deleted'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetAdminForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 422 when MissingUserError is returned when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'user is not found'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetAdminForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving user in session', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'database goes boom'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetAdminForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving populated form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'database goes boom'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetAdminForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })
  })

  describe('handleCreatePresignedPostUrlForImages', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm
    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
      body: {
        fileId: 'any file id',
        fileMd5Hash: 'any hash',
        fileType: 'any type',
      },
    })

    it('should return 200 with presigned POST URL object when successful', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      const expectedPresignedPost: PresignedPost = {
        fields: {
          'X-Amz-Signature': 'some-amz-signature',
          Policy: 'some policy',
        },
        url: 'some url',
      }
      MockAdminFormService.createPresignedPostUrlForImages.mockReturnValueOnce(
        okAsync(expectedPresignedPost),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForImages(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(expectedPresignedPost)
    })

    it('should return 400 when InvalidFileTypeError is returned when creating presigned POST URL', async () => {
      // Arrange
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      // Mock error
      const mockErrorString = 'bad file type, bad!'
      const mockRes = expressHandler.mockResponse()
      MockAdminFormService.createPresignedPostUrlForImages.mockReturnValueOnce(
        errAsync(new InvalidFileTypeError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForImages(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
    })

    it('should return 400 when CreatePresignedUrlError is returned when creating presigned POST URL', async () => {
      // Arrange
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      // Mock error
      const mockErrorString = 'creating presigned post url failed, oh no'
      const mockRes = expressHandler.mockResponse()
      MockAdminFormService.createPresignedPostUrlForImages.mockReturnValueOnce(
        errAsync(new CreatePresignedUrlError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForImages(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
    })

    it('should return 403 when user does not have write permissions to form', async () => {
      // Arrange
      const expectedErrorString = 'no write permissions'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(expectedErrorString)),
      )
      const mockRes = expressHandler.mockResponse()

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForImages(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(
        MockAdminFormService.createPresignedPostUrlForImages,
      ).not.toHaveBeenCalled()
    })

    it('should return 404 when form cannot be found', async () => {
      // Arrange
      const expectedErrorString = 'no form found'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )
      const mockRes = expressHandler.mockResponse()

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForImages(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(
        MockAdminFormService.createPresignedPostUrlForImages,
      ).not.toHaveBeenCalled()
    })

    it('should return 410 when form is archived', async () => {
      // Arrange
      const expectedErrorString = 'form deleted'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )
      const mockRes = expressHandler.mockResponse()

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForImages(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(
        MockAdminFormService.createPresignedPostUrlForImages,
      ).not.toHaveBeenCalled()
    })

    it('should return 422 when MissingUserError is returned when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'user is not found'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForImages(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(AuthService.getFormAfterPermissionChecks).not.toHaveBeenCalled()
      expect(
        MockAdminFormService.createPresignedPostUrlForImages,
      ).not.toHaveBeenCalled()
    })
  })

  describe('handleCreatePresignedPostUrlForLogos', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm
    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
      body: {
        fileId: 'any file id',
        fileMd5Hash: 'any hash',
        fileType: 'any type',
      },
    })

    it('should return 200 with presigned POST URL object when successful', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      const expectedPresignedPost: PresignedPost = {
        fields: {
          'X-Amz-Signature': 'some-amz-signature',
          Policy: 'some policy',
        },
        url: 'some url',
      }
      MockAdminFormService.createPresignedPostUrlForLogos.mockReturnValueOnce(
        okAsync(expectedPresignedPost),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForLogos(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(expectedPresignedPost)
    })

    it('should return 400 when InvalidFileTypeError is returned when creating presigned POST URL', async () => {
      // Arrange
      // Mock error
      const mockErrorString = 'bad file type, bad!'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      const mockRes = expressHandler.mockResponse()
      MockAdminFormService.createPresignedPostUrlForLogos.mockReturnValueOnce(
        errAsync(new InvalidFileTypeError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForLogos(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
    })

    it('should return 400 when CreatePresignedUrlError is returned when creating presigned POST URL', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock error
      const mockErrorString = 'creating presigned post url failed, oh no'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      MockAdminFormService.createPresignedPostUrlForLogos.mockReturnValueOnce(
        errAsync(new CreatePresignedUrlError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForLogos(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
    })

    it('should return 403 when user does not have write permissions to form', async () => {
      // Arrange
      const expectedErrorString = 'no write permissions'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(expectedErrorString)),
      )
      const mockRes = expressHandler.mockResponse()

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForLogos(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(
        MockAdminFormService.createPresignedPostUrlForLogos,
      ).not.toHaveBeenCalled()
    })

    it('should return 404 when form cannot be found', async () => {
      // Arrange
      const expectedErrorString = 'no form found'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )
      const mockRes = expressHandler.mockResponse()

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForLogos(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(
        MockAdminFormService.createPresignedPostUrlForLogos,
      ).not.toHaveBeenCalled()
    })

    it('should return 410 when form is archived', async () => {
      // Arrange
      const expectedErrorString = 'form deleted'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )
      const mockRes = expressHandler.mockResponse()

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForLogos(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(
        MockAdminFormService.createPresignedPostUrlForLogos,
      ).not.toHaveBeenCalled()
    })

    it('should return 422 when MissingUserError is returned when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'user is not found'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCreatePresignedPostUrlForLogos(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
      expect(AuthService.getFormAfterPermissionChecks).not.toHaveBeenCalled()
      expect(
        MockAdminFormService.createPresignedPostUrlForLogos,
      ).not.toHaveBeenCalled()
    })
  })

  describe('handleCountFormSubmissions', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER as IPopulatedUser,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with submission counts of given form when query params are not provided', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock return count.
      const expectedSubmissionCount = 201
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      MockSubmissionService.getFormSubmissionsCount.mockReturnValueOnce(
        okAsync(expectedSubmissionCount),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).toHaveBeenCalledWith(String(MOCK_FORM._id), {
        startDate: undefined,
        endDate: undefined,
      })
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith(expectedSubmissionCount)
    })

    it('should return 200 with submission counts of given form when query params are provided', async () => {
      // Arrange
      const expectedDateRange = {
        startDate: '2020-01-01',
        endDate: '2021-01-01',
      }

      const mockReqWithQuery = merge({}, MOCK_REQ, { query: expectedDateRange })
      const mockRes = expressHandler.mockResponse()
      // Mock return count.
      const expectedSubmissionCount = 12
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      MockSubmissionService.getFormSubmissionsCount.mockReturnValueOnce(
        okAsync(expectedSubmissionCount),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        mockReqWithQuery,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).toHaveBeenCalledWith(String(MOCK_FORM._id), expectedDateRange)
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith(expectedSubmissionCount)
    })

    it('should return 403 when ForbiddenFormError is returned when verifying user permissions', async () => {
      // Arrange
      const expectedErrorString = 'no read access'

      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 404 when FormNotFoundError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is not found'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 410 when FormDeletedError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is deleted'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 422 when MissingUserError is returned when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'user is not found'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving user in session', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'database goes boom'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving populated form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'database goes boom'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving form submission count', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      const expectedErrorString = 'database goes boom'
      MockSubmissionService.getFormSubmissionsCount.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormSubmissions(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(
        MockSubmissionService.getFormSubmissionsCount,
      ).toHaveBeenCalledWith(String(MOCK_FORM._id), {
        startDate: undefined,
        endDate: undefined,
      })
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })
  })

  describe('handleCountFormFeedback', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER as IPopulatedUser,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with feedback counts of given form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock return count.
      const expectedFeedbackCount = 53
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      MockFeedbackService.getFormFeedbackCount.mockReturnValueOnce(
        okAsync(expectedFeedbackCount),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackCount).toHaveBeenCalledWith(
        String(MOCK_FORM._id),
      )
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith(expectedFeedbackCount)
    })

    it('should return 403 when ForbiddenFormError is returned when verifying user permissions', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      const expectedErrorString = 'no read access'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackCount).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 404 when FormNotFoundError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is not found'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackCount).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 410 when FormDeletedError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is deleted'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackCount).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 422 when MissingUserError is returned when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'user is not found'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockFeedbackService.getFormFeedbackCount).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving user in session', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'database goes boom'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockFeedbackService.getFormFeedbackCount).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving populated form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'database goes boom'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackCount).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving form feedback count', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      const expectedErrorString = 'database goes boom'
      MockFeedbackService.getFormFeedbackCount.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleCountFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackCount).toHaveBeenCalledWith(
        String(MOCK_FORM._id),
      )
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })
  })

  describe('handleStreamFormFeedback', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER as IPopulatedUser,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with feedback stream of given form', async () => {
      // Not sure how to really test the stream in Jest, testing to assert that
      // the correct services are being called instead.
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      // Mock cursor return.
      const mockCursor = new PassThrough()
      MockFeedbackService.getFormFeedbackStream.mockReturnValueOnce(
        mockCursor as any,
      )
      // Act
      await AdminFormController.handleStreamFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackStream).toHaveBeenCalledWith(
        String(MOCK_FORM._id),
      )
    })

    it('should return 403 when ForbiddenFormError is returned when verifying user permissions', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      const expectedErrorString = 'no read access'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleStreamFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackStream).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 404 when FormNotFoundError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is not found'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleStreamFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackStream).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 410 when FormDeletedError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is deleted'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleStreamFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackStream).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 422 when MissingUserError is returned when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'user is not found'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleStreamFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockFeedbackService.getFormFeedbackStream).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving user in session', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'database goes boom'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleStreamFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockFeedbackService.getFormFeedbackStream).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving populated form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'database goes boom'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleStreamFormFeedback(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbackStream).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })
  })

  describe('handleGetFormFeedbacks', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'yetanothertest@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER as IPopulatedUser,
      _id: MOCK_FORM_ID,
      title: 'mock title again',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with feedback response successfully', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const expectedFormFeedback: FeedbackResponse = {
        count: 212,
        feedback: [
          {
            comment: 'test feedback',
            rating: 5,
            date: 'some date',
            dateShort: 'some short date',
            index: 1,
            timestamp: Date.now(),
          },
        ],
        average: '5.00',
      }
      // Mock success on all service invocations.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      MockFeedbackService.getFormFeedbacks.mockReturnValueOnce(
        okAsync(expectedFormFeedback),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.json).toHaveBeenCalledWith(expectedFormFeedback)
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbacks).toHaveBeenCalledWith(
        MOCK_FORM_ID,
      )
    })

    it('should return 403 when user does not have permissions to access form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      const mockErrorString = 'not allowed'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbacks).not.toHaveBeenCalled()
    })

    it('should return 404 when form cannot be found', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      const mockErrorString = 'not found'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbacks).not.toHaveBeenCalled()
    })

    it('should return 410 when form is archived', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      const mockErrorString = 'form gone'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbacks).not.toHaveBeenCalled()
    })

    it('should return 422 when user in session does not exist in database', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'user gone'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockFeedbackService.getFormFeedbacks).not.toHaveBeenCalled()
    })

    it('should return 500 when database error occurs whilst retrieving user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'db gone'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockFeedbackService.getFormFeedbacks).not.toHaveBeenCalled()
    })

    it('should return 500 when database error occurs whilst retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      const mockErrorString = 'db error'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbacks).not.toHaveBeenCalled()
    })

    it('should return 500 when database error occurs whilst retrieving form feedback', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock success on all service invocations.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      const mockErrorString = 'db boom'
      MockFeedbackService.getFormFeedbacks.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleGetFormFeedbacks(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Read,
        },
      )
      expect(MockFeedbackService.getFormFeedbacks).toHaveBeenCalledWith(
        MOCK_FORM_ID,
      )
    })
  })

  describe('handleArchiveForm', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'another@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER as IPopulatedUser,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with archived form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      MockAdminFormService.archiveForm.mockReturnValueOnce(okAsync(true))

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.archiveForm).toHaveBeenCalledWith(MOCK_FORM)
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Form has been archived',
      })
    })

    it('should return 403 when ForbiddenFormError is returned when verifying user permissions', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      const expectedErrorString = 'no archive access'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.archiveForm).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 404 when FormNotFoundError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is not found'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.archiveForm).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 410 when FormDeletedError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'form is deleted'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.archiveForm).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 422 when MissingUserError is returned when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'user is not found'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockAdminFormService.archiveForm).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving user in session', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      const expectedErrorString = 'database goes boom'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockAdminFormService.archiveForm).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving form after checking permissions', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      // Mock error when retrieving form.
      const expectedErrorString = 'database goes boom'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.archiveForm).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst archiving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER as IPopulatedUser),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM as IPopulatedForm),
      )
      const expectedErrorString = 'database goes boom'
      MockAdminFormService.archiveForm.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleArchiveForm(MOCK_REQ, mockRes, jest.fn())

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.archiveForm).toHaveBeenCalledWith(MOCK_FORM)
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })
  })

  describe('handleDuplicateAdminForm', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'another@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
      body: {} as DuplicateFormBody,
    })

    it('should return duplicated form view on duplicate success', async () => {
      // Arrange
      const expectedParams: DuplicateFormBody = {
        responseMode: ResponseMode.Encrypt,
        publicKey: 'some public key',
        title: 'mock title',
      }
      const mockDupedFormView = { title: 'mock view' } as FormMetaView
      const mockDupedForm = merge({}, MOCK_FORM, {
        title: 'duped form with new title',
        _id: new ObjectId(),
        getDashboardView: jest.fn().mockReturnValue(mockDupedFormView),
      })
      const mockRes = expressHandler.mockResponse()
      const mockReqWithParams = merge({}, MOCK_REQ, {
        body: expectedParams,
      })
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      MockAdminFormService.duplicateForm.mockReturnValueOnce(
        okAsync(mockDupedForm),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        mockReqWithParams,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith(mockDupedFormView)
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAdminFormService.duplicateForm).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_USER_ID,
        expectedParams,
      )
    })

    it('should return 403 when user does not have read permissions to form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'hello no read permissions error'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 404 when form to duplicate cannot be found', async () => {
      // Arrange
      const expectedParams: DuplicateFormBody = {
        responseMode: ResponseMode.Encrypt,
        publicKey: 'some public key',
        title: 'mock title',
      }
      const mockRes = expressHandler.mockResponse()
      const mockReqWithParams = merge({}, MOCK_REQ, {
        body: expectedParams,
      })
      const mockErrorString = 'cannot find form to duplicate suddenly'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      MockAdminFormService.duplicateForm.mockReturnValueOnce(
        errAsync(new FormNotFoundError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        mockReqWithParams,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAdminFormService.duplicateForm).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_USER_ID,
        expectedParams,
      )
    })

    it('should return 410 when form to duplicate is archived', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'form archived error'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 422 when user in session cannot be retrieved from the database', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'oh no user'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 500 when database error occurs whilst retrieving logged  in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'db error retrieving user'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 500 when database error occurs whilst retrieving form to duplicate', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'db error retrieving form'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 500 when database error occurs whilst duplicating form', async () => {
      // Arrange
      const expectedParams: DuplicateFormBody = {
        responseMode: ResponseMode.Encrypt,
        publicKey: 'some public key',
        title: 'mock title',
      }
      const mockRes = expressHandler.mockResponse()
      const mockReqWithParams = merge({}, MOCK_REQ, {
        body: expectedParams,
      })
      const mockErrorString = 'db error duplicating form'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      MockAdminFormService.duplicateForm.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleDuplicateAdminForm(
        mockReqWithParams,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAdminFormService.duplicateForm).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_USER_ID,
        expectedParams,
      )
    })
  })

  describe('handleGetTemplateForm', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      agency: {
        emailDomain: ['example.com'],
        _id: new ObjectId(),
        lastModified: new Date('2017-09-15T06:03:58.803Z'),
        shortName: 'test',
        fullName: 'Test Agency',
        logo: 'path/to/nowhere',
        created: new Date('2017-09-15T06:03:58.792Z'),
        __v: 0,
      },
      email: 'alwaystesting@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER,
      _id: MOCK_FORM_ID,
      title: "guess what it's another mock title",
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with requested form with only public fields', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockAuthService.getFormIfPublic.mockReturnValueOnce(okAsync(MOCK_FORM))

      // Act
      await AdminFormController.handleGetTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith({
        form: removePrivateDetailsFromForm(MOCK_FORM),
      })
    })

    it('should return 403 when PrivateFormError is returned when retrieving form', async () => {
      // Arrange
      const mockFormTitle = 'some form title'
      const mockRes = expressHandler.mockResponse()
      // Mock error when retrieving form.
      const expectedErrorString = 'form is not found'
      MockAuthService.getFormIfPublic.mockReturnValueOnce(
        errAsync(new PrivateFormError(expectedErrorString, mockFormTitle)),
      )

      // Act
      await AdminFormController.handleGetTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
        isPageFound: true,
        formTitle: mockFormTitle,
      })
    })

    it('should return 404 when FormNotFoundError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock error when retrieving form.
      const expectedErrorString = 'form is not found'
      MockAuthService.getFormIfPublic.mockReturnValueOnce(
        errAsync(new FormNotFoundError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 410 when FormDeletedError is returned when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const expectedErrorString = 'form is deleted'
      MockAuthService.getFormIfPublic.mockReturnValueOnce(
        errAsync(new FormDeletedError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })

    it('should return 500 when database error occurs whilst retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const expectedErrorString = 'database goes boom'
      MockAuthService.getFormIfPublic.mockReturnValueOnce(
        errAsync(new DatabaseError(expectedErrorString)),
      )

      // Act
      await AdminFormController.handleGetTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: expectedErrorString,
      })
    })
  })

  describe('handleCopyTemplateForm', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'andanother@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER,
      _id: MOCK_FORM_ID,
      title: 'mock title again',
    } as IPopulatedForm

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
      body: {} as DuplicateFormBody,
    })

    it('should return copied template form view on duplicate success', async () => {
      // Arrange
      const expectedParams: DuplicateFormBody = {
        responseMode: ResponseMode.Email,
        emails: ['some-email@example.com'],
        title: 'mock new template title',
      }
      const mockDupedFormView = {
        title: 'mock template view',
      } as FormMetaView
      const mockDupedForm = merge({}, MOCK_FORM, {
        title: 'duped form with new title',
        _id: new ObjectId(),
        getDashboardView: jest.fn().mockReturnValue(mockDupedFormView),
      })
      const mockRes = expressHandler.mockResponse()
      const mockReqWithParams = merge({}, MOCK_REQ, {
        body: expectedParams,
      })
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormIfPublic.mockReturnValueOnce(okAsync(MOCK_FORM))
      MockAdminFormService.duplicateForm.mockReturnValueOnce(
        okAsync(mockDupedForm),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        mockReqWithParams,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith(mockDupedFormView)
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAdminFormService.duplicateForm).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_USER_ID,
        expectedParams,
      )
    })

    it('should return 403 when form is private', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormIfPublic.mockReturnValueOnce(
        errAsync(new PrivateFormError(undefined, 'some random title')),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(403)
      // Should return specific message.
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Form must be public to be copied',
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 404 when form to duplicate cannot be found', async () => {
      // Arrange
      const expectedParams: DuplicateFormBody = {
        responseMode: ResponseMode.Encrypt,
        publicKey: 'some public key',
        title: 'mock title',
      }
      const mockRes = expressHandler.mockResponse()
      const mockReqWithParams = merge({}, MOCK_REQ, {
        body: expectedParams,
      })
      const mockErrorString = 'cannot find form to duplicate suddenly'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormIfPublic.mockReturnValueOnce(okAsync(MOCK_FORM))
      MockAdminFormService.duplicateForm.mockReturnValueOnce(
        errAsync(new FormNotFoundError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        mockReqWithParams,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAdminFormService.duplicateForm).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_USER_ID,
        expectedParams,
      )
    })

    it('should return 410 when form to duplicate is archived', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'form archived error'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormIfPublic.mockReturnValueOnce(
        errAsync(new FormDeletedError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 422 when user in session cannot be retrieved from the database', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'oh no user'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 500 when database error occurs whilst retrieving logged  in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'db error retrieving user'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 500 when database error occurs whilst retrieving form to duplicate', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'db error retrieving form'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormIfPublic.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
    })

    it('should return 500 when database error occurs whilst duplicating form', async () => {
      // Arrange
      const expectedParams: DuplicateFormBody = {
        responseMode: ResponseMode.Encrypt,
        publicKey: 'some public key',
        title: 'mock title',
      }
      const mockRes = expressHandler.mockResponse()
      const mockReqWithParams = merge({}, MOCK_REQ, {
        body: expectedParams,
      })
      const mockErrorString = 'db error duplicating form'
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormIfPublic.mockReturnValueOnce(okAsync(MOCK_FORM))
      MockAdminFormService.duplicateForm.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleCopyTemplateForm(
        mockReqWithParams,
        mockRes,
        jest.fn(),
      )

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({
        message: mockErrorString,
      })
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAdminFormService.duplicateForm).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_USER_ID,
        expectedParams,
      )
    })
  })

  describe('handleTransferFormOwnership', () => {
    const MOCK_USER_ID = new ObjectId().toHexString()
    const MOCK_FORM_ID = new ObjectId().toHexString()
    const MOCK_USER = {
      _id: MOCK_USER_ID,
      email: 'somerandom@example.com',
    } as IPopulatedUser
    const MOCK_FORM = {
      admin: MOCK_USER,
      _id: MOCK_FORM_ID,
      title: 'mock title',
    } as IPopulatedForm

    const MOCK_NEW_OWNER_EMAIL = 'updatedUser@example.com'

    const MOCK_REQ = expressHandler.mockRequest({
      params: {
        formId: MOCK_FORM_ID,
      },
      body: {
        email: MOCK_NEW_OWNER_EMAIL,
      },
      session: {
        user: {
          _id: MOCK_USER_ID,
        },
      },
    })

    it('should return 200 with updated form with transferred owners', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockUpdatedForm = {
        ...MOCK_FORM,
        admin: { _id: new ObjectId(), email: MOCK_NEW_OWNER_EMAIL },
      } as IPopulatedForm
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      MockAdminFormService.transferFormOwnership.mockReturnValueOnce(
        okAsync(mockUpdatedForm),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.transferFormOwnership).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_NEW_OWNER_EMAIL,
      )
      expect(mockRes.status).not.toHaveBeenCalled()
      expect(mockRes.json).toHaveBeenCalledWith({ form: mockUpdatedForm })
    })

    it('should return 400 when new owner is not in the database yet', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'new owner not found in db'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      // Mock error returned when owner is not in db.
      MockAdminFormService.transferFormOwnership.mockReturnValueOnce(
        errAsync(new TransferOwnershipError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.transferFormOwnership).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_NEW_OWNER_EMAIL,
      )
      expect(mockRes.status).toHaveBeenCalledWith(400)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })

    it('should return 403 when user does not have delete permissions', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      const mockErrorString = 'not allowed'
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new ForbiddenFormError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.transferFormOwnership).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(403)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })

    it('should return 404 when form cannot be found', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'form not found error'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      // Mock error returned when form is not found.
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormNotFoundError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.transferFormOwnership).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(404)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })

    it('should return 410 when the form is already archived', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'form archived'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      // Mock form is archived error.
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new FormDeletedError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.transferFormOwnership).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(410)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })

    it('should return 422 when user in session cannot be retrieved from the database', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'user not found in db'
      // Mock error returned when user cannot be found in db.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new MissingUserError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockAdminFormService.transferFormOwnership).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(422)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })

    it('should return 500 when database error occurs when retrieving logged in user', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'db error oh no'
      // Mock db error.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(
        MockAuthService.getFormAfterPermissionChecks,
      ).not.toHaveBeenCalled()
      expect(MockAdminFormService.transferFormOwnership).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })

    it('should return 500 when database error occurs when retrieving form', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'retrieve form db error'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.transferFormOwnership).not.toHaveBeenCalled()
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })

    it('should return 500 when database error occurs when transferring form ownership', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockErrorString = 'db not found'
      // Mock various services to return expected results.
      MockUserService.getPopulatedUserById.mockReturnValueOnce(
        okAsync(MOCK_USER),
      )
      MockAuthService.getFormAfterPermissionChecks.mockReturnValueOnce(
        okAsync(MOCK_FORM),
      )
      // Mock db error when transferring form ownership.
      MockAdminFormService.transferFormOwnership.mockReturnValueOnce(
        errAsync(new DatabaseError(mockErrorString)),
      )

      // Act
      await AdminFormController.handleTransferFormOwnership(
        MOCK_REQ,
        mockRes,
        jest.fn(),
      )

      // Assert
      // Check all arguments of called services.
      expect(MockUserService.getPopulatedUserById).toHaveBeenCalledWith(
        MOCK_USER_ID,
      )
      expect(MockAuthService.getFormAfterPermissionChecks).toHaveBeenCalledWith(
        {
          user: MOCK_USER,
          formId: MOCK_FORM_ID,
          level: PermissionLevel.Delete,
        },
      )
      expect(MockAdminFormService.transferFormOwnership).toHaveBeenCalledWith(
        MOCK_FORM,
        MOCK_NEW_OWNER_EMAIL,
      )
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ message: mockErrorString })
    })
  })
})
