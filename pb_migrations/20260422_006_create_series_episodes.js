/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "series_episodes",
    type: "base",
    schema: [
      {
        name: "series_id",
        type: "relation",
        required: true,
        options: {
          collectionIdOrName: "series",
          cascadeDelete: true,
          minSelect: null,
          maxSelect: 1,
        },
      },
      {
        name: "season",
        type: "number",
        required: true,
      },
      {
        name: "episode_num",
        type: "number",
        required: true,
      },
      {
        name: "title",
        type: "text",
        required: false,
      },
      {
        name: "plot",
        type: "text",
        required: false,
      },
      {
        name: "duration_secs",
        type: "number",
        required: false,
      },
      {
        name: "poster",
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
      // Episodes for a series, ordered by season + episode
      "CREATE INDEX idx_episodes_series ON series_episodes (series_id)",
      // Unique episode within a series (same season+episode can't be duplicated)
      "CREATE UNIQUE INDEX idx_episodes_unique ON series_episodes (series_id, season, episode_num)",
      // Season grouping within a series
      "CREATE INDEX idx_episodes_season ON series_episodes (series_id, season)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("series_episodes");
  return app.delete(collection);
});
