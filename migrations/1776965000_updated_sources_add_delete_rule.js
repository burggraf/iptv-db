/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");
  collection.deleteRule = "@request.auth.id != ''";
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");
  collection.deleteRule = "";
  return app.save(collection);
})
