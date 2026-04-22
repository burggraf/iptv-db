/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "sync_jobs",
    type: "base",
    schema: [
      {
        name: "source_id",
        type: "relation",
        required: true,
        options: {
          collectionIdOrName: "sources",
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
        },
      },
      {
        name: "status",
        type: "select",
        required: true,
        options: {
          maxSelect: 1,
          values: ["queued", "running", "completed", "failed"],
        },
      },
      {
        name: "phase",
        type: "text",
        required: false,
      },
      {
        name: "progress",
        type: "number",
        required: false,
      },
      {
        name: "started_at",
        type: "date",
        required: false,
      },
      {
        name: "finished_at",
        type: "date",
        required: false,
      },
      {
        name: "error",
        type: "text",
        required: false,
      },
    ],
    indexes: [
      "CREATE INDEX idx_sync_jobs_source ON sync_jobs (source_id)",
      "CREATE INDEX idx_sync_jobs_status ON sync_jobs (status)",
      "CREATE INDEX idx_sync_jobs_created ON sync_jobs (created)",
      // Recent jobs for a source (detail page shows history)
      "CREATE INDEX idx_sync_jobs_source_created ON sync_jobs (source_id, created)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("sync_jobs");
  return app.delete(collection);
});
