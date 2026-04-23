migrate((app) => {
  // Add 'cancelled' to sync_jobs status field
  const sjCollection = app.findCollectionByNameOrId("sync_jobs");
  if (sjCollection) {
    const statusField = sjCollection.fields.find(f => f.name === "status");
    if (statusField && !statusField.values.includes("cancelled")) {
      statusField.values.push("cancelled");
    }
    app.save(sjCollection);
  }
}, (app) => {
  const sjCollection = app.findCollectionByNameOrId("sync_jobs");
  if (sjCollection) {
    const statusField = sjCollection.fields.find(f => f.name === "status");
    if (statusField) {
      statusField.values = statusField.values.filter(v => v !== "cancelled");
    }
    app.save(sjCollection);
  }
})
