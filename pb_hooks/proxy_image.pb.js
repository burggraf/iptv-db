/**
 * Proxy external images over HTTPS to avoid mixed-content blocking.
 * GET /api/proxy-image?url=<encoded-url>
 */
routerAdd("GET", "/api/proxy-image", (e) => {
    try {
        const url = e.request.formValue("url");
        if (!url) {
            return e.json(400, { message: "url parameter required" });
        }

        // Only allow http/https URLs
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            return e.json(400, { message: "invalid url scheme" });
        }

        const res = $http.send({
            url: url,
            method: "GET",
            headers: { "User-Agent": "iptv-db-proxy/1.0" },
            timeout: 10,
        });

        if (res.statusCode !== 200) {
            return e.json(res.statusCode, { message: "upstream error", status: res.statusCode });
        }

        // Headers are arrays: res.headers["Content-Type"][0]
        const ct = res.headers["Content-Type"] || res.headers["content-type"] || [];
        const contentType = ct[0] || "image/png";

        // res.body is number[] (bytes)
        return e.blob(200, contentType, res.body);
    } catch (err) {
        return e.json(502, { message: "proxy error: " + err });
    }
});
