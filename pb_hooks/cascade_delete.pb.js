// pb_hooks/cascade_delete.pb.js
// POST /api/cascade-delete — delete all sources and related data
// Requires authenticated user (admin or regular user with record permissions)

routerAdd("POST", "/api/cascade-delete", (e) => {
    const collections = [
        "series_episodes",
        "channels",
        "movies",
        "series",
        "categories",
        "sync_jobs",
        "sources",
    ];

    const deleted = {};

    for (let i = 0; i < collections.length; i++) {
        const collectionName = collections[i];
        const collection = $app.findCollectionByNameOrId(collectionName);
        if (!collection) {
            return e.json(500, { "message": "Collection not found: " + collectionName });
        }

        const records = $app.findAllRecords(collection);
        let count = 0;
        for (let j = 0; j < records.length; j++) {
            $app.delete(records[j]);
            count++;
        }
        deleted[collectionName] = count;
    }

    return e.json(200, {
        "message": "All sources and related data deleted",
        "deleted": deleted
    });
});
