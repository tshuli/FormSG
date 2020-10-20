import { RequestHandler } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { StatusCodes } from 'http-status-codes'
import moment from 'moment-timezone'

import { createLoggerWithLabel } from '../../../config/logger'
import { createReqMeta } from '../../utils/request'
import { isUserInSession } from '../auth/auth.utils'

import { BillingFactory } from './billing.factory'

const logger = createLoggerWithLabel(module)

/**
 * Handler for GET /billing endpoint.
 * @return 200 with login statistics when query is valid
 * @return 401 when request does not contain a user session
 * @return 500 when error occurs whilst querying database
 */
export const handleGetBillInfo: RequestHandler<
  ParamsDictionary,
  unknown,
  unknown,
  {
    esrvcId: string
    yr: string
    mth: string
  }
> = async (req, res) => {
  // Restricted route.
  if (!isUserInSession(req)) {
    return res.status(StatusCodes.UNAUTHORIZED).json('User is unauthorized.')
  }

  const { esrvcId, mth, yr } = req.query

  const startOfMonth = moment
    .tz([parseInt(yr), parseInt(mth)], 'Asia/Singapore')
    .startOf('month')
  const endOfMonth = moment(startOfMonth).endOf('month')

  const loginStatsResult = await BillingFactory.getSpLoginStats(
    esrvcId,
    startOfMonth.toDate(),
    endOfMonth.toDate(),
  )

  if (loginStatsResult.isErr()) {
    logger.error({
      message: 'Failed to retrieve billing records',
      meta: {
        action: 'handleGetBillInfo',
        ...createReqMeta(req),
        esrvcId,
      },
      error: loginStatsResult.error,
    })
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json('Error in retrieving billing records')
  }

  // Retrieved login stats successfully.
  logger.info({
    message: `Billing search for ${esrvcId} by ${
      req.session?.user && req.session.user.email
    }`,
    meta: {
      action: 'handleGetBillInfo',
      ...createReqMeta(req),
      esrvcId,
    },
  })

  return res.json({
    loginStats: loginStatsResult.value,
  })
}