import axios, { AxiosError, AxiosResponse } from 'axios'
import { get } from 'lodash'
import mongoose from 'mongoose'

import formsgSdk from '../../../config/formsg-sdk'
import { createLoggerWithLabel } from '../../../config/logger'
// Prevents JSON.stringify error for circular JSONs and BigInts
import { stringifySafe } from '../../../shared/util/stringify-safe'
import {
  IFormSchema,
  ISubmissionSchema,
  IWebhookResponse,
  WebhookView,
} from '../../../types'
import { getEncryptSubmissionModel } from '../../models/submission.server.model'

import { WebhookValidationError } from './webhook.errors'
import { WebhookParams } from './webhook.types'
import { validateWebhookUrl } from './webhook.utils'

const logger = createLoggerWithLabel(module)
const EncryptSubmission = getEncryptSubmissionModel(mongoose)

/**
 * Logs webhook failure in console and database.
 * @param {error} error Error object returned by axios
 * @param {Object} webhookParams Parameters which fully specify webhook
 * @param {string} webhookParams.webhookUrl URL to POST to
 * @param {Object} webhookParams.submissionWebhookView POST body
 * @param {string} webhookParams.submissionId
 * @param {string} webhookParams.formId
 * @param {string} webhookParams.now Epoch for POST header
 * @param {string} webhookParams.signature Signature generated by FormSG SDK
 */
const handleWebhookFailure = async (
  error: Error | AxiosError,
  webhookParams: WebhookParams,
): Promise<any> => {
  logWebhookFailure(error, webhookParams)
  return updateSubmissionsDb(
    webhookParams.formId,
    webhookParams.submissionId,
    getFailureDbUpdate(error, webhookParams),
  )
}

/**
 * Logs webhook success in console and database.
 * @param {response} response Response object returned by axios
 * @param {Object} webhookParams Parameters which fully specify webhook
 * @param {string} webhookParams.webhookUrl URL to POST to
 * @param {Object} webhookParams.submissionWebhookView POST body
 * @param {string} webhookParams.submissionId
 * @param {string} webhookParams.formId
 * @param {string} webhookParams.now Epoch for POST header
 * @param {string} webhookParams.signature Signature generated by FormSG SDK
 */
const handleWebhookSuccess = async (
  response: AxiosResponse,
  webhookParams: WebhookParams,
): Promise<any> => {
  logWebhookSuccess(response, webhookParams)
  return updateSubmissionsDb(
    webhookParams.formId,
    webhookParams.submissionId,
    getSuccessDbUpdate(response, webhookParams),
  )
}

/**
 * Sends webhook POST.
 * Note that the arguments are the same as those in webhookParams
 * for handleWebhookSuccess and handleWebhookFailure, just destructured.
 * @param {Object} webhookParams Parameters which fully specify webhook
 * @param {string} webhookParams.webhookUrl URL to POST to
 * @param {Object} webhookParams.submissionWebhookView POST body
 * @param {string} webhookParams.submissionId
 * @param {string} webhookParams.formId
 * @param {string} webhookParams.now Epoch for POST header
 * @param {string} webhookParams.signature Signature generated by FormSG SDK
 */
const postWebhook = ({
  webhookUrl,
  submissionWebhookView,
  submissionId,
  formId,
  now,
  signature,
}: WebhookParams): Promise<AxiosResponse> => {
  return axios.post(webhookUrl, submissionWebhookView, {
    headers: {
      'X-FormSG-Signature': formsgSdk.webhooks.constructHeader({
        epoch: now,
        submissionId,
        formId,
        signature,
      }),
    },
    maxRedirects: 0,
  })
}

/**
 * Logging for webhook success
 * @param {response} response Response object returned by axios
 * @param {Object} webhookParams Parameters which fully specify webhook
 * @param {string} webhookParams.webhookUrl URL to POST to
 * @param {Object} webhookParams.submissionWebhookView POST body
 * @param {string} webhookParams.submissionId
 * @param {string} webhookParams.formId
 * @param {string} webhookParams.now Epoch for POST header
 * @param {string} webhookParams.signature Signature generated by FormSG SDK
 */
const logWebhookSuccess = (
  response: AxiosResponse,
  { webhookUrl, submissionId, formId, now, signature }: WebhookParams,
): void => {
  const status = get(response, 'status')

  logger.info({
    message: 'Webhook POST succeeded',
    meta: {
      action: 'logWebhookSuccess',
      status,
      submissionId,
      formId,
      now,
      webhookUrl,
      signature,
    },
  })
}

/**
 * Logging for webhook failure
 * @param {error} error Error object returned by axios
 * @param {Object} webhookParams Parameters which fully specify webhook
 * @param {string} webhookParams.webhookUrl URL to POST to
 * @param {Object} webhookParams.submissionWebhookView POST body
 * @param {string} webhookParams.submissionId
 * @param {string} webhookParams.formId
 * @param {string} webhookParams.now Epoch for POST header
 * @param {string} webhookParams.signature Signature generated by FormSG SDK
 */
const logWebhookFailure = (
  error: Error | AxiosError,
  { webhookUrl, submissionId, formId, now, signature }: Partial<WebhookParams>,
): void => {
  const logMeta = {
    action: 'logWebhookFailure',
    submissionId,
    formId,
    now,
    webhookUrl,
    signature,
  }

  if (error instanceof WebhookValidationError) {
    logger.error({
      message: 'Webhook not attempted',
      meta: logMeta,
      error,
    })
  } else {
    logger.error({
      message: 'Webhook POST failed',
      meta: {
        ...logMeta,
        status: get(error, 'response.status'),
      },
      error,
    })
  }
}

/**
 * Updates the submission in the database with the webhook response
 * @param {ObjectId} formId Form that submission to update belongs to
 * @param {ObjectId} submissionId Submission to update with webhook response
 * @param {Object} updateObj Webhook response to update submission document with
 * @param {number} updateObj.status status code received from webhook endpoint
 * @param {string} updateObj.statusText status text received from webhook endpoint
 * @param {string} updateObj.headers stringified headers received from webhook endpoint
 * @param {string} updateObj.data stringified data received from webhook endpoint
 */
const updateSubmissionsDb = async (
  formId: IFormSchema['_id'],
  submissionId: ISubmissionSchema['_id'],
  updateObj: IWebhookResponse,
): Promise<any> => {
  try {
    const { nModified } = await EncryptSubmission.updateOne(
      { _id: submissionId },
      { $push: { webhookResponses: updateObj } },
    )
    if (nModified !== 1) {
      // Pass on to catch block
      throw new Error('Submission not found in database.')
    }
  } catch (error) {
    logger.error({
      message: 'Database update for webhook status failed',
      meta: {
        action: 'updateSubmissionsDb',
        formId,
        submissionId,
        updateObj: stringifySafe(updateObj),
      },
      error,
    })
  }
}

/**
 * Formats webhook success info into an object to update Submissions collection
 * @param {response} response Response object returned by axios
 * @param {Object} webhookParams Parameters which fully specify webhook
 * @param {string} webhookParams.webhookUrl URL to POST to
 * @param {string} webhookParams.signature Signature generated by FormSG SDK
 */
const getSuccessDbUpdate = (
  response: AxiosResponse,
  { webhookUrl, signature }: Pick<WebhookParams, 'webhookUrl' | 'signature'>,
): IWebhookResponse => {
  return { webhookUrl, signature, ...getFormattedResponse(response) }
}

/**
 * Formats webhook failure info into an object to update Submissions collection
 * @param {error} error Error object returned by axios
 * @param {Object} webhookParams Parameters which fully specify webhook
 * @param {string} webhookParams.webhookUrl URL to POST to
 * @param {string} webhookParams.signature Signature generated by FormSG SDK
 */
const getFailureDbUpdate = (
  error: Error | AxiosError,
  { webhookUrl, signature }: Pick<WebhookParams, 'webhookUrl' | 'signature'>,
): IWebhookResponse => {
  const errorMessage = get(error, 'message')
  const update: IWebhookResponse = {
    webhookUrl,
    signature,
    errorMessage,
  }
  if (!(error instanceof WebhookValidationError)) {
    const { response } = getFormattedResponse(get(error, 'response'))
    update.response = response
  }
  return update
}

/**
 * Formats a response object for update in the Submissions collection
 * @param {response} response Response object returned by axios
 */
const getFormattedResponse = (
  response: AxiosResponse,
): Pick<IWebhookResponse, 'response'> => {
  return {
    response: {
      status: get(response, 'status'),
      statusText: get(response, 'statusText'),
      headers: stringifySafe(get(response, 'headers')),
      data: stringifySafe(get(response, 'data')),
    },
  }
}

/**
 * Validates webhook url, posts data to it and updates submission document with response
 * @param {string} webhookUrl Endpoint to push data to
 * @param {Object} submissionWebhookView Metadata containing form information and crucial submission data
 */
export const pushData = async (
  webhookUrl: WebhookParams['webhookUrl'],
  submissionWebhookView: WebhookView | null,
): Promise<any> => {
  const now = Date.now()
  // Log and return, this should not happen.
  if (!submissionWebhookView) {
    logWebhookFailure(
      new WebhookValidationError('submissionWebhookView was null'),
      {
        webhookUrl,
        now,
      },
    )
    return
  }

  const { submissionId, formId } = submissionWebhookView.data

  const signature = formsgSdk.webhooks.generateSignature({
    uri: webhookUrl,
    submissionId,
    formId,
    epoch: now,
  }) as string

  const webhookParams = {
    webhookUrl,
    submissionWebhookView,
    submissionId,
    formId,
    now,
    signature,
  }

  try {
    await validateWebhookUrl(webhookParams.webhookUrl)
    const response = await postWebhook(webhookParams)
    return handleWebhookSuccess(response, webhookParams)
  } catch (error) {
    return handleWebhookFailure(error, webhookParams)
  }
}
