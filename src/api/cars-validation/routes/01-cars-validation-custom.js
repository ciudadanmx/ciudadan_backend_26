'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/cars-validations/from-agenda',
      handler: 'cars-validation.createFromAgenda',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/cars-validations/resolve',
      handler: 'cars-validation.resolveByAgenda',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'GET',
      path: '/cars-validations/:id/review-bundle',
      handler: 'cars-validation.getReviewBundle',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
