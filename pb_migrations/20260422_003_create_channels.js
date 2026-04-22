/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "channels",
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
        name: "category_id",
        type: "relation",
        required: true,
        options: {
          collectionIdOrName: "categories",
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
        },
      },
      {
        name: "stream_id",
        type: "number",
        required: true,
      },
      {
        name: "name",
        type: "text",
        required: true,
      },
      {
        name: "logo",
        type: "text",
        required: false,
      },
      {
        name: "epg_id",
        type: "text",
        required: false,
      },
      {
        name: "tvg_id",
        type: "text",
        required: false,
      },
      {
        name: "tvg_country",
        type: "text",
        required: false,
      },
      {
        name: "added",
        type: "text",
        required: false,
      },
      {
        name: "available",
        type: "bool",
        required: true,
      },
    ],
    indexes: [
      // Prevent duplicate channel within a source
      "CREATE UNIQUE INDEX idx_channels_stream_source ON channels (stream_id, source_id)",
      // Primary browse query: channels by source + category, active only
      "CREATE INDEX idx_channels_browse ON channels (source_id, category_id, available)",
      // Filter by source only (source detail page)
      "CREATE INDEX idx_channels_source ON channels (source_id)",
      // Filter by category only (global category browse)
      "CREATE INDEX idx_channels_category ON channels (category_id)",
      // Soft delete filter (find unavailable items)
      "CREATE INDEX idx_channels_available ON channels (available)",
      // Search by name (LIKE queries)
      "CREATE INDEX idx_channels_name ON channels (name)",
      // Country filter
      "CREATE INDEX idx_channels_country ON channels (tvg_country)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("channels");
  return app.delete(collection);
});
