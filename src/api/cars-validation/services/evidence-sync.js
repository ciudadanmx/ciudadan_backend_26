"use strict";

const { DRIVER_EVIDENCE_MAP, toMediaList } = require("./helpers");

const findExistingEvidence = async (
  strapi,
  validationId,
  sourceDriverField,
  sourceFileId
) => {
  const rows = await strapi.entityService.findMany(
    "api::cars-evidence.cars-evidence",
    {
      filters: {
        validation: { id: validationId },
        source_driver_field: sourceDriverField,
        source_file_id: sourceFileId,
      },
      limit: 1,
    }
  );
  return rows[0] || null;
};

const syncEvidencesFromDriver = async (
  strapi,
  { validationId, driver, actorId }
) => {
  const created = [];
  const skipped = [];

  for (const def of DRIVER_EVIDENCE_MAP) {
    const files = toMediaList(driver[def.field]);
    if (!files.length) continue;

    for (const file of files) {
      const fileId = Number(file.id);
      if (!fileId) continue;

      const existing = await findExistingEvidence(
        strapi,
        validationId,
        def.field,
        fileId
      );
      if (existing) {
        skipped.push(existing.id);
        continue;
      }

      const evidence = await strapi.entityService.create(
        "api::cars-evidence.cars-evidence",
        {
          data: {
            validation: validationId,
            type: def.type,
            file: fileId,
            review_status: "pending",
            origin: "preregister",
            source_driver_field: def.field,
            source_file_id: fileId,
            version: 1,
            is_current: true,
            uploaded_from_gallery: true,
            timestamp_server: new Date(),
          },
        }
      );

      created.push(evidence.id);
    }
  }

  return { created, skipped, evidenceCount: created.length + skipped.length };
};

module.exports = { syncEvidencesFromDriver, findExistingEvidence };
