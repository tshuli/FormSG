import { pick } from 'lodash'

import { types as basicTypes } from 'src/shared/resources/basic'
import { BasicField, MyInfoAttribute } from 'src/types'

import {
  generateNewAttachmentResponse,
  generateNewCheckboxResponse,
  generateNewSingleAnswerResponse,
  generateNewTableResponse,
} from 'tests/unit/backend/helpers/generate-form-data'

import { ProcessedSingleAnswerResponse } from '../../submission.types'
import * as EmailSubmissionService from '../email-submission.service'

const ALL_SINGLE_SUBMITTED_RESPONSES = basicTypes
  // Attachments are special cases, requiring filename and content
  .filter((t) => !t.answerArray && t.name !== BasicField.Attachment)
  .map((t) => generateNewSingleAnswerResponse(t.name))

const generateSingleAnswerJson = (response: ProcessedSingleAnswerResponse) =>
  pick(response, ['question', 'answer'])

const generateSingleAnswerAutoreply = (
  response: ProcessedSingleAnswerResponse,
) => ({
  question: response.question,
  answerTemplate: response.answer.split('\n'),
})

const generateSingleAnswerFormData = (
  response: ProcessedSingleAnswerResponse,
) => ({
  ...pick(response, ['question', 'answer', 'fieldType']),
  answerTemplate: response.answer.split('\n'),
})

describe('email-submission.service', () => {
  describe('createEmailData', () => {
    it('should return email data correctly for all single answer field types', () => {
      const emailData = EmailSubmissionService.createEmailData(
        ALL_SINGLE_SUBMITTED_RESPONSES,
        new Set(),
      )
      const expectedAutoReplyData = ALL_SINGLE_SUBMITTED_RESPONSES.map(
        generateSingleAnswerAutoreply,
      )
      const expectedJsonData = ALL_SINGLE_SUBMITTED_RESPONSES.map(
        generateSingleAnswerJson,
      )
      const expectedFormData = ALL_SINGLE_SUBMITTED_RESPONSES.map(
        generateSingleAnswerFormData,
      )
      expect(emailData.autoReplyData).toEqual(expectedAutoReplyData)
      expect(emailData.jsonData).toEqual(expectedJsonData)
      expect(emailData.formData).toEqual(expectedFormData)
    })

    it('should exclude section fields from JSON data', () => {
      const response = generateNewSingleAnswerResponse(BasicField.Section)

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      expect(emailData).toEqual({
        jsonData: [],
        autoReplyData: [generateSingleAnswerAutoreply(response)],
        formData: [generateSingleAnswerFormData(response)],
      })
    })

    it('should exclude non-visible fields from autoreply data', () => {
      const response = generateNewSingleAnswerResponse(BasicField.ShortText, {
        isVisible: false,
      })

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      expect(emailData).toEqual({
        jsonData: [generateSingleAnswerJson(response)],
        autoReplyData: [],
        formData: [generateSingleAnswerFormData(response)],
      })
    })

    it('should generate table answers with [table] prefix in form and JSON data', () => {
      const response = generateNewTableResponse()

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      const question = response.question
      const firstRow = response.answerArray[0].join(',')
      const secondRow = response.answerArray[1].join(',')

      expect(emailData).toEqual({
        jsonData: [
          { question: `[table] ${question}`, answer: firstRow },
          { question: `[table] ${question}`, answer: secondRow },
        ],
        autoReplyData: [
          { question, answerTemplate: [firstRow] },
          { question, answerTemplate: [secondRow] },
        ],
        formData: [
          {
            question: `[table] ${question}`,
            answer: firstRow,
            answerTemplate: [firstRow],
            fieldType: 'table',
          },
          {
            question: `[table] ${question}`,
            answer: secondRow,
            answerTemplate: [secondRow],
            fieldType: 'table',
          },
        ],
      })
    })

    it('should generate checkbox answers correctly', () => {
      const response = generateNewCheckboxResponse()

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      const question = response.question
      const answer = response.answerArray.join(', ')

      expect(emailData).toEqual({
        jsonData: [{ question, answer }],
        autoReplyData: [{ question, answerTemplate: [answer] }],
        formData: [
          { question, answer, answerTemplate: [answer], fieldType: 'checkbox' },
        ],
      })
    })

    it('should generate attachment answers with [attachment] prefix in form and JSON data', () => {
      const response = generateNewAttachmentResponse()

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      const question = response.question
      const answer = response.answer

      expect(emailData).toEqual({
        jsonData: [{ question: `[attachment] ${question}`, answer }],
        autoReplyData: [{ question, answerTemplate: [answer] }],
        formData: [
          {
            question: `[attachment] ${question}`,
            answer,
            answerTemplate: [answer],
            fieldType: 'attachment',
          },
        ],
      })
    })

    it('should split single answer fields by newline', () => {
      const answer = 'first line\nsecond line'
      const response = generateNewSingleAnswerResponse(BasicField.ShortText, {
        answer,
      })

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      const question = response.question

      expect(emailData).toEqual({
        jsonData: [{ question, answer }],
        autoReplyData: [{ question, answerTemplate: answer.split('\n') }],
        formData: [
          {
            question,
            answer,
            answerTemplate: answer.split('\n'),
            fieldType: 'textfield',
          },
        ],
      })
    })

    it('should split table answers by newline', () => {
      const answerArray = [['firstLine\nsecondLine', 'thirdLine\nfourthLine']]
      const response = generateNewTableResponse({ answerArray })

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      const question = response.question
      const answer = answerArray[0].join(',')

      expect(emailData).toEqual({
        jsonData: [{ question: `[table] ${question}`, answer }],
        autoReplyData: [{ question, answerTemplate: answer.split('\n') }],
        formData: [
          {
            question: `[table] ${question}`,
            answer,
            answerTemplate: answer.split('\n'),
            fieldType: 'table',
          },
        ],
      })
    })

    it('should split checkbox answers by newline', () => {
      const answerArray = ['firstLine\nsecondLine', 'thirdLine\nfourtLine']
      const response = generateNewCheckboxResponse({ answerArray })

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      const question = response.question
      const answer = answerArray.join(', ')

      expect(emailData).toEqual({
        jsonData: [{ question, answer }],
        autoReplyData: [{ question, answerTemplate: answer.split('\n') }],
        formData: [
          {
            question,
            answer,
            answerTemplate: answer.split('\n'),
            fieldType: 'checkbox',
          },
        ],
      })
    })

    it('should prefix verified fields with [verified] only in form data', () => {
      const response = generateNewSingleAnswerResponse(BasicField.Email, {
        isUserVerified: true,
      })

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set(),
      )

      const question = response.question
      const answer = response.answer

      expect(emailData).toEqual({
        jsonData: [{ question, answer }],
        autoReplyData: [{ question, answerTemplate: [answer] }],
        formData: [
          {
            question: `[verified] ${question}`,
            answer,
            answerTemplate: [answer],
            fieldType: 'email',
          },
        ],
      })
    })

    it('should prefix MyInfo-verified fields with [MyInfo] only in form data', () => {
      const response = generateNewSingleAnswerResponse(BasicField.ShortText, {
        myInfo: { attr: MyInfoAttribute.Name },
      })

      const emailData = EmailSubmissionService.createEmailData(
        [response],
        new Set([response._id]),
      )

      const question = response.question
      const answer = response.answer

      expect(emailData).toEqual({
        jsonData: [{ question, answer }],
        autoReplyData: [{ question, answerTemplate: [answer] }],
        formData: [
          {
            question: `[MyInfo] ${question}`,
            answer,
            answerTemplate: [answer],
            fieldType: 'textfield',
          },
        ],
      })
    })
  })
})
