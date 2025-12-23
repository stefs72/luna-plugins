import { getResponder } from "@homebridge/ciao";
import { hostname } from "os";

const RemoteDesktopController = require("./original.asar/app/main/remoteDesktop/RemoteDesktopController.js").default;
const { generateDeviceId } = require("./original.asar/app/main/mdns/broadcast.js");
const websocket = require("./original.asar/app/main/remoteDesktop/websocket.js").default;

let service: any = null;
let lunaRemoteDesktop: any = null;

export const setup = () => {
	if (RemoteDesktopController.__running) return console.warn("RemoteDesktopController is already running");

	const responder = getResponder();
	const deviceId = generateDeviceId();

	service = responder.createService({
		disabledIpv6: true,
		port: 2019,
		type: "tidalconnect",
		name: `RemoteDesktop-${deviceId}`,
		txt: {
			mn: "RemoteDesktop",
			id: deviceId,
			fn: `TidaLuna: ${hostname().split(".")[0]}`,
			ca: "0",
			ve: "1",
		},
	});

	RemoteDesktopController.__running = true;
	lunaRemoteDesktop = new RemoteDesktopController();
	lunaRemoteDesktop.mdnsStartBroadcasting = () => service.advertise();
	lunaRemoteDesktop.mdnsStopBroadcasting = () => service.end();

	lunaRemoteDesktop.initialize("https://desktop.tidal.com");
	lunaRemoteDesktop.mdnsStartBroadcasting();

	lunaRemoteDesktop.remoteDesktopPlayer.remotePlayerProcess.stdout.on("data", (...args: any[]) =>
		console.log("DesktopConnect.remotePlayerProcess.stdout", ...args)
	);
};

// Neue Funktion zum sauberen Beenden des Dienstes
export const stop = () => {
	if (service) {
		service.end();
		service = null;
	}
	if (lunaRemoteDesktop) {
		RemoteDesktopController.__running = false;
		lunaRemoteDesktop = null;
	}
};

export const send = websocket.send.bind(websocket);
