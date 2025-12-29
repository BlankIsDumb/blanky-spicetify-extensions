(function () {
    if (!Spicetify?.ContextMenu || !Spicetify?.URI || !Spicetify?.CosmosAsync) {
        setTimeout(arguments.callee, 300);
        return;
    }

    const __trackCache = new Map();
    const __b62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    function spotifyHex(spotifyId) {
        const INVALID = "00000000000000000000000000000000";
        if (typeof spotifyId !== "string") return INVALID;
        if (spotifyId.length === 0 || spotifyId.length > 22) return INVALID;

        let n = 0n;
        for (let i = 0; i < spotifyId.length; i++) {
            const idx = __b62.indexOf(spotifyId[i]);
            if (idx === -1) return INVALID;
            n = n * 62n + BigInt(idx);
        }

        const hex = n.toString(16).padStart(32, "0");
        if (hex.length > 32) return INVALID;
        return hex;
    }

    async function __cosmosFetchJson(url, token) { // UNUSED
        // spiceitfy key only has resolver + requestFactory.
        // resolver often works with an options object; we probe a couple signatures.
        const ca = Spicetify.CosmosAsync;

        const opts = {
            method: "GET",
            uri: url,
            headers: {
                "accept": "application/json",
                "authorization": `Bearer ${token}`,
            },
        };

        if (typeof ca?.resolver === "function") {
            try { return (await ca.resolver(opts))?.body ?? (await ca.resolver(opts)); } catch (_) { }
            try { return (await ca.resolver(url, opts))?.body ?? (await ca.resolver(url, opts)); } catch (_) { }
        }

        if (typeof ca?.requestFactory === "function") {
            // requestFactory signature varies; attempt the common one
            const req = ca.requestFactory();
            const resp = await req(opts);
            return resp?.body ?? resp;
        }

        throw new Error("No usable Cosmos requester found");
    }

    async function getTrackInfo(uri) {
        const parsed = Spicetify.URI.fromString(uri);
        if (!parsed || parsed.type !== Spicetify.URI.Type.TRACK) {
            throw new Error(`getTrackInfo: not a track URI: ${uri}`);
        }

        const id62 = parsed.id;
        if (__trackCache.has(id62)) return __trackCache.get(id62);

        const hex = spotifyHex(id62);
        if (hex === "00000000000000000000000000000000") {
            throw new Error("Invalid Spotify ID (base62->hex failed)");
        }

        const token = Spicetify.Platform?.Session?.accessToken;
        if (!token) throw new Error("Missing Spicetify.Platform.Session.accessToken");

        const url = `https://spclient.wg.spotify.com/metadata/4/track/${hex}?market=from_token`;

        // Try normal fetch first
        let data = null;
        try {
            const res = await fetch(url, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${token}`,
                },
            });
            if (res.ok) data = await res.json();
        } catch (_) { }

        // Fallback to Cosmos if fetch failed (though it should never fail really)
        if (!data) {
            data = await __cosmosFetchJson(url, token);
        }

        const out = {
            title: data?.name ?? "",
            artist: data?.artist?.[0]?.name ?? data?.artists?.[0]?.name ?? "",
        };

        if (!out.title) {
            console.log("[spclient raw]", data);
            throw new Error("spclient metadata returned no title");
        }

        __trackCache.set(id62, out);
        return out;
    }


    // Generic formatter for URLs
    function formatSearchURL(base, track, artist) {
        // Remove `,` keep kanji/kana/Thai/etc.
        track = track.replace(/[:]/g, "");
        artist = artist.replace(/[:]/g, "");

        const rawQuery = `${track} ${artist}`;
        const encodedQuery = encodeURIComponent(rawQuery).replace(/%20/g, '+');

        return `${base}${encodedQuery}`;
    }

    async function openInMuxMismatch(uris) {
        const info = await getTrackInfo(uris[0]);
        const url = formatSearchURL("https://www.musixmatch.com/search?query=", info.title, info.artist);
        window.open(url, '_blank');
    }

    async function openInGenius(uris) {
        const info = await getTrackInfo(uris[0]);
        const url = formatSearchURL("https://genius.com/search?q=", info.title, info.artist);
        window.open(url, '_blank');
    }

    async function openInYT(uris) {
        const info = await getTrackInfo(uris[0]);
        const url = formatSearchURL("https://www.youtube.com/results?search_query=", info.title, info.artist);
        window.open(url, '_blank');
    }

    function ShowButton(uris) {
        const uri = Spicetify.URI.fromString(uris[0]);
        return uri.type === Spicetify.URI.Type.TRACK;
    }

    new Spicetify.ContextMenu.Item("Open in MuxMismatch", openInMuxMismatch, ShowButton).register();
    new Spicetify.ContextMenu.Item("Open in Genius", openInGenius, ShowButton).register();
    new Spicetify.ContextMenu.Item("Open in Youtube", openInYT, ShowButton).register();
})();

