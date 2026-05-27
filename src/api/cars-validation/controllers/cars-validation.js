"use strict";

const { createCoreController } = require("@strapi/strapi").factories;
const {
  createFromAgenda,
  resolveByAgenda,
  getReviewBundle,
} = require("../services/validation-from-agenda");

module.exports = createCoreController(
  "api::cars-validation.cars-validation",
  ({ strapi }) => ({
    async createFromAgenda(ctx) {
      const isAuthenticated = ctx.state.isAuthenticated;
      console.log("body", ctx.request.body);
      if (!isAuthenticated) {
        return ctx.unauthorized("Debes iniciar sesión.");
      }

      const { driverId, agendaId, agencyId, userId, appointmentDate } =
        ctx.request.body || {};

      if (!driverId || !agendaId || !appointmentDate) {
        return ctx.badRequest(
          "driverId, agendaId y appointmentDate son requeridos."
        );
      }

      try {
        const result = await createFromAgenda(strapi, {
          userId: Number(userId),
          driverId: Number(driverId),
          agendaId: Number(agendaId),
          agencyId: agencyId ? Number(agencyId) : null,
          appointmentDate,
        });

        return ctx.send({ data: result.validation, meta: result.meta });
      } catch (error) {
        const status = error.status || 500;
        if (status === 404) return ctx.notFound(error.message);
        if (status === 403) return ctx.forbidden(error.message);
        if (status === 400) return ctx.badRequest(error.message);
        strapi.log.error("createFromAgenda failed", error);
        return ctx.internalServerError(
          error.message || "No se pudo crear la validación."
        );
      }
    },

    async resolveByAgenda(ctx) {
      const { agendaId } = ctx.query;
      if (!agendaId) {
        return ctx.badRequest("agendaId es requerido.");
      }

      const validation = await resolveByAgenda(strapi, Number(agendaId));
      if (!validation) {
        return ctx.notFound("No existe validación para esta agenda.");
      }

      return ctx.send({ data: { id: validation.id, validation } });
    },

    async getReviewBundle(ctx) {
      const { id } = ctx.params;
      if (!id) {
        return ctx.badRequest("id es requerido.");
      }

      try {
        const validation = await getReviewBundle(strapi, Number(id));
        return ctx.send({ data: validation });
      } catch (error) {
        if (error.status === 404) return ctx.notFound(error.message);
        strapi.log.error("getReviewBundle failed", error);
        return ctx.internalServerError(
          error.message || "No se pudo cargar la validación."
        );
      }
    },
  })
);
