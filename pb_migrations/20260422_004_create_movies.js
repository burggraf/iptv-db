/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "movies",
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
        name: "director",
        type: "text",
        required: false,
      },
      {
        name: "cast",
        type: "text",
        required: false,
      },
      {
        name: "duration_secs",
        type: "number",
        required: false,
      },
      {
        name: "release_date",
        type: "text",
        required: false,
      },
      {
        name: "youtube_trailer",
        type: "text",
        required: false,
      },
      {
        name: "episode_run_time",
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
      // Prevent duplicate movie within a source
      "CREATE UNIQUE INDEX idx_movies_stream_source ON movies (stream_id, source_id)",
      // Primary browse query
      "CREATE INDEX idx_movies_browse ON movies (source_id, category_id, available)",
      // Filter by source only
      "CREATE INDEX idx_movies_source ON movies (source_id)",
      // Filter by category only
      "CREATE INDEX idx_movies_category ON movies (category_id)",
      // Soft delete filter
      "CREATE INDEX idx_movies_available ON movies (available)",
      // Search by name
      "CREATE INDEX idx_movies_name ON movies (name)",
      // Year filter
      "CREATE INDEX idx_movies_year ON movies (year)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("movies");
  return app.delete(collection);
});
