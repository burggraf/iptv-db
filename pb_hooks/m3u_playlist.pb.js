routerAdd("POST", "/api/playlist/generate", (e) => {
    try {
        var bodyStr = toString(e.request.body);
        var body = JSON.parse(bodyStr);
        var slug = (body.slug || "").trim();
        if (!slug) return e.json(400, { message: "slug required" });

        // Call worker to generate M3U file in pb_public
        var res = $http.send({
            url: "http://127.0.0.1:3100/api/m3u/generate",
            method: "POST",
            body: bodyStr,
            headers: { "Content-Type": "application/json" },
            timeout: 120,
        });
        if (res.statusCode !== 200) {
            return e.json(500, { message: "Worker error: " + res.statusCode });
        }
        var workerRes = JSON.parse(res.body);
        return e.json(200, { message: "ok", url: workerRes.url || "/" + slug + ".m3u" });
    } catch (err) {
        return e.json(500, { message: "error: " + err });
    }
});

routerAdd("POST", "/api/playlist/delete", (e) => {
    try {
        var bodyStr = toString(e.request.body);
        var body = JSON.parse(bodyStr);
        var slug = (body.slug || "").trim();
        if (!slug) return e.json(400, { message: "slug required" });

        $http.send({
            url: "http://127.0.0.1:3100/api/m3u/delete",
            method: "POST",
            body: bodyStr,
            headers: { "Content-Type": "application/json" },
            timeout: 10,
        });
        return e.json(200, { message: "deleted" });
    } catch (err) {
        return e.json(500, { message: "error: " + err });
    }
});
