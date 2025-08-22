(function () {
    if (!Spicetify?.ContextMenu || !Spicetify?.URI || !Spicetify?.CosmosAsync) {
        setTimeout(arguments.callee, 300);
        return;
    }

    async function getTrackInfo(uri) {
        const trackID = Spicetify.URI.fromString(uri).id;
        const data = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/tracks/${trackID}`);
        console.log(trackID);
        console.log(data);
        return {
            title: data.name,
            artist: data.artists[0].name
        };
        
    }

    // Generic formatter for URLs
    function formatSearchURL(base, track, artist) {
        // Remove unwanted chars like colons, but NOT kanji/kana/Thai/etc.
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

