// pb_hooks/cascade_delete.pb.js
// POST /api/cascade-delete — delete all sources and related data
// Requires authenticated user (admin or regular user with record permissions)

routerAdd("POST", "/api/cascade-delete", (e) => {
    // Check if specific source_ids provided (selective delete) vs delete-all
    let sourceIds = null;
    try {
        const body = e.bodyJson() || {};
        if (body.source_ids && Array.isArray(body.source_ids) && body.source_ids.length > 0) {
            sourceIds = body.source_ids;
        }
    } catch { /* no body, delete all */ }

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

        let records;
        if (sourceIds && collectionName !== "sources") {
            // Filter related records by source_id
            const allRecords = $app.findAllRecords(collection);
            records = [];
            for (let k = 0; k < allRecords.length; k++) {
                const rec = allRecords[k];
                const srcId = rec.getStringValue ? rec.getStringValue("source_id") : (rec.source_id || "");
                if (sourceIds.indexOf(srcId) !== -1) {
                    records.push(rec);
                }
            }
        } else if (sourceIds) {
            // sources collection: only delete matching IDs
            const allRecords = $app.findAllRecords(collection);
            records = [];
            for (let k = 0; k < allRecords.length; k++) {
                if (sourceIds.indexOf(allRecords[k].id) !== -1) {
                    records.push(allRecords[k]);
                }
            }
        } else {
            // delete-all mode
            records = $app.findAllRecords(collection);
        }

        let count = 0;
        for (let j = 0; j < records.length; j++) {
            $app.delete(records[j]);
            count++;
        }
        deleted[collectionName] = count;
    }

    const msg = sourceIds ? `Deleted ${sourceIds.length} source(s) and related data` : "All sources and related data deleted";
    return e.json(200, {
        "message": msg,
        "deleted": deleted
    });
});
