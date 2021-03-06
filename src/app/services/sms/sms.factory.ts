import Twilio from 'twilio'

import FeatureManager, {
  FeatureNames,
  RegisteredFeature,
} from '../../../config/feature-manager'
import { MissingFeatureError } from '../../modules/core/core.errors'

import {
  sendAdminContactOtp,
  sendBouncedSubmissionSms,
  sendFormDeactivatedSms,
  sendVerificationOtp,
} from './sms.service'
import { BounceNotificationSmsParams, TwilioConfig } from './sms.types'

interface ISmsFactory {
  sendVerificationOtp: (
    recipient: string,
    otp: string,
    formId: string,
  ) => ReturnType<typeof sendVerificationOtp>
  sendAdminContactOtp: (
    recipient: string,
    otp: string,
    userId: string,
  ) => ReturnType<typeof sendAdminContactOtp>
  /**
   * Informs recipient that the given form was deactivated. Rejects if SMS feature
   * not activated in app.
   * @param params Data for SMS to be sent
   * @param params.recipient Mobile number to be SMSed
   * @param params.recipientEmail The email address of the recipient being SMSed
   * @param params.adminId User ID of the admin of the deactivated form
   * @param params.adminEmail Email of the admin of the deactivated form
   * @param params.formId Form ID of deactivated form
   * @param params.formTitle Title of deactivated form
   */
  sendFormDeactivatedSms: (
    params: BounceNotificationSmsParams,
  ) => ReturnType<typeof sendFormDeactivatedSms>
  /**
   * Informs recipient that a response for the given form was lost due to email bounces.
   * Rejects if SMS feature not activated in app.
   * @param params Data for SMS to be sent
   * @param params.recipient Mobile number to be SMSed
   * @param params.recipientEmail The email address of the recipient being SMSed
   * @param params.adminId User ID of the admin of the form
   * @param params.adminEmail Email of the admin of the form
   * @param params.formId Form ID of form
   * @param params.formTitle Title of form
   */
  sendBouncedSubmissionSms: (
    params: BounceNotificationSmsParams,
  ) => ReturnType<typeof sendBouncedSubmissionSms>
}

const smsFeature = FeatureManager.get(FeatureNames.Sms)

// Exported for testing.
export const createSmsFactory = (
  smsFeature: RegisteredFeature<FeatureNames.Sms>,
): ISmsFactory => {
  if (!smsFeature.isEnabled || !smsFeature.props) {
    const errorMessage = 'SMS feature must be enabled in Feature Manager first'
    return {
      sendAdminContactOtp: () => {
        //eslint-disable-next-line
        throw new Error(`sendAdminContactOtp: ${errorMessage}`)
      },
      sendVerificationOtp: () => {
        //eslint-disable-next-line
        throw new Error(`sendVerificationOtp: ${errorMessage}`)
      },
      sendFormDeactivatedSms: () =>
        Promise.reject(new MissingFeatureError(FeatureNames.Sms)),
      sendBouncedSubmissionSms: () =>
        Promise.reject(new MissingFeatureError(FeatureNames.Sms)),
    }
  }

  const {
    twilioAccountSid,
    twilioApiKey,
    twilioApiSecret,
    twilioMsgSrvcSid,
  } = smsFeature.props

  const twilioClient = Twilio(twilioApiKey, twilioApiSecret, {
    accountSid: twilioAccountSid,
  })
  const twilioConfig: TwilioConfig = {
    msgSrvcSid: twilioMsgSrvcSid,
    client: twilioClient,
  }

  return {
    sendVerificationOtp: (recipient, otp, formId) =>
      sendVerificationOtp(recipient, otp, formId, twilioConfig),
    sendAdminContactOtp: (recipient, otp, userId) =>
      sendAdminContactOtp(recipient, otp, userId, twilioConfig),
    sendFormDeactivatedSms: (params) =>
      sendFormDeactivatedSms(params, twilioConfig),
    sendBouncedSubmissionSms: (params) =>
      sendBouncedSubmissionSms(params, twilioConfig),
  }
}

export const SmsFactory = createSmsFactory(smsFeature)
