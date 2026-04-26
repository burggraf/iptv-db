migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");

  
  if (!collection.fields.find(f => f.name === "channels_loaded")) {
    collection.fields.add(new Field({
      type: "bool",
      name: "channels_loaded",
      hidden: false,
      id: null,
      required: false,
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");

  collection.fields.remove("channels_loaded");

  return app.save(collection);
})
