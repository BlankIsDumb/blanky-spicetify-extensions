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
    

    // helpers

    function pick(obj, paths) {
        for (const p of paths) {
            const parts = p.split(".");
            let cur = obj;
            let ok = true;
            for (const k of parts) {
                if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k];
                else { ok = false; break; }
            }
            if (ok && cur != null) return cur;
        }
        return null;
    }

    function extractName(data) {
        return pick(data, ["name", "track.name", "metadata.name"]) ?? "Unknown track";
    }

    function extractArtists(data) {
        const arr =
            pick(data, ["artist", "artists"]) ??
            pick(data, ["album.artist", "album.artists"]) ??
            [];

        if (!Array.isArray(arr)) return [];

        return arr
            .map(a => a?.name ?? a?.artist?.name ?? a?.profile?.name)
            .filter(Boolean);
    }

    function extractCanonicalUri(data) {
        return pick(data, ["canonical_uri", "canonicalUri", "uri", "track_uri"]) ?? null;
    }

    async function copyToClipboard(text) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            Spicetify.showNotification("Copied");
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            Spicetify.showNotification("Copied");
        }
    }

    function Row(label, value, mono = false) {
        return Spicetify.React.createElement("div", { style: { marginBottom: "10px" } },
            Spicetify.React.createElement("div", { style: { fontSize: "12px", opacity: 0.7, marginBottom: "4px" } }, label),
            Spicetify.React.createElement("div", {
                style: {
                    fontFamily: "inherit",
                    fontSize: mono ? "16px" : "16px",
                    padding: mono ? "8px" : "0px",
                    borderRadius: mono ? "8px" : "0px",
                    background: mono ? "rgba(255,255,255,0.06)" : "transparent",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }
            }, value ?? "(missing)")
        );
    }

function Btn(text, onClick, disabled = false) {
  return Spicetify.React.createElement("button", {
    onClick,
    disabled,
    style: {
      padding: "6px 10px",
      borderRadius: "8px",
      cursor: disabled ? "not-allowed" : "pointer",

      // THE IMPORTANT PART:
      background: disabled ? "var(--spice-button-disabled)" : "var(--spice-button)",
      color: "var(--spice-text)",
      border: "none",

      // looks more “Spotify”
      fontWeight: 600,
      opacity: disabled ? 0.6 : 1,
    },
    onMouseEnter: (e) => {
      if (disabled) return;
      e.currentTarget.style.background = "var(--spice-button-active)";
    },
    onMouseLeave: (e) => {
      if (disabled) return;
      e.currentTarget.style.background = "var(--spice-button)";
    },
  }, text);
}



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

    function coverUrlFromSpclient(data) {
        const imgs = data?.album?.cover_group?.image;
        if (!Array.isArray(imgs) || imgs.length === 0) return null;

        // pick biggest available
        const best = imgs.reduce((a, b) => {
            const ap = (a?.width ?? 0) * (a?.height ?? 0);
            const bp = (b?.width ?? 0) * (b?.height ?? 0);
            return bp > ap ? b : a;
        }, imgs[0]);

        const id = best?.file_id;
        if (!id) return null;

        return `https://i.scdn.co/image/${id}`;
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

        const name = extractName(data);
        const artists = extractArtists(data);

        const canonical = extractCanonicalUri(data);
        const coverUrl = coverUrlFromSpclient(data);

        const popularity = (typeof data?.popularity === "number") ? data.popularity : null;
        const earliestLive = (typeof data?.earliest_live_timestamp === "number") ? data.earliest_live_timestamp : null;

        const albumName = data?.album?.name ?? null;
        const albumLabel = data?.album?.label ?? null;

        const albumArtists = Array.isArray(data?.album?.artist)
            ? data.album.artist.map(a => a?.name).filter(Boolean)
            : [];

        const albumDateObj = data?.album?.date ?? null;
        const albumDate =
            (albumDateObj && typeof albumDateObj === "object")
                ? [
                    String(albumDateObj.year ?? "").padStart(4, "0"),
                    String(albumDateObj.month ?? "").padStart(2, "0"),
                    String(albumDateObj.day ?? "").padStart(2, "0"),
                ].filter(Boolean).join("-")
                : null;

        function unixToLocalString(sec) {
            if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
            // JS Date uses ms
            const d = new Date(sec * 1000);
            // user-friendly + includes timezone name-ish
            // example: "2026-01-03 20:15:30 (GMT+7)"
            const pad = (n) => String(n).padStart(2, "0");
            const y = d.getFullYear();
            const m = pad(d.getMonth() + 1);
            const da = pad(d.getDate());
            const h = pad(d.getHours());
            const mi = pad(d.getMinutes());
            const s = pad(d.getSeconds());

            // timezone offset minutes -> +07:00
            const offMin = -d.getTimezoneOffset(); // reversed sign
            const sign = offMin >= 0 ? "+" : "-";
            const abs = Math.abs(offMin);
            const offH = pad(Math.floor(abs / 60));
            const offM = pad(abs % 60);

            return `${y}-${m}-${da} ${h}:${mi}:${s} (UTC${sign}${offH}:${offM})`;
        }

        const earliestLiveStr = earliestLive ? unixToLocalString(earliestLive) : null;

        const jsonText = JSON.stringify(data, null, 2);

        // clickable link element for cover
        const coverLinkEl = coverUrl
            ? Spicetify.React.createElement(
                "a",
                { href: coverUrl, target: "_blank", rel: "noreferrer", style: { textDecoration: "underline" } },
                "Open largest cover (i.scdn.co)"
              )
            : "(missing)";

        // Album header block (as requested: “whole album field” at the top)
        const albumHeader = Spicetify.React.createElement("div", {
            style: {
                padding: "10px",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.06)",
                marginBottom: "10px",
            }
        },
            Spicetify.React.createElement("div", { style: { fontSize: "14px", fontWeight: 700, marginBottom: "4px" } },
                albumName ?? "(unknown album)"
            ),
            Spicetify.React.createElement("div", { style: { opacity: 0.85, marginBottom: "6px" } },
                (albumArtists.length ? albumArtists.join(", ") : "Unknown album artist")
            ),
            Row("Release date", albumDate ?? null, true),
            Row("Label", albumLabel ?? null, false),
            Row("Cover", coverLinkEl, false),
        );

        Spicetify.PopupModal.display({
            title: "Track inspector",
            content: Spicetify.React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },

                Spicetify.React.createElement("div", { style: { fontSize: "18px", fontWeight: 700, marginBottom: "2px" } }, name),
                Spicetify.React.createElement("div", { style: { opacity: 0.85, marginBottom: "8px" } }, artists.join(", ") || "Unknown artist"),
                
                albumHeader,

                Row("canonical_uri", canonical, true),
                Row("ISRC", isrc ?? null, true),
                Row("earliest_live_timestamp", earliestLiveStr ?? null, true),
                Row("popularity", popularity ?? null, true),

                Spicetify.React.createElement("div", { style: { display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" } },
                    Btn("Copy canonical_uri", () => copyToClipboard(canonical)),
                    Btn("Copy ISRC", () => copyToClipboard(isrc)),
                    Btn("Copy cover URL", () => copyToClipboard(coverUrl)),
                    Btn("Copy earliest live", () => copyToClipboard(earliestLiveStr)),
                    Btn("Copy JSON", () => copyToClipboard(jsonText)),
                ),

                Spicetify.React.createElement("details", null,
                    Spicetify.React.createElement("summary", { style: { cursor: "pointer", opacity: 0.85 } }, "Raw JSON"),
                    Spicetify.React.createElement("textarea", {
                        readOnly: true,
                        value: jsonText,
                        style: {
                            width: "100%",
                            height: "360px",
                            marginTop: "8px",
                            resize: "none",
                            whiteSpace: "pre",
                            fontFamily: "inherit",
                            fontSize: "16px",
                            padding: "8px",
                            boxSizing: "border-box",
                        },
                        onFocus: (e) => e.target.select(),
                    })
                )
            ),
            isLarge: true,
        });

    }
})();
