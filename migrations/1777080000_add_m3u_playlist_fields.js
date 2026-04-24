/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("m3u_playlists");

  // Add name field
  if (!collection.fields.find(f => f.name === "name")) {
    collection.fields.add(new Field({
      "type": "text", "name": "name", "required": true,
      "min": null, "max": null, "pattern": "",
      "presentable": false, "hidden": false, "id": null
    }));
  }

  // Add source_id relation
  if (!collection.fields.find(f => f.name === "source_id")) {
    collection.fields.add(new Field({
      "type": "relation", "name": "source_id", "required": true,
      "collectionId": "pbc_1124997656", "cascadeDelete": true,
      "minSelect": null, "maxSelect": 1,
      "presentable": false, "hidden": false, "id": null
    }));
  }

  // Add created_by_user_id relation
  if (!collection.fields.find(f => f.name === "created_by_user_id")) {
    collection.fields.add(new Field({
      "type": "relation", "name": "created_by_user_id", "required": false,
      "collectionId": "_pb_users_auth_", "cascadeDelete": false,
      "minSelect": null, "maxSelect": 1,
      "presentable": false, "hidden": false, "id": null
    }));
  }

  // Set auth rules if empty
  if (!collection.listRule) collection.listRule = "@request.auth.id != ''";
  if (!collection.viewRule) collection.viewRule = "@request.auth.id != ''";
  if (!collection.createRule) collection.createRule = "@request.auth.id != ''";
  if (!collection.updateRule) collection.updateRule = "@request.auth.id != ''";
  if (!collection.deleteRule) collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {})
