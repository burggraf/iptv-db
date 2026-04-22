/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "series",
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
        name: "series_id",
        type: "number",
        required: true,
      },
      {
        name: "name",
        type: "text",
        required: true,
      },
      {
        name: "plot",
        type: "text",
        required: false,
      },
      {
        name: "year",
        type: "text",
        required: false,
      },
      {
        name: "genre",
        type: "text",
        required: false,
      },
      {
        name: "rating",
        type: "number",
        required: false,
      },
      {
        name: "poster",
        type: "text",
        required: false,
      },
      {
        name: "backdrop",
        type: "text",
        required: false,
      },
      {
        name: "cast",
        type: "text",
        required: false,
      },
      {
        name: "director",
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
      // Prevent duplicate series within a source
      "CREATE UNIQUE INDEX idx_series_seriesid_source ON series (series_id, source_id)",
      // Primary browse query
      "CREATE INDEX idx_series_browse ON series (source_id, category_id, available)",
      // Filter by source only
      "CREATE INDEX idx_series_source ON series (source_id)",
      // Filter by category only
      "CREATE INDEX idx_series_category ON series (category_id)",
      // Soft delete filter
      "CREATE INDEX idx_series_available ON series (available)",
      // Search by name
      "CREATE INDEX idx_series_name ON series (name)",
      // Year filter
      "CREATE INDEX idx_series_year ON series (year)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("series");
  return app.delete(collection);
});
