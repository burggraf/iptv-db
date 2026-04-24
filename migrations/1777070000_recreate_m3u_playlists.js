/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Delete broken collection
  try {
    const old = app.findCollectionByNameOrId("m3u_playlists");
    app.delete(old);
  } catch (e) { /* already gone */ }

  // Recreate with correct schema
  const collection = new Collection({
    "createRule": "@request.auth.id != ''",
    "deleteRule": "@request.auth.id != ''",
    "fields": [
      {"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
      {"autogeneratePattern":"","hidden":false,"id":"text1000000001","max":0,"min":0,"name":"name","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
      {"autogeneratePattern":"","hidden":false,"id":"text1000000002","max":64,"min":0,"name":"slug","pattern":"^[a-z0-9][a-z0-9_-]*$","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
      {"cascadeDelete":true,"collectionId":"pbc_1124997656","hidden":false,"id":"relation1000000003","maxSelect":1,"minSelect":0,"name":"source_id","presentable":false,"required":true,"system":false,"type":"relation"},
      {"hidden":false,"id":"bool1000000004","name":"include_live","presentable":false,"required":false,"system":false,"type":"bool"},
      {"hidden":false,"id":"bool1000000005","name":"include_vod","presentable":false,"required":false,"system":false,"type":"bool"},
      {"hidden":false,"id":"bool1000000006","name":"include_series","presentable":false,"required":false,"system":false,"type":"bool"},
      {"cascadeDelete":false,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation1000000007","maxSelect":1,"minSelect":0,"name":"created_by_user_id","presentable":false,"required":false,"system":false,"type":"relation"},
      {"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
      {"hidden":false,"id":"autodate3332181310","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
    ],
    "indexes": ["CREATE UNIQUE INDEX `idx_m3u_pl_slug` ON `m3u_playlists` (`slug`)"],
    "listRule": "@request.auth.id != ''",
    "updateRule": "@request.auth.id != ''",
    "viewRule": "@request.auth.id != ''"
  });

  return app.save(collection);
}, (app) => {
  try {
    const collection = app.findCollectionByNameOrId("m3u_playlists");
    return app.delete(collection);
  } catch (e) {}
})
