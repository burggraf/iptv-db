/// <reference path="../pb_data/types.d.ts" />
/**
 * Bulk channel operations endpoint.
 * Replaces N individual HTTP calls with one server-side operation.
 *
 * POST /api/batch-channels
 * Body: { source_id: "...", channels: [{ stream_id, category_id, name, logo, epg_id, tvg_id, tvg_country, added }, ...] }
 */
routerAdd("POST", "/api/batch-channels", (e) => {
    try {
        const bodyStr = toString(e.request.body);
        const body = JSON.parse(bodyStr);
        const sourceId = body.source_id;
        const incoming = body.channels;

        if (!sourceId || !Array.isArray(incoming) || incoming.length === 0) {
            return e.json(400, { message: "source_id and channels[] required" });
        }

        // Build lookup of incoming stream_ids
        const incomingMap = {};
        for (let i = 0; i < incoming.length; i++) {
            incomingMap[String(incoming[i].stream_id)] = incoming[i];
        }

        // Fetch existing channels for this source
        const collection = $app.findCollectionByNameOrId("channels");
        const existing = $app.findRecordsByFilter(
            collection,
            "source_id = '" + sourceId + "'",
            "",
            0, 0
        );

        const existingByStream = {};
        for (let i = 0; i < existing.length; i++) {
            existingByStream[String(existing[i].get("stream_id"))] = existing[i];
        }

        let created = 0;
        let updated = 0;

        // Update existing or create new
        for (let i = 0; i < incoming.length; i++) {
            const ch = incoming[i];
            const streamKey = String(ch.stream_id);
            const record = existingByStream[streamKey];

            if (record) {
                record.set("category_id", ch.category_id);
                record.set("name", ch.name || "Unknown");
                record.set("logo", ch.logo || "");
                record.set("epg_id", ch.epg_id || "");
                record.set("tvg_id", ch.tvg_id || "");
                record.set("tvg_country", ch.tvg_country || "");
                record.set("added", ch.added || "");
                record.set("available", true);
                $app.save(record);
                updated++;
            } else {
                const record = new Record(collection, {
                    source_id: sourceId,
                    category_id: ch.category_id,
                    stream_id: ch.stream_id,
                    name: ch.name || "Unknown",
                    logo: ch.logo || "",
                    epg_id: ch.epg_id || "",
                    tvg_id: ch.tvg_id || "",
                    tvg_country: ch.tvg_country || "",
                    added: ch.added || "",
                    available: true,
                });
                $app.save(record);
                created++;
            }
        }

        // Delete channels no longer in source
        let deleted = 0;
        for (let i = 0; i < existing.length; i++) {
            const rec = existing[i];
            const streamKey = String(rec.get("stream_id"));
            if (!incomingMap[streamKey]) {
                $app.delete(rec);
                deleted++;
            }
        }

        return e.json(200, {
            created: created,
            updated: updated,
            deleted: deleted,
            total: created + updated
        });
    } catch (err) {
        return e.json(500, { message: "batch_channels error: " + err });
    }
});
