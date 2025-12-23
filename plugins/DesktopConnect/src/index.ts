import { LunaUnload, unloadSet } from "@luna/core";
import { ipcRenderer, MediaItem, PlayState, redux } from "@luna/lib";
import { send } from "./remoteService.native";

export * from "./remoteService.native";

export const unloads = new Set<LunaUnload>();

// #region From remote
ipcRenderer.on(unloads, "remote.desktop.notify.media.changed", async ({ mediaId, positionMs }) => {
	const mediaItem = await MediaItem.fromId(mediaId);
	if (mediaItem) {
		await mediaItem.play();
		
		// Fix für das Springen: Wenn eine Position mitgeliefert wird, springe dorthin
		if (positionMs && positionMs > 0) {
			setTimeout(() => {
				PlayState.seek(positionMs / 1000);
			}, 500); // Kurze Verzögerung, damit der Player Zeit zum Laden hat
		}
	}
	send({ command: "onRequestNextMedia", type: "media" });
});

ipcRenderer.on(unloads, "remote.desktop.prefetch", ({ mediaId, mediaType }) => {
	redux.actions["player/PRELOAD_ITEM"]({ productId: mediaId, productType: mediaType === 0 ? "track" : "video" });
});

ipcRenderer.on(unloads, "remote.desktop.seek", (time: number) => PlayState.seek(time / 1000));

// Direkte Aufrufe zur Vermeidung von Initialisierungsfehlern
ipcRenderer.on(unloads, "remote.desktop.play", () => PlayState.play());
ipcRenderer.on(unloads, "remote.desktop.pause", () => PlayState.pause());

ipcRenderer.on(unloads, "remote.desktop.set.shuffle", (mode: boolean) => PlayState.setShuffle(mode));
ipcRenderer.on(unloads, "remote.desktop.set.repeat.mode", (mode: string) => PlayState.setRepeatMode(mode));

// Korrektur des Tippfehlers aus dem Original (destop -> desktop)
ipcRenderer.on(unloads, "remote.desktop.set.volume.mute", ({ level, mute }: { level: number; mute: boolean }) => {
	redux.actions["playbackControls/SET_MUTE"](mute);
	redux.actions["playbackControls/SET_VOLUME"]({
		volume: Math.min(level * 100, 100),
	});
});
// #endregion

// #region To remote
const sessionUnloads = new Set<LunaUnload>();
ipcRenderer.on(unloads, "remote.desktop.notify.session.state", (state) => {
	// Wichtig für Reconnects: Alte Session-Listener immer zuerst löschen
	unloadSet(sessionUnloads);

	if (state === 0) return;

	ipcRenderer.on(sessionUnloads, "client.playback.playersignal", ({ time }: { time: number }) => {
		send({
			command: "onProgressUpdated",
			duration: 0,
			progress: time * 1000,
			type: "media",
		});
	});

	redux.intercept("playbackControls/SET_PLAYBACK_STATE", sessionUnloads, (state) => {
		switch (state) {
			case "IDLE":
				return send({ command: "onStatusUpdated", playerState: "idle", type: "media" });
			case "NOT_PLAYING":
				return send({ command: "onStatusUpdated", playerState: "paused", type: "media" });
			case "PLAYING":
				return send({ command: "onStatusUpdated", playerState: "playing", type: "media" });
			case "STALLED":
				return send({ command: "onStatusUpdated", playerState: "buffering", type: "media" });
		}
	});

	redux.intercept("playbackControls/ENDED", sessionUnloads, ({ reason }) => {
		if (reason === "completed") send({ command: "onPlaybackCompleted", hasNextMedia: false, type: "media" });
		return true;
	});

	redux.intercept("playbackControls/SKIP_NEXT", sessionUnloads, () => {
		PlayState.pause();
		send({ command: "onStatusUpdated", playerState: "idle", type: "media" });
		send({ command: "onPlaybackCompleted", hasNextMedia: false, type: "media" });
		return true;
	});
});

unloads.add(() => unloadSet(sessionUnloads));
// #endregion
