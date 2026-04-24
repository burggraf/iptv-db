migrate((app) => {
  const collection = app.findCollectionByNameOrId("sync_jobs");
  collection.createRule = "@request.auth.id != ''";
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("sync_jobs");
  collection.createRule = null;
  return app.save(collection);
})
