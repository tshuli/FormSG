import axios from 'axios'
import { ObjectId } from 'bson'
import crypto from 'crypto'
import dedent from 'dedent'
import { cloneDeep, omit, pick } from 'lodash'
import mongoose from 'mongoose'
import { mocked } from 'ts-jest/utils'

import getFormModel from 'src/app/models/form.server.model'
import { EMAIL_HEADERS, EmailType } from 'src/app/services/mail/mail.constants'
import MailService from 'src/app/services/mail/mail.service'
import { SmsFactory } from 'src/app/services/sms/sms.factory'
import * as LoggerModule from 'src/config/logger'
import {
  BounceType,
  IPopulatedForm,
  ISnsNotification,
  IUserSchema,
} from 'src/types'

import dbHandler from 'tests/unit/backend/helpers/jest-db'
import getMockLogger from 'tests/unit/backend/helpers/jest-logger'

import { UserWithContactNumber } from '../bounce.types'

import { makeBounceNotification, MOCK_SNS_BODY } from './bounce-test-helpers'

jest.mock('axios')
const mockAxios = mocked(axios, true)
jest.mock('src/config/logger')
const MockLoggerModule = mocked(LoggerModule, true)
jest.mock('src/app/services/mail/mail.service')
const MockMailService = mocked(MailService, true)
jest.mock('src/app/services/sms/sms.factory', () => ({
  SmsFactory: {
    sendFormDeactivatedSms: jest.fn(),
    sendBouncedSubmissionSms: jest.fn(),
  },
}))
const MockSmsFactory = mocked(SmsFactory, true)

const mockShortTermLogger = getMockLogger()
const mockLogger = getMockLogger()
MockLoggerModule.createCloudWatchLogger.mockReturnValue(mockShortTermLogger)
MockLoggerModule.createLoggerWithLabel.mockReturnValue(mockLogger)

// Import modules which depend on config last so that mocks get imported correctly
// eslint-disable-next-line import/first
import getBounceModel from 'src/app/modules/bounce/bounce.model'
// eslint-disable-next-line import/first
import {
  extractEmailType,
  getUpdatedBounceDoc,
  isValidSnsRequest,
  logCriticalBounce,
  logEmailNotification,
  notifyAdminsOfBounce,
} from 'src/app/modules/bounce/bounce.service'

const Form = getFormModel(mongoose)
const Bounce = getBounceModel(mongoose)

const MOCK_EMAIL = 'email@example.com'
const MOCK_EMAIL_2 = 'email2@example.com'
const MOCK_CONTACT = {
  email: MOCK_EMAIL,
  contact: '+6581234567',
}
const MOCK_CONTACT_2 = {
  email: MOCK_EMAIL_2,
  contact: '+6581234568',
}
const MOCK_FORM_ID = new ObjectId()
const MOCK_ADMIN_ID = new ObjectId()
const MOCK_SUBMISSION_ID = new ObjectId()

describe('BounceService', () => {
  beforeAll(async () => await dbHandler.connect())

  afterEach(async () => {
    await dbHandler.clearDatabase()
    jest.clearAllMocks()
  })

  afterAll(async () => await dbHandler.closeDatabase())

  describe('extractEmailType', () => {
    it('should extract the email type correctly', () => {
      const notification = makeBounceNotification({
        emailType: EmailType.AdminResponse,
      })
      expect(extractEmailType(notification)).toBe(EmailType.AdminResponse)
    })
  })

  describe('getUpdatedBounceDoc', () => {
    beforeEach(() => {
      jest.resetAllMocks()
    })

    afterEach(async () => {
      await dbHandler.clearDatabase()
    })

    it('should return null when there is no form ID', async () => {
      const notification = makeBounceNotification()
      const header = notification.mail.headers.find(
        (header) => header.name === EMAIL_HEADERS.formId,
      )
      // Needed for TypeScript not to complain
      if (header) {
        header.value = ''
      }
      const result = await getUpdatedBounceDoc(notification)
      expect(result).toBeNull()
    })

    it('should call updateBounceInfo if the document exists', async () => {
      const bounceDoc = new Bounce({
        formId: String(MOCK_FORM_ID),
      })
      await bounceDoc.save()
      const notification = makeBounceNotification({
        formId: MOCK_FORM_ID,
      })
      const result = await getUpdatedBounceDoc(notification)
      expect(result?.toObject()).toEqual(
        bounceDoc.updateBounceInfo(notification).toObject(),
      )
    })

    it('should call fromSnsNotification if the document does not exist', async () => {
      const mock = jest.spyOn(Bounce, 'fromSnsNotification')
      const notification = makeBounceNotification({
        formId: MOCK_FORM_ID,
      })
      const result = await getUpdatedBounceDoc(notification)
      const actual = pick(result?.toObject(), [
        'formId',
        'bounces',
        'hasAutoEmailed',
      ])
      expect(actual).toEqual({
        formId: MOCK_FORM_ID,
        bounces: [],
        hasAutoEmailed: false,
      })
      expect(mock).toHaveBeenCalledWith(notification, String(MOCK_FORM_ID))
    })
  })

  describe('logEmailNotification', () => {
    const MOCK_RECIPIENT_LIST = [
      'email1@example.com',
      'email2@example.com',
      'email3@example.com',
    ]
    beforeEach(() => jest.resetAllMocks())

    it('should log email confirmations to short-term logs', async () => {
      const formId = new ObjectId()
      const submissionId = new ObjectId()
      const notification = makeBounceNotification({
        formId,
        submissionId,
        recipientList: MOCK_RECIPIENT_LIST,
        bouncedList: MOCK_RECIPIENT_LIST,
        bounceType: BounceType.Transient,
        emailType: EmailType.EmailConfirmation,
      })
      logEmailNotification(notification)
      expect(mockLogger.info).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
      expect(mockShortTermLogger.info).toHaveBeenCalledWith(notification)
    })

    it('should log admin responses to regular logs', async () => {
      const formId = new ObjectId()
      const submissionId = new ObjectId()
      const notification = makeBounceNotification({
        formId,
        submissionId,
        recipientList: MOCK_RECIPIENT_LIST,
        bouncedList: MOCK_RECIPIENT_LIST,
        bounceType: BounceType.Transient,
        emailType: EmailType.AdminResponse,
      })
      logEmailNotification(notification)
      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Email notification',
        meta: {
          action: 'logEmailNotification',
          ...notification,
        },
      })
      expect(mockLogger.warn).not.toHaveBeenCalled()
      expect(mockShortTermLogger.info).not.toHaveBeenCalled()
    })

    it('should log login OTPs to regular logs', async () => {
      const formId = new ObjectId()
      const submissionId = new ObjectId()
      const notification = makeBounceNotification({
        formId,
        submissionId,
        recipientList: MOCK_RECIPIENT_LIST,
        bouncedList: MOCK_RECIPIENT_LIST,
        bounceType: BounceType.Transient,
        emailType: EmailType.LoginOtp,
      })
      logEmailNotification(notification)
      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Email notification',
        meta: {
          action: 'logEmailNotification',
          ...notification,
        },
      })
      expect(mockLogger.warn).not.toHaveBeenCalled()
      expect(mockShortTermLogger.info).not.toHaveBeenCalled()
    })

    it('should log admin notifications to regular logs', async () => {
      const formId = new ObjectId()
      const submissionId = new ObjectId()
      const notification = makeBounceNotification({
        formId,
        submissionId,
        recipientList: MOCK_RECIPIENT_LIST,
        bouncedList: MOCK_RECIPIENT_LIST,
        bounceType: BounceType.Transient,
        emailType: EmailType.AdminBounce,
      })
      logEmailNotification(notification)
      expect(mockLogger.info).toHaveBeenCalledWith({
        message: 'Email notification',
        meta: {
          action: 'logEmailNotification',
          ...notification,
        },
      })
      expect(mockLogger.warn).not.toHaveBeenCalled()
      expect(mockShortTermLogger.info).not.toHaveBeenCalled()
    })

    it('should log verification OTPs to short-term logs', async () => {
      const formId = new ObjectId()
      const submissionId = new ObjectId()
      const notification = makeBounceNotification({
        formId,
        submissionId,
        recipientList: MOCK_RECIPIENT_LIST,
        bouncedList: MOCK_RECIPIENT_LIST,
        bounceType: BounceType.Transient,
        emailType: EmailType.VerificationOtp,
      })
      logEmailNotification(notification)
      expect(mockLogger.info).not.toHaveBeenCalled()
      expect(mockLogger.warn).not.toHaveBeenCalled()
      expect(mockShortTermLogger.info).toHaveBeenCalledWith(notification)
    })
  })

  describe('notifyAdminsOfBounce', () => {
    const MOCK_FORM_TITLE = 'FormTitle'
    let testUser: IUserSchema

    beforeEach(async () => {
      const { user } = await dbHandler.insertFormCollectionReqs({
        userId: MOCK_ADMIN_ID,
      })
      testUser = user
    })

    afterAll(async () => {
      await dbHandler.clearDatabase()
    })

    beforeEach(async () => {
      jest.resetAllMocks()
    })

    it('should auto-email when admin is not email recipient', async () => {
      const form = (await new Form({
        admin: testUser._id,
        title: MOCK_FORM_TITLE,
      })
        .populate('admin')
        .execPopulate()) as IPopulatedForm
      const bounceDoc = new Bounce({
        formId: form._id,
        bounces: [
          { email: MOCK_EMAIL, hasBounced: true, bounceType: 'Permanent' },
        ],
      })

      const notifiedRecipients = await notifyAdminsOfBounce(bounceDoc, form, [])

      expect(MockMailService.sendBounceNotification).toHaveBeenCalledWith({
        emailRecipients: [testUser.email],
        bouncedRecipients: [MOCK_EMAIL],
        bounceType: BounceType.Permanent,
        formTitle: form.title,
        formId: form._id,
      })
      expect(notifiedRecipients.emailRecipients).toEqual([testUser.email])
    })

    it('should auto-email when any collaborator is not email recipient', async () => {
      const collabEmail = 'collaborator@test.gov.sg'
      const form = (await new Form({
        admin: testUser._id,
        title: MOCK_FORM_TITLE,
        permissionList: [{ email: collabEmail, write: true }],
      })
        .populate('admin')
        .execPopulate()) as IPopulatedForm
      const bounceDoc = new Bounce({
        formId: form._id,
        bounces: [
          { email: testUser.email, hasBounced: true, bounceType: 'Permanent' },
        ],
      })

      const notifiedRecipients = await notifyAdminsOfBounce(bounceDoc, form, [])

      expect(MockMailService.sendBounceNotification).toHaveBeenCalledWith({
        emailRecipients: [collabEmail],
        bouncedRecipients: [testUser.email],
        bounceType: BounceType.Permanent,
        formTitle: form.title,
        formId: form._id,
      })
      expect(notifiedRecipients.emailRecipients).toEqual([collabEmail])
    })

    it('should not auto-email when admin is email recipient', async () => {
      const form = (await new Form({
        admin: testUser._id,
        title: MOCK_FORM_TITLE,
      })
        .populate('admin')
        .execPopulate()) as IPopulatedForm
      const bounceDoc = new Bounce({
        formId: form._id,
        bounces: [
          { email: testUser.email, hasBounced: true, bounceType: 'Permanent' },
        ],
      })

      const notifiedRecipients = await notifyAdminsOfBounce(bounceDoc, form, [])

      expect(MockMailService.sendBounceNotification).not.toHaveBeenCalled()
      expect(notifiedRecipients.emailRecipients).toEqual([])
    })

    it('should not auto-email when all collabs are email recipients', async () => {
      const collabEmail = 'collaborator@test.gov.sg'
      const form = (await new Form({
        admin: testUser._id,
        title: MOCK_FORM_TITLE,
        permissionList: [{ email: collabEmail, write: false }],
      })
        .populate('admin')
        .execPopulate()) as IPopulatedForm
      const bounceDoc = new Bounce({
        formId: form._id,
        bounces: [
          { email: testUser.email, hasBounced: true, bounceType: 'Permanent' },
          { email: collabEmail, hasBounced: true, bounceType: 'Permanent' },
        ],
      })

      const notifiedRecipients = await notifyAdminsOfBounce(bounceDoc, form, [])

      expect(MockMailService.sendBounceNotification).not.toHaveBeenCalled()
      expect(notifiedRecipients.emailRecipients).toEqual([])
    })

    it('should send text for all SMS recipients and return successful ones', async () => {
      const form = (await new Form({
        admin: testUser._id,
        title: MOCK_FORM_TITLE,
      })
        .populate('admin')
        .execPopulate()) as IPopulatedForm
      const bounceDoc = new Bounce({
        formId: form._id,
        bounces: [],
      })
      MockSmsFactory.sendBouncedSubmissionSms.mockResolvedValue(true)

      const notifiedRecipients = await notifyAdminsOfBounce(bounceDoc, form, [
        MOCK_CONTACT,
        MOCK_CONTACT_2,
      ])

      expect(MockSmsFactory.sendBouncedSubmissionSms).toHaveBeenCalledTimes(2)
      expect(MockSmsFactory.sendBouncedSubmissionSms).toHaveBeenCalledWith({
        adminEmail: testUser.email,
        adminId: testUser._id,
        formId: form._id,
        formTitle: form.title,
        recipient: MOCK_CONTACT.contact,
        recipientEmail: MOCK_CONTACT.email,
      })
      expect(MockSmsFactory.sendBouncedSubmissionSms).toHaveBeenCalledWith({
        adminEmail: testUser.email,
        adminId: testUser._id,
        formId: form._id,
        formTitle: form.title,
        recipient: MOCK_CONTACT_2.contact,
        recipientEmail: MOCK_CONTACT_2.email,
      })
      expect(notifiedRecipients.smsRecipients).toEqual([
        MOCK_CONTACT,
        MOCK_CONTACT_2,
      ])
    })

    it('should return only successfuly SMS recipients when some SMSes fail', async () => {
      const form = (await new Form({
        admin: testUser._id,
        title: MOCK_FORM_TITLE,
      })
        .populate('admin')
        .execPopulate()) as IPopulatedForm
      const bounceDoc = new Bounce({
        formId: form._id,
        bounces: [],
      })
      const mockRejectedReason = 'reasons'
      MockSmsFactory.sendBouncedSubmissionSms
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(mockRejectedReason)

      const notifiedRecipients = await notifyAdminsOfBounce(bounceDoc, form, [
        MOCK_CONTACT,
        MOCK_CONTACT_2,
      ])

      expect(MockSmsFactory.sendBouncedSubmissionSms).toHaveBeenCalledTimes(2)
      expect(MockSmsFactory.sendBouncedSubmissionSms).toHaveBeenCalledWith({
        adminEmail: testUser.email,
        adminId: testUser._id,
        formId: form._id,
        formTitle: form.title,
        recipient: MOCK_CONTACT.contact,
        recipientEmail: MOCK_CONTACT.email,
      })
      expect(MockSmsFactory.sendBouncedSubmissionSms).toHaveBeenCalledWith({
        adminEmail: testUser.email,
        adminId: testUser._id,
        formId: form._id,
        formTitle: form.title,
        recipient: MOCK_CONTACT_2.contact,
        recipientEmail: MOCK_CONTACT_2.email,
      })
      expect(notifiedRecipients.smsRecipients).toEqual([MOCK_CONTACT])
    })
  })

  describe('logCriticalBounce', () => {
    beforeEach(() => {
      jest.resetAllMocks()
    })

    it('should log correctly when all bounces are transient', () => {
      const bounceDoc = new Bounce({
        formId: MOCK_FORM_ID,
        bounces: [
          { email: MOCK_EMAIL, hasBounced: true, bounceType: 'Transient' },
          { email: MOCK_EMAIL_2, hasBounced: true, bounceType: 'Transient' },
        ],
        hasAutoEmailed: true,
        hasAutoSmsed: true,
      })
      const snsInfo = makeBounceNotification({
        formId: MOCK_FORM_ID,
        submissionId: MOCK_SUBMISSION_ID,
        recipientList: [MOCK_EMAIL, MOCK_EMAIL_2],
        bouncedList: [MOCK_EMAIL],
      })
      const autoEmailRecipients = [MOCK_EMAIL, MOCK_EMAIL_2]
      const autoSmsRecipients = [MOCK_CONTACT, MOCK_CONTACT_2]
      logCriticalBounce(
        bounceDoc,
        snsInfo,
        autoEmailRecipients,
        autoSmsRecipients,
        false,
      )
      expect(mockLogger.warn).toHaveBeenCalledWith({
        message: 'Bounced submission',
        meta: {
          action: 'logCriticalBounce',
          hasAutoEmailed: true,
          hasAutoSmsed: true,
          hasDeactivated: false,
          formId: String(MOCK_FORM_ID),
          submissionId: String(MOCK_SUBMISSION_ID),
          recipients: [MOCK_EMAIL, MOCK_EMAIL_2],
          numRecipients: 2,
          numTransient: 2,
          numPermanent: 0,
          autoEmailRecipients,
          autoSmsRecipients,
          bounceInfo: snsInfo.bounce,
        },
      })
    })

    it('should log correctly when all bounces are permanent', () => {
      const bounceDoc = new Bounce({
        formId: MOCK_FORM_ID,
        bounces: [
          { email: MOCK_EMAIL, hasBounced: true, bounceType: 'Permanent' },
          { email: MOCK_EMAIL_2, hasBounced: true, bounceType: 'Permanent' },
        ],
        hasAutoEmailed: true,
        hasAutoSmsed: true,
      })
      const snsInfo = makeBounceNotification({
        formId: MOCK_FORM_ID,
        submissionId: MOCK_SUBMISSION_ID,
        recipientList: [MOCK_EMAIL, MOCK_EMAIL_2],
        bouncedList: [MOCK_EMAIL],
      })
      const autoEmailRecipients: string[] = []
      const autoSmsRecipients = [MOCK_CONTACT, MOCK_CONTACT_2]
      logCriticalBounce(
        bounceDoc,
        snsInfo,
        autoEmailRecipients,
        autoSmsRecipients,
        true,
      )
      expect(mockLogger.warn).toHaveBeenCalledWith({
        message: 'Bounced submission',
        meta: {
          action: 'logCriticalBounce',
          hasAutoEmailed: true,
          hasAutoSmsed: true,
          hasDeactivated: true,
          formId: String(MOCK_FORM_ID),
          submissionId: String(MOCK_SUBMISSION_ID),
          recipients: [MOCK_EMAIL, MOCK_EMAIL_2],
          numRecipients: 2,
          numTransient: 0,
          numPermanent: 2,
          autoEmailRecipients,
          autoSmsRecipients,
          bounceInfo: snsInfo.bounce,
        },
      })
    })

    it('should log correctly when there is a mix of bounceTypes', () => {
      const bounceDoc = new Bounce({
        formId: MOCK_FORM_ID,
        bounces: [
          { email: MOCK_EMAIL, hasBounced: true, bounceType: 'Permanent' },
          { email: MOCK_EMAIL_2, hasBounced: true, bounceType: 'Transient' },
        ],
        hasAutoEmailed: true,
        hasAutoSmsed: true,
      })
      const snsInfo = makeBounceNotification({
        formId: MOCK_FORM_ID,
        submissionId: MOCK_SUBMISSION_ID,
        recipientList: [MOCK_EMAIL, MOCK_EMAIL_2],
        bouncedList: [MOCK_EMAIL],
      })
      const autoEmailRecipients: string[] = []
      const autoSmsRecipients = [MOCK_CONTACT, MOCK_CONTACT_2]
      logCriticalBounce(
        bounceDoc,
        snsInfo,
        autoEmailRecipients,
        autoSmsRecipients,
        false,
      )
      expect(mockLogger.warn).toHaveBeenCalledWith({
        message: 'Bounced submission',
        meta: {
          action: 'logCriticalBounce',
          hasAutoEmailed: true,
          hasAutoSmsed: true,
          hasDeactivated: false,
          formId: String(MOCK_FORM_ID),
          submissionId: String(MOCK_SUBMISSION_ID),
          recipients: [MOCK_EMAIL, MOCK_EMAIL_2],
          numRecipients: 2,
          numTransient: 1,
          numPermanent: 1,
          autoEmailRecipients,
          autoSmsRecipients,
          bounceInfo: snsInfo.bounce,
        },
      })
    })

    it('should log correctly when hasAutoEmailed is false', () => {
      const bounceDoc = new Bounce({
        formId: MOCK_FORM_ID,
        bounces: [],
        hasAutoEmailed: false,
        hasAutoSmsed: true,
      })
      const snsInfo = makeBounceNotification({
        formId: MOCK_FORM_ID,
        submissionId: MOCK_SUBMISSION_ID,
        recipientList: [MOCK_EMAIL, MOCK_EMAIL_2],
        bouncedList: [],
      })
      const autoEmailRecipients: string[] = []
      const autoSmsRecipients: UserWithContactNumber[] = []
      logCriticalBounce(
        bounceDoc,
        snsInfo,
        autoEmailRecipients,
        autoSmsRecipients,
        false,
      )
      expect(mockLogger.warn).toHaveBeenCalledWith({
        message: 'Bounced submission',
        meta: {
          action: 'logCriticalBounce',
          hasAutoEmailed: false,
          hasAutoSmsed: true,
          hasDeactivated: false,
          formId: String(MOCK_FORM_ID),
          submissionId: String(MOCK_SUBMISSION_ID),
          recipients: [],
          numRecipients: 0,
          numTransient: 0,
          numPermanent: 0,
          autoEmailRecipients,
          autoSmsRecipients,
          bounceInfo: snsInfo.bounce,
        },
      })
    })

    it('should log correctly when hasAutoSmsed is false', () => {
      const bounceDoc = new Bounce({
        formId: MOCK_FORM_ID,
        bounces: [],
        hasAutoEmailed: true,
        hasAutoSmsed: false,
      })
      const snsInfo = makeBounceNotification({
        formId: MOCK_FORM_ID,
        submissionId: MOCK_SUBMISSION_ID,
        recipientList: [MOCK_EMAIL, MOCK_EMAIL_2],
        bouncedList: [],
      })
      const autoEmailRecipients: string[] = []
      const autoSmsRecipients: UserWithContactNumber[] = []
      logCriticalBounce(
        bounceDoc,
        snsInfo,
        autoEmailRecipients,
        autoSmsRecipients,
        false,
      )
      expect(mockLogger.warn).toHaveBeenCalledWith({
        message: 'Bounced submission',
        meta: {
          action: 'logCriticalBounce',
          hasAutoEmailed: true,
          hasAutoSmsed: false,
          hasDeactivated: false,
          formId: String(MOCK_FORM_ID),
          submissionId: String(MOCK_SUBMISSION_ID),
          recipients: [],
          numRecipients: 0,
          numTransient: 0,
          numPermanent: 0,
          autoEmailRecipients,
          autoSmsRecipients,
          bounceInfo: snsInfo.bounce,
        },
      })
    })
  })

  describe('isValidSnsRequest', () => {
    const keys = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'pkcs1',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    })

    let body: ISnsNotification

    beforeEach(() => {
      body = cloneDeep(MOCK_SNS_BODY)
      mockAxios.get.mockResolvedValue({
        data: keys.publicKey,
      })
    })

    it('should gracefully reject when input is empty', () => {
      return expect(isValidSnsRequest(undefined!)).resolves.toBe(false)
    })

    it('should reject requests when their structure is invalid', () => {
      const invalidBody = omit(cloneDeep(body), 'Type') as ISnsNotification
      return expect(isValidSnsRequest(invalidBody)).resolves.toBe(false)
    })

    it('should reject requests when their certificate URL is invalid', () => {
      body.SigningCertURL = 'http://www.example.com'
      return expect(isValidSnsRequest(body)).resolves.toBe(false)
    })

    it('should reject requests when their signature version is invalid', () => {
      body.SignatureVersion = 'wrongSignatureVersion'
      return expect(isValidSnsRequest(body)).resolves.toBe(false)
    })

    it('should reject requests when their signature is invalid', () => {
      return expect(isValidSnsRequest(body)).resolves.toBe(false)
    })

    it('should accept when requests are valid', () => {
      const signer = crypto.createSign('RSA-SHA1')
      const baseString =
        dedent`Message
        ${body.Message}
        MessageId
        ${body.MessageId}
        Timestamp
        ${body.Timestamp}
        TopicArn
        ${body.TopicArn}
        Type
        ${body.Type}
        ` + '\n'
      signer.write(baseString)
      body.Signature = signer.sign(keys.privateKey, 'base64')
      return expect(isValidSnsRequest(body)).resolves.toBe(true)
    })
  })
})
