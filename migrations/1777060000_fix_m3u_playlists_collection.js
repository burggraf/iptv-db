/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("m3u_playlists");

  // Add missing fields (idempotent)
  const addField = (fieldDef) => {
    if (!collection.fields.find(f => f.name === fieldDef.name)) {
      collection.fields.add(new Field(fieldDef));
    }
  };

  addField({ type: "text", name: "slug", required: true, min: 0, max: 64, pattern: "^[a-z0-9][a-z0-9_-]*$", system: false, hidden: false, presentable: false });
  addField({ type: "bool", name: "include_live", system: false, hidden: false, presentable: false });
  addField({ type: "bool", name: "include_vod", system: false, hidden: false, presentable: false });
  addField({ type: "bool", name: "include_series", system: false, hidden: false, presentable: false });

  // Set rules if not set
  if (!collection.listRule) collection.listRule = "@request.auth.id != ''";
  if (!collection.viewRule) collection.viewRule = "@request.auth.id != ''";
  if (!collection.createRule) collection.createRule = "@request.auth.id != ''";
  if (!collection.updateRule) collection.updateRule = "@request.auth.id != ''";
  if (!collection.deleteRule) collection.deleteRule = "@request.auth.id != ''";

  return app.save(collection);
}, (app) => {
  // nothing to rollback — fields already existed
})
