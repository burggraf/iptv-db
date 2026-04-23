migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");

  // Add movie_count field if it doesn't exist
  if (!collection.fields.find(f => f.name === "movie_count")) {
    collection.fields.add(new Field({
      type: "number",
      name: "movie_count",
      hidden: false,
      id: null,
      max: null,
      min: 0,
      noDecimal: true,
      onlyInt: true,
      required: false,
    }));
  }

  // Add series_count field if it doesn't exist
  if (!collection.fields.find(f => f.name === "series_count")) {
    collection.fields.add(new Field({
      type: "number",
      name: "series_count",
      hidden: false,
      id: null,
      max: null,
      min: 0,
      noDecimal: true,
      onlyInt: true,
      required: false,
    }));
  }

  // Add channel_count field if it doesn't exist
  if (!collection.fields.find(f => f.name === "channel_count")) {
    collection.fields.add(new Field({
      type: "number",
      name: "channel_count",
      hidden: false,
      id: null,
      max: null,
      min: 0,
      noDecimal: true,
      onlyInt: true,
      required: false,
    }));
  }

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1124997656");

  collection.fields.remove("movie_count");
  collection.fields.remove("series_count");
  collection.fields.remove("channel_count");

  return app.save(collection);
})
