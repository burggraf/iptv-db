/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Delete broken collection
  try {
    const old = app.findCollectionByNameOrId("m3u_playlists");
    app.delete(old);
  } catch (e) { /* already gone */ }

  // Create new collection
  const collection = new Collection({
    "name": "m3u_playlists",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''",
    "createRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != ''",
    "deleteRule": "@request.auth.id != ''",
  });

  // Add fields
  collection.fields.add(new Field({
    "type": "text", "name": "name", "required": true, "min": 0, "max": null,
    "pattern": "", "presentable": false, "hidden": false, "id": null
  }));
  collection.fields.add(new Field({
    "type": "text", "name": "slug", "required": true, "min": 0, "max": 64,
    "pattern": "^[a-z0-9][a-z0-9_-]*$", "presentable": false, "hidden": false, "id": null
  }));
  collection.fields.add(new Field({
    "type": "relation", "name": "source_id", "required": true,
    "collectionId": "pbc_1124997656", "cascadeDelete": true,
    "minSelect": null, "maxSelect": 1, "presentable": false, "hidden": false, "id": null
  }));
  collection.fields.add(new Field({
    "type": "bool", "name": "include_live", "required": false,
    "presentable": false, "hidden": false, "id": null
  }));
  collection.fields.add(new Field({
    "type": "bool", "name": "include_vod", "required": false,
    "presentable": false, "hidden": false, "id": null
  }));
  collection.fields.add(new Field({
    "type": "bool", "name": "include_series", "required": false,
    "presentable": false, "hidden": false, "id": null
  }));
  collection.fields.add(new Field({
    "type": "relation", "name": "created_by_user_id", "required": false,
    "collectionId": "_pb_users_auth_", "cascadeDelete": false,
    "minSelect": null, "maxSelect": 1, "presentable": false, "hidden": false, "id": null
  }));

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("m3u_playlists");
    return app.delete(collection);
  } catch (e) {}
})
