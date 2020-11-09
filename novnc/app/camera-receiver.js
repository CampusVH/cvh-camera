var server = 'https://' + window.location.hostname + ':8089/janus';

var janus = null;
var videoroomHandle = null;
var remoteFeedHandle = null;
var opaqueId = 'camera-receiver-' + Janus.randomString(12);

var room = 1000;
var source = null;

var urlParams = new URLSearchParams(window.location.search);
var roomParam = urlParams.get('room');
if (roomParam != null && !isNaN(roomParam)) {
	room = parseInt(roomParam);
} else {
	console.log('Got no valid room in URL search params, using default room ' + room);
}

document.addEventListener('DOMContentLoaded', function() {
	Janus.init({ debug: false, callback: function() {
		if (!Janus.isWebrtcSupported()) {
			alert('No WebRTC support... ');
			return;
		}

		janus = new Janus({
			server,
			success: function() {
				janus.attach({
					plugin: 'janus.plugin.videoroom',
					opaqueId,
					success: function(pluginHandle) {
						videoroomHandle = pluginHandle;
						Janus.log('Plugin attached! (' + videoroomHandle.getPlugin() + ', id=' + videoroomHandle.getId() + ')');

						var connectButton = document.getElementById('noVNC_connect_button');
						connectButton.onclick = function() {
							connectButton.onclick = null;
							joinRoom();
						};
					},
					error: function(error) {
						Janus.error('Error attaching plugin: ', error);
						alert(error);
					},
					onmessage: handleMessagePublisher
				});
			},
			error: function(error) {
				Janus.error(error);
				alert('Janus error: ' + error);
			},
			destroyed: function() {
				alert('Janus stopped');
			}
		});
	}});
});

function handleMessagePublisher(msg, jsep) {
	var event = msg['videoroom'];
	if (event) {
		if (event === 'joined') {
			Janus.log('Successfully joined room ' + msg['room'] + ' with ID ' + msg['id']);
			var publishers = msg['publishers'];
			if (publishers && publishers.length !== 0) {
				newRemoteFeed(publishers[0]['id']);
			}
		} else if (event === 'event') {
			var publishers = msg['publishers'];
			if (publishers && publishers.length !== 0) {
				newRemoteFeed(publishers[0]['id']);
			} else if (msg['leaving'] && msg['leaving'] === source) {
				Janus.log('Publisher left');
				var video = document.getElementById('camera-feed');
				if (video != null) {
					video.remove();
				}
			} else if (msg['error']) {
				alert(msg['error']);
			}
		}
	}
	if (jsep) {
		videoRoomHandle.handleRemoteJsep({ jsep });
	}
}

function newRemoteFeed(id) {
	source = id;
	janus.attach({
		plugin: 'janus.plugin.videoroom',
		opaqueId,
		success: function(pluginHandle) {
			remoteFeedHandle = pluginHandle;
			Janus.log('Plugin attached (listener)! (' + remoteFeedHandle.getPlugin() + ', id=' + remoteFeedHandle.getId() + ')');
			var listen = {
				request: 'join',
				room,
				ptype: 'listener',
				feed: id
			};
			remoteFeedHandle.send({ message: listen });
		},
		error: function(error) {
			Janus.error('Error attaching plugin (listener): ', error);
			alert(error);
		},
		onmessage: handleMessageListener,
		onremotestream: function(stream) {
			if (document.getElementById('camera-feed') == null) {
				var video = document.createElement('video');
				video.setAttribute('id', 'camera-feed');
				video.setAttribute('autoplay', '');
				video.setAttribute('playsinline', '');
				// video.setAttribute('style', 'position: fixed; bottom: 0; right: 0; max-width: calc(150px + 10%); max-height: calc(150px + 20%); z-index: 100;');
				document.body.appendChild(video);
				video.onclick = function(event) {
					event.target.classList.toggle('fullscreen');
				}
			}
			Janus.attachMediaStream(document.getElementById('camera-feed'), stream);
		},
		oncleanup: function() {
			Janus.log('Got a cleanup notification (remote feed ' + source + ')');
		}
	});
}

function handleMessageListener(msg, jsep) {
	var event = msg['videoroom'];
	if (event) {
		if (event === 'attached') {
			Janus.log('Successfully attached to feed ' + source + ' in room ' + msg['room']);
		}
	}
	if (jsep) {
		remoteFeedHandle.createAnswer({
			jsep,
			media: { audioSend: false, videoSend: false },
			success: function(jsep) {
				var body = {
					request: 'start',
					room
				};
				remoteFeedHandle.send({ message: body, jsep });
			},
			error: function(error) {
				Janus.error('WebRTC error:', error);
				alert('WebRTC error: ', error.message);
			}
		});
	}
}

function joinRoom() {
	var register = {
		request: 'join',
		room,
		ptype: 'publisher'
	};
	videoroomHandle.send({ message: register });
}
