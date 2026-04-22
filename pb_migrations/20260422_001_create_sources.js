/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    id: "sources",
    name: "sources",
    type: "base",
    system: false,
    schema: [
      {
        id: "s_type",
        name: "type",
        type: "select",
        system: false,
        required: true,
        values: ["xtream", "m3u"],
      },
      {
        id: "s_name",
        name: "name",
        type: "text",
        system: false,
        required: true,
        min: 1,
        max: 500,
      },
      {
        id: "s_base_url",
        name: "base_url",
        type: "text",
        system: false,
        required: false,
      },
      {
        id: "s_username",
        name: "username",
        type: "text",
        system: false,
        required: false,
      },
      {
        id: "s_password",
        name: "password",
        type: "text",
        system: false,
        required: false,
      },
      {
        id: "s_m3u_url",
        name: "m3u_url",
        type: "text",
        system: false,
        required: false,
      },
      {
        id: "s_max_connections",
        name: "max_connections",
        type: "number",
        system: false,
        required: false,
      },
      {
        id: "s_expiry_date",
        name: "expiry_date",
        type: "date",
        system: false,
        required: false,
      },
      {
        id: "s_status",
        name: "status",
        type: "select",
        system: false,
        required: true,
        values: ["active", "expired", "error"],
      },
      {
        id: "s_last_sync",
        name: "last_sync",
        type: "date",
        system: false,
        required: false,
      },
      {
        id: "s_sync_status",
        name: "sync_status",
        type: "text",
        system: false,
        required: false,
      },
      {
        id: "s_source_url",
        name: "source_url",
        type: "text",
        system: false,
        required: false,
      },
      {
        id: "s_scraped_at",
        name: "scraped_at",
        type: "date",
        system: false,
        required: false,
      },
    ],
    indexes: [
      "CREATE INDEX idx_sources_type ON sources (type)",
      "CREATE INDEX idx_sources_status ON sources (status)",
      "CREATE INDEX idx_sources_scraped_at ON sources (scraped_at)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("sources");
  return app.delete(collection);
});
