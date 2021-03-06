import { okAsync } from 'neverthrow'
import { mocked } from 'ts-jest/utils'

import {
  FeatureNames,
  ISpcpMyInfo,
  RegisteredFeature,
} from 'src/config/feature-manager'
import { AuthType, LoginStatistic } from 'src/types'

import { createBillingFactory } from '../billing.factory'
import * as BillingService from '../billing.service'

jest.mock('../billing.service')
const MockBillingService = mocked(BillingService)

describe('billing.factory', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('spcp-myinfo feature disabled', () => {
    const MOCK_DISABLED_FEATURE: RegisteredFeature<FeatureNames.SpcpMyInfo> = {
      isEnabled: false,
      props: {} as ISpcpMyInfo,
    }
    const BillingFactory = createBillingFactory(MOCK_DISABLED_FEATURE)

    describe('getSpLoginStats', () => {
      it('should return empty array passthrough', async () => {
        // Act
        const actualResults = await BillingFactory.getSpLoginStats(
          'anything',
          new Date(),
          new Date(),
        )

        // Assert
        expect(MockBillingService.getSpLoginStats).not.toHaveBeenCalled()
        expect(actualResults.isOk()).toEqual(true)
        expect(actualResults._unsafeUnwrap()).toEqual([])
      })
    })
  })

  describe('spcp-myinfo feature enabled', () => {
    const MOCK_ENABLED_FEATURE: RegisteredFeature<FeatureNames.SpcpMyInfo> = {
      isEnabled: true,
      // Empty object as no relevant props needed for billing.
      props: {} as ISpcpMyInfo,
    }
    const BillingFactory = createBillingFactory(MOCK_ENABLED_FEATURE)

    describe('getSpLoginStats', () => {
      it('should invoke BillingService#getSpLoginStats', async () => {
        // Arrange
        const mockLoginStats: LoginStatistic[] = [
          {
            adminEmail: 'mockemail@example.com',
            authType: AuthType.CP,
            formId: 'mock form id',
            formName: 'some form name',
            total: 100,
          },
        ]
        const serviceGetStatsSpy = MockBillingService.getSpLoginStats.mockReturnValue(
          okAsync(mockLoginStats),
        )

        // Act
        const actualResults = await BillingFactory.getSpLoginStats(
          'anything',
          new Date(),
          new Date(),
        )

        // Assert
        expect(serviceGetStatsSpy).toHaveBeenCalledTimes(1)
        expect(actualResults.isOk()).toEqual(true)
        expect(actualResults._unsafeUnwrap()).toEqual(mockLoginStats)
      })
    })
  })
})
