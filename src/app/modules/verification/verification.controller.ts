import { RequestHandler, Response } from 'express'
import { StatusCodes } from 'http-status-codes'

import { createLoggerWithLabel } from '../../../config/logger'
import { VfnErrors } from '../../../shared/util/verification'

import * as VerificationService from './verification.service'
import { ITransaction } from './verification.types'

const logger = createLoggerWithLabel(module)
/**
 * When a form is loaded publicly, a transaction is created, and populated with the field ids of fields that are verifiable.
 * If no fields are verifiable, then it did not create a transaction and returns an empty object.
 * @param req
 * @param res
 * @returns 201 - transaction is created
 * @returns 200 - transaction was not created as no fields were verifiable for the form
 */
export const createTransaction: RequestHandler<
  Record<string, string>,
  ITransaction,
  { formId: string }
> = async (req, res) => {
  try {
    const { formId } = req.body
    const transaction = await VerificationService.createTransaction(formId)
    return transaction
      ? res.status(StatusCodes.CREATED).json(transaction)
      : res.sendStatus(StatusCodes.OK)
  } catch (error) {
    logger.error({
      message: 'Error creating transaction',
      meta: {
        action: 'createTransaction',
      },
      error,
    })
    return handleError(error, res)
  }
}
/**
 * Returns a transaction's id and expiry time if it exists
 * @param req
 * @param res
 */
export const getTransactionMetadata: RequestHandler<{
  transactionId: string
}> = async (req, res) => {
  try {
    const { transactionId } = req.params
    const transaction = await VerificationService.getTransactionMetadata(
      transactionId,
    )
    return res.status(StatusCodes.OK).json(transaction)
  } catch (error) {
    logger.error({
      message: 'Error retrieving transaction metadata',
      meta: {
        action: 'getTransactionMetadata',
      },
      error,
    })
    return handleError(error, res)
  }
}
/**
 *  When user changes the input value in the verifiable field,
 *  we reset the field in the transaction, removing the previously saved signature.
 * @param req
 * @param res
 */
export const resetFieldInTransaction: RequestHandler<
  { transactionId: string },
  string,
  { fieldId: string }
> = async (req, res) => {
  try {
    const { transactionId } = req.params
    const { fieldId } = req.body
    const transaction = await VerificationService.getTransaction(transactionId)
    await VerificationService.resetFieldInTransaction(transaction, fieldId)
    return res.sendStatus(StatusCodes.OK)
  } catch (error) {
    logger.error({
      message: 'Error resetting field in transaction',
      meta: {
        action: 'resetFieldInTransaction',
      },
      error,
    })
    return handleError(error, res)
  }
}
/**
 * When user requests to verify a field, an otp is generated.
 * The current answer is signed, and the signature is also saved in the transaction, with the field id as the key.
 * @param req
 * @param res
 */
export const getNewOtp: RequestHandler<
  { transactionId: string },
  string,
  { answer: string; fieldId: string }
> = async (req, res) => {
  try {
    const { transactionId } = req.params
    const { answer, fieldId } = req.body
    const transaction = await VerificationService.getTransaction(transactionId)
    await VerificationService.getNewOtp(transaction, fieldId, answer)
    return res.sendStatus(StatusCodes.CREATED)
  } catch (error) {
    logger.error({
      message: 'Error retrieving new OTP',
      meta: {
        action: 'getNewOtp',
      },
      error,
    })
    return handleError(error, res)
  }
}
/**
 * When user submits their otp for the field, the otp is validated.
 * If it is correct, we return the signature that was saved.
 * This signature will be appended to the response when the form is submitted.
 * @param req
 * @param res
 */
export const verifyOtp: RequestHandler<
  { transactionId: string },
  string,
  { otp: string; fieldId: string }
> = async (req, res) => {
  try {
    const { transactionId } = req.params
    const { fieldId, otp } = req.body
    const transaction = await VerificationService.getTransaction(transactionId)
    const data = await VerificationService.verifyOtp(transaction, fieldId, otp)
    return res.status(StatusCodes.OK).json(data)
  } catch (error) {
    logger.error({
      message: 'Error verifying OTP',
      meta: {
        action: 'verifyOtp',
      },
      error,
    })
    return handleError(error, res)
  }
}
/**
 * Returns relevant http status code for different verification failures
 * @param error
 * @param res
 */
const handleError = (error: Error, res: Response) => {
  let status = StatusCodes.INTERNAL_SERVER_ERROR
  let message = error.message
  switch (error.name) {
    case VfnErrors.SendOtpFailed:
      status = StatusCodes.BAD_REQUEST
      break
    case VfnErrors.WaitForOtp:
      status = StatusCodes.ACCEPTED
      break
    case VfnErrors.ResendOtp:
    case VfnErrors.InvalidOtp:
      status = StatusCodes.UNPROCESSABLE_ENTITY
      break
    case VfnErrors.FieldNotFound:
    case VfnErrors.TransactionNotFound:
      status = StatusCodes.NOT_FOUND
      break
    default:
      message = 'An error occurred'
  }
  return res.status(status).json(message)
}
