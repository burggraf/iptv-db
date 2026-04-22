/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    name: "categories",
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
        name: "type",
        type: "select",
        required: true,
        options: {
          maxSelect: 1,
          values: ["live", "vod", "series"],
        },
      },
      {
        name: "category_id",
        type: "number",
        required: true,
      },
      {
        name: "name",
        type: "text",
        required: true,
      },
    ],
    indexes: [
      "CREATE INDEX idx_categories_source ON categories (source_id)",
      "CREATE INDEX idx_categories_type ON categories (type)",
      "CREATE UNIQUE INDEX idx_categories_source_type_catid ON categories (source_id, type, category_id)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("categories");
  return app.delete(collection);
});
