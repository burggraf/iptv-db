/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3009067695");
  collection.updateRule = "@request.auth.id != ''";
  collection.deleteRule = "@request.auth.id != ''";
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3009067695");
  collection.updateRule = null;
  collection.deleteRule = null;
  return app.save(collection);
})
