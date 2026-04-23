routerAdd("POST", "/api/cascade-delete", (e) => {
    let sourceIds = null;
    try {
        const body = e.bodyJson() || {};
        if (body.source_ids && Array.isArray(body.source_ids) && body.source_ids.length > 0) {
            sourceIds = body.source_ids;
        }
    } catch { /* no body, delete all */ }

    const collection = $app.findCollectionByNameOrId("sources");
    if (!collection) {
        return e.json(500, { "message": "sources collection not found" });
    }

    if (sourceIds) {
        for (let i = 0; i < sourceIds.length; i++) {
            const record = $app.findRecordById("sources", sourceIds[i]);
            if (record) {
                $app.delete(record);
            }
        }
        return e.json(200, {
            "message": "Deleted " + sourceIds.length + " source(s) and related data",
            "deleted": { "sources": sourceIds.length }
        });
    } else {
        const allSources = $app.findAllRecords(collection);
        for (let i = 0; i < allSources.length; i++) {
            $app.delete(allSources[i]);
        }
        return e.json(200, {
            "message": "All sources and related data deleted",
            "deleted": { "sources": allSources.length }
        });
    }
});
