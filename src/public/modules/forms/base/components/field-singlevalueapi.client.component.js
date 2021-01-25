'use strict'

angular.module('forms').component('singlevalueapiFieldComponent', {
  templateUrl:
    'modules/forms/base/componentViews/field-singlevalueapi.client.view.html',
  bindings: {
    field: '<',
    forms: '<',
  },
  controller: singleValueAPIFieldComponentController,
  controllerAs: 'vm',
})

function singleValueAPIFieldComponentController() {}
