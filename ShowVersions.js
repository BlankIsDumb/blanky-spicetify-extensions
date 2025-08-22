(function () {
    if (!(Spicetify?.ContextMenu && Spicetify?.URI && Spicetify?.CosmosAsync)) {
        setTimeout(arguments.callee, 300);
        return;
    }

    function ShowButton(uris) {
        const uri = Spicetify.URI.fromString(uris[0]);
        return uri.type === Spicetify.URI.Type.TRACK;
    }

    new Spicetify.ContextMenu.Item(
        "Show Alternate Versions (ISRC)",
        showAlternateVersions,
        ShowButton
    ).register();

        // Get ISRC from track metadata
    async function getISRC(trackUriString) {
        const trackUri = Spicetify.URI.fromString(trackUriString);
        const trackID = trackUri.id;

        if (!trackID) {
            Spicetify.showNotification("Invalid track ID.");
            return null;
        }

        const endpoint = `https://api.spotify.com/v1/tracks/${trackID}`;
        const data = await Spicetify.CosmosAsync.get(endpoint);

        if (!data?.external_ids?.isrc) {
            Spicetify.showNotification("No ISRC found for this track.");
            return null;
        }

        return data.external_ids.isrc;
    }

    // Search all Spotify tracks that share the same ISRC
    async function searchTracksByISRC(isrc) {
        const query = encodeURIComponent(`isrc:${isrc}`);
        const endpoint = `https://api.spotify.com/v1/search?q=${query}&type=track&limit=50`;
        const data = await Spicetify.CosmosAsync.get(endpoint);

        return data?.tracks?.items || [];
    }



    // Show alternate versions in console
    async function showAlternateVersions(rawUriString) {
    const uriString = typeof rawUriString === "string" ? rawUriString : rawUriString?.toString?.();
    if (!uriString) {
        Spicetify.showNotification("Invalid URI.");
        return;
    }

    const isrc = await getISRC(uriString);
    if (!isrc) return;

    const altVersions = await searchTracksByISRC(isrc);
    if (!altVersions.length) {
        Spicetify.showNotification("No alternate versions found.");
        return;
    }
            const entries = altVersions.map((track) => {
            const name = track.name;
            const artist = track.artists.map((a) => a.name).join(", ");
            const uri = track.uri;
            const regionCount = track.available_markets?.length || 0;
            const pisrc = isrc;

            return `[${regionCount} regions] ${name} – ${artist} (${uri})`;
        });

        const resultText = entries.join("\n");

        Spicetify.PopupModal.display({
            title: `Alternate Versions (ISRC: ${isrc})`,
            content: Spicetify.React.createElement("div", null,
                Spicetify.React.createElement("textarea", {
                    readOnly: true,
                    value: resultText,
                    style: {
                        width: "100%",
                        height: "300px",
                        resize: "none",
                        whiteSpace: "pre",
                        fontFamily: "monospace",
                        fontSize: "12px",
                        padding: "8px",
                        boxSizing: "border-box",
                    },
                    onFocus: (e) => e.target.select()
                })
            ),
            isLarge: true,
            confirmButton: false,
            onConfirm: null
        });

    console.log(`🧾 Alternate versions for ISRC: ${isrc}`);
    altVersions.forEach((track) => {
        const name = track.name;
        const artist = track.artists.map((a) => a.name).join(", ");
        const uri = track.uri;
        const regionCount = track.available_markets?.length || 0;

        console.log(`[${regionCount} regions] ${name} – ${artist} (${uri})`);
    });

    Spicetify.showNotification(`Found ${altVersions.length} alternate version(s). Check console.`);
}
})();
