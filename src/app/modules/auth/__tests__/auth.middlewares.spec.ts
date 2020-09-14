import expressHandler from 'tests/unit/backend/helpers/jest-express'
import { mocked } from 'ts-jest/utils'

import { IAgencySchema } from 'src/types'

import { InvalidDomainError } from '../auth.errors'
import * as AuthMiddleware from '../auth.middlewares'
import * as AuthService from '../auth.service'

jest.mock('../auth.service')
const MockAuthService = mocked(AuthService)

describe('auth.middleware', () => {
  describe('validateDomain', () => {
    const MOCK_REQ = expressHandler.mockRequest({
      body: { email: 'test@example.com' },
    })

    it('should continue without error when domain is valid', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockNext = jest.fn()
      MockAuthService.getAgencyWithEmail.mockResolvedValueOnce(
        {} as IAgencySchema,
      )

      // Act
      await AuthMiddleware.validateDomain(MOCK_REQ, mockRes, mockNext)

      // Assert
      expect(mockNext).toBeCalled()
    })

    it('should return 500 when retrieving agency throws non ApplicationError', async () => {
      // Arrange
      const mockRes = expressHandler.mockResponse()
      const mockNext = jest.fn()
      MockAuthService.getAgencyWithEmail.mockRejectedValueOnce(
        new Error('some error'),
      )

      // Act
      await AuthMiddleware.validateDomain(MOCK_REQ, mockRes, mockNext)

      // Assert
      expect(mockRes.status).toBeCalledWith(500)
      expect(mockRes.send).toBeCalledWith(
        expect.stringContaining(
          'Unable to validate email domain. If this issue persists, please submit a Support Form',
        ),
      )
      expect(mockNext).not.toBeCalled()
    })

    it('should return with ApplicationError status and message when retrieving agency throws ApplicationError', async () => {
      // Arrange
      const expectedError = new InvalidDomainError()
      const mockRes = expressHandler.mockResponse()
      const mockNext = jest.fn()
      MockAuthService.getAgencyWithEmail.mockRejectedValueOnce(expectedError)

      // Act
      await AuthMiddleware.validateDomain(MOCK_REQ, mockRes, mockNext)

      // Assert
      expect(mockRes.status).toBeCalledWith(expectedError.status)
      expect(mockRes.send).toBeCalledWith(expectedError.message)
      expect(mockNext).not.toBeCalled()
    })
  })
})