import { RequestHandler } from 'express'
import { ParamsDictionary } from 'express-serve-static-core'
import { Merge, SetOptional } from 'type-fest'

import { createLoggerWithLabel } from '../../../../config/logger'
import { FieldResponse, ResWithHashedFields, WithForm } from '../../../../types'
import { createReqMeta } from '../../../utils/request'
import { getProcessedResponses } from '../submission.service'
import { ProcessedFieldResponse } from '../submission.types'

import * as EmailSubmissionReceiver from './email-submission.receiver'
import * as EmailSubmissionService from './email-submission.service'
import { WithAttachments, WithEmailData } from './email-submission.types'
import {
  mapAttachmentsFromResponses,
  mapRouteError,
} from './email-submission.util'

const logger = createLoggerWithLabel(module)

/**
 * Construct autoReply data and data to send admin from responses submitted
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next middleware function
 */
export const prepareEmailSubmission: RequestHandler<
  ParamsDictionary,
  unknown,
  { parsedResponses: ProcessedFieldResponse[] }
> = (req, res, next) => {
  const hashedFields =
    (res as ResWithHashedFields<typeof res>).locals.hashedFields || new Set()
  const emailData = EmailSubmissionService.createEmailData(
    req.body.parsedResponses,
    hashedFields,
  )
  ;(req as WithEmailData<typeof req>).autoReplyData = emailData.autoReplyData
  ;(req as WithEmailData<typeof req>).jsonData = emailData.jsonData
  ;(req as WithEmailData<typeof req>).formData = emailData.formData
  return next()
}

/**
 * Parses multipart-form data request. Parsed attachments are
 * placed into req.attachments and parsed fields are placed into
 * req.body.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next middleware function
 */
export const receiveEmailSubmission: RequestHandler<
  ParamsDictionary,
  { message: string },
  { responses: FieldResponse[] }
> = async (req, res, next) => {
  const logMeta = {
    action: 'receiveEmailSubmission',
    formId: (req as WithForm<typeof req>).form._id,
    ...createReqMeta(req),
  }
  return EmailSubmissionReceiver.createMultipartReceiver(req.headers)
    .asyncAndThen((receiver) => {
      const result = EmailSubmissionReceiver.configureMultipartReceiver(
        receiver,
      )
      req.pipe(receiver)
      return result
    })
    .map((parsed) => {
      req.body = parsed
      const hashes = EmailSubmissionService.hashSubmission(parsed)
      logger.info({
        message: 'Submission successfully hashed',
        meta: { ...logMeta, ...hashes },
      })
      return next()
    })
    .mapErr((error) => {
      logger.error({
        message: 'Error while receiving multipart data',
        meta: logMeta,
        error,
      })
      const { errorMessage, statusCode } = mapRouteError(error)
      return res.status(statusCode).json({ message: errorMessage })
    })
}

/**
 * Extracts relevant fields, injects questions, verifies visibility of field and validates answers
 * to produce req.body.parsedResponses
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next middleware function
 */
export const validateEmailSubmission: RequestHandler<
  ParamsDictionary,
  { message: string },
  { responses: FieldResponse[] }
> = async (req, res, next) => {
  const { form } = req as WithForm<typeof req>

  return EmailSubmissionService.validateAttachments(req.body.responses)
    .andThen(() => getProcessedResponses(form, req.body.responses))
    .map((parsedResponses) => {
      // Creates an array of attachments from the validated responses
      // TODO (#42): remove these types when merging middlewares into controller
      // eslint-disable-next-line @typescript-eslint/no-extra-semi
      ;(req as WithAttachments<
        typeof req
      >).attachments = mapAttachmentsFromResponses(req.body.responses)
      ;(req.body as Merge<
        typeof req.body,
        { parsedResponses: ProcessedFieldResponse[] }
      >).parsedResponses = parsedResponses
      delete (req.body as SetOptional<typeof req.body, 'responses'>).responses // Prevent downstream functions from using responses by deleting it
      return next()
    })
    .mapErr((error) => {
      logger.error({
        message: 'Error processing responses',
        meta: {
          action: 'validateEmailSubmission',
          ...createReqMeta(req),
          formId: form._id,
        },
        error,
      })
      const { errorMessage, statusCode } = mapRouteError(error)
      return res.status(statusCode).json({
        message: errorMessage,
      })
    })
}
