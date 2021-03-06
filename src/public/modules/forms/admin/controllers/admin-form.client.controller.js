'use strict'

const HttpStatus = require('http-status-codes')
const { LogicType } = require('../../../../../types')

// All viewable tabs. readOnly is true if that tab cannot be used to edit form.
const VIEW_TABS = [
  { title: 'Build', route: 'build', readOnly: false },
  { title: 'Logic', route: 'logic', readOnly: false },
  { title: 'Settings', route: 'settings', readOnly: false },
  { title: 'Share', route: 'share', readOnly: true },
  { title: 'Data', route: 'results', readOnly: true },
]

// TODO: refactor canUserEdit into its own service
function canUserEdit(form, user) {
  const { email: userEmail } = user
  const { email: adminEmail } = form.admin
  return (
    userEmail === adminEmail ||
    form.permissionList.some(
      (permissions) => permissions.write && permissions.email === userEmail,
    )
  )
}

function getViewTabs(canEdit) {
  return canEdit ? VIEW_TABS : VIEW_TABS.filter((tab) => tab.readOnly)
}

// Forms controller
angular
  .module('forms', ['ng-drag-scroll'])
  .controller('AdminFormController', [
    '$scope',
    '$translate',
    '$uibModal',
    'FormData',
    'Auth',
    'moment',
    'Toastr',
    '$state',
    '$window',
    'FormApi',
    AdminFormController,
  ])

function AdminFormController(
  $scope,
  $translate,
  $uibModal,
  FormData,
  Auth,
  moment,
  Toastr,
  $state,
  $window,
  FormApi,
) {
  // Banner message on form builder routes
  $scope.bannerContent = $window.siteBannerContent || $window.adminBannerContent
  $scope.myform = FormData.form

  // Redirect to signin if unable to get user
  $scope.user =
    Auth.getUser() ||
    $state.go(
      'signin',
      {
        targetState: 'viewForm',
        targetFormId: $scope.myform._id,
      },
      { location: 'replace' },
    )

  // Get support form link from translation json.
  $translate('LINKS.SUPPORT_FORM_LINK').then((supportFormLink) => {
    $scope.supportFormLink = supportFormLink
  })

  // userCanEdit is inherited by the share-form component, so avoid changing
  // the variable name
  $scope.userCanEdit = canUserEdit($scope.myform, $scope.user)
  $scope.viewTabs = getViewTabs($scope.userCanEdit)

  /* Top bar within form */
  $scope.lastModifiedString = '-'
  $scope.$watch(
    '[myform.lastModified]',
    () => {
      // Transform last modified time into readable format
      let today = moment().clone().startOf('day')
      let isToday = moment($scope.myform.lastModified).isSame(today, 'd')
      if (isToday) {
        $scope.lastModifiedString =
          moment($scope.myform.lastModified).format('h:mm A, ') + 'Today'
      } else {
        $scope.lastModifiedString = moment($scope.myform.lastModified).format(
          'h:mm A, D/M/YY',
        )
      }
    },
    true,
  )

  /* Collaborator */
  $scope.refreshFormDataFromCollab = (form) => {
    $scope.myform = form
  }

  /**
   * If the collab modal is shown, hide it, and if it is hidden, show it.
   * When showing the collab modal, the html body for mobile will be scroll locked, to prevent the ability to scroll
   * the page while edit collaborator dropdowns (which are appended to the body) are open.
   */
  $scope.toggleCollabModal = () => {
    angular.element('body').addClass('mobile-scroll-lock')
    $uibModal.open({
      animation: false,
      templateUrl: 'modules/forms/admin/views/collaborator.client.modal.html',
      windowClass: 'full-screen-modal-window',
      controller: 'CollaboratorModalController',
      resolve: {
        externalScope: () => ({
          form: $scope.myform,
          user: $scope.user,
          userCanEdit: $scope.userCanEdit,
          refreshFormDataFromCollab: $scope.refreshFormDataFromCollab,
        }),
      },
    })
  }

  /**
   * Calls the update form api
   * formId is the id of the form to update
   * updatedForm is a subset of fields from scope.myform which have been edited
   *
   * @param {Object} {formId: String, updatedForm: Object}
   * @returns Promise
   */
  $scope.updateForm = (update) => {
    return FormApi.update({ formId: $scope.myform._id }, { form: update })
      .$promise.then((savedForm) => {
        // Updating this form updates lastModified
        // and also updates myform if a formToUse is passed in
        $scope.myform = savedForm
      })
      .catch((error) => {
        if (!error) {
          return
        }
        let errorMessage
        switch (error.status) {
          case HttpStatus.BAD_REQUEST:
            errorMessage =
              'This page seems outdated, and your changes could not be saved. Please refresh.'
            break
          case HttpStatus.UNAUTHORIZED:
            errorMessage =
              'Your changes could not be saved as your account lacks the requisite privileges.'
            break
          case HttpStatus.UNPROCESSABLE_ENTITY:
            // Validation can fail for many reasons, so return more specific message
            errorMessage = _.get(
              error,
              'data.message',
              'Your changes contain invalid input.',
            )
            break
          case HttpStatus.REQUEST_TOO_LONG: // HTTP Payload Too Large
            errorMessage = `
                Your form is too large. Reduce the number of fields, or submit a
                <a href="${$scope.supportFormLink}" target="_blank" rel="noopener"><u>Support Form</u></a>.
              `
            break
          default:
            errorMessage = 'An error occurred while saving your changes.'
        }
        Toastr.error(errorMessage)
        return error
      })
  }

  /* Logic stuff with checking across Build and Logic tabs */
  $scope.$watch(
    '[myform.form_fields, myform.form_logics]',
    () => {
      $scope.checkLogicError()
    },
    true,
  )

  /**
   * Updates $scope.isLogicError based on whether form has logic units with fields
   * that no longer exist.
   */
  $scope.checkLogicError = () => {
    $scope.isLogicError = $scope.myform.form_logics.some((logicUnit) => {
      return hasConditionError(logicUnit) || hasShowError(logicUnit)
    })
  }

  /**
   * Checks if all fields exist in a logic unit's conditions.
   * @param {Object} logicUnit
   */
  const hasConditionError = (logicUnit) => {
    return logicUnit.conditions.some((condition) => !getField(condition.field))
  }

  /**
   * Checks if a logic unit has any errors in its fields to show.
   * @param {Object} logicUnit
   */
  const hasShowError = (logicUnit) => {
    if (logicUnit.logicType !== LogicType.ShowFields) {
      return false
    }
    return logicUnit.show.some((showField) => !getField(showField))
  }

  let getField = (fieldId) => {
    return $scope.myform.form_fields.find(function (field) {
      return field._id === fieldId
    })
  }
}
