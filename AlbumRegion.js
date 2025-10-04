// Copy Album URI + Availability — robust & album-only (open hash with ID)
(function () {
    if (!Spicetify?.ContextMenu || !Spicetify?.URI || !Spicetify?.CosmosAsync) {
        setTimeout(arguments.callee, 300);
        return;
    }
    const { URI } = Spicetify;
    const Type = URI?.Type ?? {};
    const AVAIL_URL = "https://kaaes.github.io/albums-availability/";

    function firstRaw(uris) {
        if (!Array.isArray(uris) || uris.length < 1) return "";
        return typeof uris[0] === "string" ? uris[0] : "";
    }

    function isAlbumString(raw) {
        if (typeof raw !== "string") return false;
        if (raw.startsWith("spotify:album:")) return true;
        if (raw.startsWith("spotify:collection:album:")) return true; // Library saved album
        if (raw.startsWith("http")) {
            try {
                const u = new URL(raw);
                const parts = u.pathname.split("/").filter(Boolean);
                return parts[0] === "album";
            } catch {}
        }
        return false;
    }

    function isAlbumType(uobj) {
        return (
            uobj?.type === Type.ALBUM ||
            uobj?.type === Type.COLLECTION_ALBUM ||
            uobj?.type === Type.ALBUM_V2
        );
    }

    // MUST NOT THROW
    function showOnlyOnAlbum(uris) {
        try {
            if (!Array.isArray(uris) || uris.length !== 1) return false;
            const raw = firstRaw(uris);
            if (!raw) return false;
            if (isAlbumString(raw)) return true;
            try {
                const parsed = URI.fromString(raw);
                return isAlbumType(parsed);
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }

    function getAlbumId(raw) {
        // Try parser first
        try {
            const u = URI.fromString(raw);
            const id = u?.id ?? (typeof u?.getBase62Id === "function" ? u.getBase62Id() : "");
            if (id) return id;
        } catch {}
        // spotify:(collection:)album:<id>
        let m = /^spotify:(?:collection:)?album:([A-Za-z0-9]+)/.exec(raw);
        if (m) return m[1];
        // https://open.spotify.com/album/<id>
        if (raw.startsWith("http")) {
            try {
                const u = new URL(raw);
                const parts = u.pathname.split("/").filter(Boolean);
                if (parts[0] === "album" && parts[1]) return parts[1];
            } catch {}
        }
        return "";
    }

    async function onClick(uris) {
        try {
            const raw = firstRaw(uris);
            const id = getAlbumId(raw);
            if (!id) {
                Spicetify.showNotification?.("Could not parse album ID", true);
                return;
            }
            // Open Availability Map with album ID in the hash
            window.open(`${AVAIL_URL}#${id}`, "_blank", "noopener");
        } catch (e) {
            console.error("[Album helper] click error:", e);
            Spicetify.showNotification?.("Something went wrong", true);
        }
    }

    new Spicetify.ContextMenu.Item(
        "Search Album Region",
        onClick,
        showOnlyOnAlbum
    ).register();

})();
