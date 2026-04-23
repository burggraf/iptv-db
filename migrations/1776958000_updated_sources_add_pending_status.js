/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");

  const statusField = collection.fields.find(f => f.name === "status");
  if (statusField) {
    statusField.values = ["active", "expired", "error", "pending"];
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");

  const statusField = collection.fields.find(f => f.name === "status");
  if (statusField) {
    statusField.values = ["active", "expired", "error"];
  }

  return app.save(collection);
})
