/**
 * Dynamic M3U playlist generator.
 * GET /api/playlist/:slug (also supports /api/playlist/:slug.m3u)
 *
 * Reads playlist config from DB, fetches live channels + categories,
 * builds proper #EXTINF M3U with Xtream stream URLs.
 */
routerAdd("GET", "/api/playlist/:slug", (e) => {
    try {
        var slug = e.request.pathValue("slug") || "";
        // Allow .m3u suffix for convenience (e.g., /api/m3u/bob.m3u)
        if (slug.endsWith(".m3u")) slug = slug.slice(0, -4);
        if (!slug) {
            return e.json(400, { message: "slug required" });
        }

        const playlists = $app.findCollectionByNameOrId("m3u_playlists");
        const results = $app.findRecordsByFilter(playlists, "slug = '" + slug + "'", "", 1, 0);
        if (results.length === 0) {
            return e.json(404, { message: "playlist not found" });
        }

        const playlist = results[0];
        const sourceId = playlist.get("source_id");
        const includeLive = playlist.get("include_live");

        if (!includeLive) {
            return e.json(400, { message: "no content types enabled" });
        }

        // Fetch source for base_url, username, password
        const sources = $app.findCollectionByNameOrId("sources");
        const srcRecords = $app.findRecordsByFilter(sources, "id = '" + sourceId + "'", "", 1, 0);
        if (srcRecords.length === 0) {
            return e.json(404, { message: "source not found" });
        }
        const source = srcRecords[0];
        var baseUrl = source.get("base_url");
        baseUrl = baseUrl.replace(/\/+$/, "");
        var username = source.get("username");
        var password = source.get("password");

        // Build M3U header
        var m3u = '#EXTM3U url-tvg="' + baseUrl + '/xmltv.php?username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password) + '"\n';

        if (includeLive) {
            // Fetch live categories
            var categories = $app.findCollectionByNameOrId("categories");
            var cats = $app.findRecordsByFilter(categories, 'source_id = "' + sourceId + '" && type = "live"', "name", 0, 0);

            var catMap = {};
            for (var c = 0; c < cats.length; c++) {
                catMap[String(cats[c].get("id"))] = cats[c].get("name");
            }

            // Fetch live channels
            var channels = $app.findCollectionByNameOrId("channels");
            var chs = $app.findRecordsByFilter(channels, 'source_id = "' + sourceId + '" && available = true', "name", 0, 0);

            for (var i = 0; i < chs.length; i++) {
                var ch = chs[i];
                var name = ch.get("name") || "Unknown";
                var logo = ch.get("logo") || "";
                var tvgId = ch.get("tvg_id") || "";
                var tvgCountry = ch.get("tvg_country") || "";
                var streamId = ch.get("stream_id");
                var catId = String(ch.get("category_id"));
                var groupTitle = catMap[catId] || "";

                m3u += '#EXTINF:-1';
                if (tvgId) m3u += ' tvg-id="' + tvgId + '"';
                if (logo) m3u += ' tvg-logo="' + logo + '"';
                if (tvgCountry) m3u += ' tvg-country="' + tvgCountry + '"';
                if (groupTitle) m3u += ' group-title="' + groupTitle + '"';
                m3u += ',' + name + '\n';
                m3u += baseUrl + '/live/' + encodeURIComponent(username) + '/' + encodeURIComponent(password) + '/' + streamId + '.m3u8\n';
            }
        }

        return e.blob(200, "audio/x-mpegurl", m3u);
    } catch (err) {
        return e.json(500, { message: "m3u generation error: " + err });
    }
});
