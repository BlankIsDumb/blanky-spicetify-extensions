(function () {
    if (!(Spicetify?.ContextMenu && Spicetify?.URI && Spicetify?.CosmosAsync && Spicetify?.PopupModal && Spicetify?.React)) {
        setTimeout(arguments.callee, 300);
        return;
    }

    function ShowButton(uris) {
        try {
            const uri = Spicetify.URI.fromString(uris[0]);
            return uri.type === Spicetify.URI.Type.TRACK;
        } catch {
            return false;
        }
    }

    new Spicetify.ContextMenu.Item(
        "ShowTrackMetadata (spclient)",
        showTrackMetadata,
        ShowButton
    ).register();

    const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    function spotifyHex(base62Id) {
        let n = 0n;
        for (const c of base62Id) {
            const v = BASE62.indexOf(c);
            if (v === -1) throw new Error("Invalid base62 id");
            n = n * 62n + BigInt(v);
        }
        return n.toString(16).padStart(32, "0");
    }

    function getToken() {
        const t = Spicetify.Platform?.Session?.accessToken;
        if (!t) throw new Error("Missing Spicetify.Platform.Session.accessToken");
        return t;
    }

    function getISRCFromSpclientTrack(track) {
        const arr = track?.external_id;
        if (!Array.isArray(arr)) return null;

        for (const x of arr) {
            const type = String(x?.type ?? x?.id_type ?? x?.name ?? x?.external_id_type ?? "").toUpperCase();
            const value = x?.value ?? x?.id ?? x?.external_id ?? x?.externalId ?? null;

            if (type.includes("ISRC") && typeof value === "string" && value.length >= 12) {
                return value.toUpperCase();
            }
        }

        const re = /\b[A-Z]{2}[A-Z0-9]{3}\d{7}\b/;
        for (const x of arr) {
            for (const v of [x?.value, x?.id, x?.external_id]) {
                if (typeof v === "string") {
                    const m = v.toUpperCase().match(re);
                    if (m) return m[0];
                }
            }
        }

        return null;
    }

    // returns object, isrc and whole json
    async function getTrackMetadataAndISRC(trackUriString) {
        const trackUri = Spicetify.URI.fromString(trackUriString);
        const trackID = trackUri?.id;

        if (!trackID) {
            Spicetify.showNotification("Invalid track ID.");
            return null;
        }

        const hex = spotifyHex(trackID);
        const token = getToken();

        const url = `https://spclient.wg.spotify.com/metadata/4/track/${hex}?market=from_token`;

        const res = await fetch(url, {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
        });

        if (!res.ok) {
            Spicetify.showNotification(`spclient metadata failed (${res.status})`);
            return null;
        }

        const data = await res.json();
        const isrc = getISRCFromSpclientTrack(data);

        console.log("spclient response:", data);
        console.log("ISRC:", isrc);

        return { data, isrc };
    }

    // Context menu callback gets `uris` array, not a raw string
    async function showTrackMetadata(uris) {
        const uriString =
            Array.isArray(uris) ? uris[0] :
            (typeof uris === "string" ? uris :
            uris?.toString?.());

        if (!uriString) {
            Spicetify.showNotification("Invalid URI.");
            return;
        }

        let result;
        try {
            result = await getTrackMetadataAndISRC(uriString);
        } catch (e) {
            console.error(e);
            Spicetify.showNotification(`Failed: ${e?.message ?? e}`);
            return;
        }

        if (!result) return;

        const { data, isrc } = result;
        const jsonText = JSON.stringify(data, null, 2);

        Spicetify.PopupModal.display({
            title: isrc ?? "No ISRC found",
            content: Spicetify.React.createElement("textarea", {
                readOnly: true,
                value: jsonText,
                style: {
                    width: "100%",
                    height: "820px",
                    resize: "none",
                    whiteSpace: "pre",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    padding: "8px",
                    boxSizing: "border-box",
                },
                onFocus: (e) => e.target.select(),
            }),
            isLarge: true,
        });
    }
})();
