const { StatusCodes } = require('http-status-codes')
const mongoose = require('mongoose')

const dbHandler = require('../helpers/db-handler')
const Form = dbHandler.makeModel('form.server.model', 'Form')

const Controller = spec(
  'dist/backend/app/controllers/admin-forms.server.controller',
).makeModule(mongoose)

const NewController = require('../../../../dist/backend/app/modules/form/admin-form/admin-form.controller')
const { ResponseMode } = require('../../../../dist/backend/types')

describe('Admin-Forms Controller', () => {
  // Declare global variables
  let req
  let res
  let testForm
  let testUser

  beforeAll(async () => await dbHandler.connect())
  beforeEach(async () => {
    res = jasmine.createSpyObj('res', ['status', 'send', 'json'])
    const collections = await dbHandler.preloadCollections()

    testUser = collections.user
    testForm = collections.form

    req = {
      query: {},
      params: {},
      body: {},
      session: {
        user: {
          _id: testUser._id,
          email: testUser.email,
        },
      },
      headers: {},
      ip: '127.0.0.1',
      get: () => {},
    }
  })

  afterEach(async () => await dbHandler.clearDatabase())
  afterAll(async () => await dbHandler.closeDatabase())

  describe('isFormActive', () => {
    it('should return 404 if form is archived', () => {
      let req = { form: { status: 'ARCHIVED' }, headers: {}, ip: '127.0.0.1' }
      res.status.and.callFake(function () {
        return this
      })
      res.send.and.callFake(function () {
        return this
      })
      Controller.isFormActive(req, res, () => {})
      expect(res.status).toHaveBeenCalledWith(StatusCodes.NOT_FOUND)
    })

    it('should pass on to the next middleware if not archived', () => {
      let req = { form: { status: 'PUBLIC' }, headers: {}, ip: '127.0.0.1' }
      let next = jasmine.createSpy()
      Controller.isFormActive(req, res, next)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('isFormEncryptMode', () => {
    let next
    beforeEach(() => {
      req.form = testForm
      res.status.and.callFake(() => res)
      next = jasmine.createSpy()
    })
    it('should reject forms that are not encrypt mode', () => {
      req.form.responseMode = 'email'
      Controller.isFormEncryptMode(req, res, next)
      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(StatusCodes.UNPROCESSABLE_ENTITY)
    })
    it('should accept forms that are encrypt mode', () => {
      req.form.responseMode = 'encrypt'
      Controller.isFormEncryptMode(req, res, next)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('create', () => {
    it('should successfully save a Form object with user defined fields', (done) => {
      let expected = {
        title: 'form_title',
        responseMode: ResponseMode.Email,
        emails: ['email@hello.gov.sg', 'user@byebye.gov.sg'],
      }
      req.body.form = _.cloneDeep(expected)

      res.status.and.callFake(() => {
        expect(res.status).toHaveBeenCalledWith(StatusCodes.OK)
        return res
      })

      // Check for user-defined fields
      res.json.and.callFake((args) => {
        let returnObj = args.toObject()
        expect(returnObj.title).toEqual(expected.title)
        expect(returnObj.emails).toEqual(expected.emails)
        expect(returnObj.admin.toString()).toEqual(
          req.session.user._id.toString(),
        )
        Form.findOne({ title: expected.title }, (err, foundForm) => {
          if (err || !foundForm) {
            done(err || new Error('Form not saved'))
          } else {
            done()
          }
        })
      })
      NewController.handleCreateForm(req, res)
    })

    it('should return 422 error when saving a Form object with invalid fields', (done) => {
      req.body.form = {
        title: 'bad_form',
        responseMode: ResponseMode.Email,
        emails: 'wrongemail.com',
      }
      res.status.and.callFake(() => {
        expect(res.status).toHaveBeenCalledWith(
          StatusCodes.UNPROCESSABLE_ENTITY,
        )
        done()
        return res
      })
      NewController.handleCreateForm(req, res)
    })
  })

  describe('update', () => {
    it('should successfully update a Form object with new fields', (done) => {
      let expected = {
        title: 'form_title2',
        startPage: {
          colorTheme: 'blue',
          estTimeTaken: 1,
        },
        permissionList: [],
      }
      req.form = testForm
      req.body.form = _.cloneDeep(expected)
      // Check for user-defined fields
      res.json.and.callFake(() => {
        Form.findOne({ _id: req.form._id }, (err, updatedForm) => {
          expect(err).not.toBeTruthy()
          let updatedFormObj = updatedForm.toObject()
          expect(updatedFormObj.title).toEqual(expected.title)
          expect(updatedFormObj.startPage).toEqual(expected.startPage)
          done()
        })
      })
      Controller.update(req, res)
    })

    it('should return 405 error when updating a Form object with invalid fields', (done) => {
      req.form = testForm
      req.body.form = {
        title: 'form_title3',
        startPage: {
          colorTheme: 'wrong_color',
          estTimeTaken: 1,
        },
        permissionList: [],
      }
      res.status.and.callFake(() => {
        expect(res.status).toHaveBeenCalledWith(
          StatusCodes.UNPROCESSABLE_ENTITY,
        )
        done()
        return res
      })
      Controller.update(req, res)
    })
  })
})
