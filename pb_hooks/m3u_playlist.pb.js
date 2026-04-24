/**
 * M3U playlist generator — writes static files to pb_public.
 *
 * POST  /api/playlist/generate  → generate + return JSON with public URL
 * DELETE /api/playlist/generate  → remove file
 */
routerAdd("POST", "/api/playlist/generate", (e) => {
    try {
        const bodyStr = toString(e.request.body);
        const body = JSON.parse(bodyStr);
        var slug = (body.slug || "").trim();
        if (!slug) return e.json(400, { message: "slug required" });

        const playlist = $app.findFirstRecordByData("m3u_playlists", "slug", slug);
        if (!playlist) return e.json(404, { message: "playlist not found" });

        const sourceId = playlist.get("source_id");
        const source = $app.findFirstRecordByData("sources", "id", sourceId);
        if (!source) return e.json(404, { message: "source not found" });

        var baseUrl = (source.get("base_url") || "").replace(/\/+$/, "");
        var username = source.get("username");
        var password = source.get("password");

        var m3u = "#EXTM3U\n";

        // Live channels
        if (playlist.get("include_live")) {
            var cats = $app.findRecordsByFilter($app.findCollectionByNameOrId("categories"),
                'source_id = "' + sourceId + '" && type = "live"', "name", 0, 0);
            var catMap = {};
            for (var c = 0; c < cats.length; c++) {
                catMap[String(cats[c].get("id"))] = cats[c].get("name");
            }
            var chs = $app.findRecordsByFilter($app.findCollectionByNameOrId("channels"),
                'source_id = "' + sourceId + '" && available = true', "name", 0, 0);
            for (var i = 0; i < chs.length; i++) {
                var ch = chs[i];
                var name = ch.get("name") || "Unknown";
                var logo = ch.get("logo") || "";
                var tvgId = ch.get("tvg_id") || "";
                var tvgCountry = ch.get("tvg_country") || "";
                var streamId = ch.get("stream_id");
                var groupTitle = catMap[String(ch.get("category_id"))] || "";
                m3u += "#EXTINF:-1";
                if (tvgId) m3u += ' tvg-id="' + tvgId + '"';
                if (logo) m3u += ' tvg-logo="' + logo + '"';
                if (tvgCountry) m3u += ' tvg-country="' + tvgCountry + '"';
                if (groupTitle) m3u += ' group-title="' + groupTitle + '"';
                m3u += "," + name + "\n";
                m3u += baseUrl + "/live/" + encodeURIComponent(username) + "/" + encodeURIComponent(password) + "/" + streamId + ".m3u8\n";
            }
        }

        // VOD
        if (playlist.get("include_vod")) {
            var mvCats = $app.findRecordsByFilter($app.findCollectionByNameOrId("categories"),
                'source_id = "' + sourceId + '" && type = "vod"', "name", 0, 0);
            var mvCatMap = {};
            for (var vc = 0; vc < mvCats.length; vc++) {
                mvCatMap[String(mvCats[vc].get("id"))] = mvCats[vc].get("name");
            }
            var mvList = $app.findRecordsByFilter($app.findCollectionByNameOrId("movies"),
                'source_id = "' + sourceId + '" && available = true', "name", 0, 0);
            for (var vi = 0; vi < mvList.length; vi++) {
                var mv = mvList[vi];
                var mvName = mv.get("name") || "Unknown";
                var mvLogo = mv.get("poster") || "";
                var mvStreamId = mv.get("stream_id");
                var mvGroup = mvCatMap[String(mv.get("category_id"))] || "Movies";
                m3u += "#EXTINF:-1";
                if (mvLogo) m3u += ' tvg-logo="' + mvLogo + '"';
                m3u += ' group-title="' + mvGroup + '"';
                m3u += "," + mvName + "\n";
                m3u += baseUrl + "/movie/" + encodeURIComponent(username) + "/" + encodeURIComponent(password) + "/" + mvStreamId + ".mp4\n";
            }
        }

        // Write to pb_public
        var fs = require("fs");
        var pbDir = __dirname + "/../pb_public";
        if (!fs.existsSync(pbDir)) fs.mkdirSync(pbDir, { recursive: true });
        fs.writeFileSync(pbDir + "/" + slug + ".m3u", m3u, "utf8");

        return e.json(200, {
            message: "Playlist generated",
            url: "/" + slug + ".m3u",
        });
    } catch (err) {
        return e.json(500, { message: "m3u generation error: " + err });
    }
});

// Delete playlist file
routerAdd("DELETE", "/api/playlist/generate", (e) => {
    try {
        var bodyStr = toString(e.request.body);
        var body = JSON.parse(bodyStr);
        var slug = (body.slug || "").trim();
        if (!slug) return e.json(400, { message: "slug required" });
        var fs = require("fs");
        var filePath = __dirname + "/../pb_public/" + slug + ".m3u";
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return e.json(200, { message: "deleted" });
    } catch (err) {
        return e.json(500, { message: "delete error: " + err });
    }
});
