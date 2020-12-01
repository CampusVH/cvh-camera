var server = 'https://' + window.location.hostname + ':8089/janus';

var janus = null;
var videoroomHandle = null;
var remoteFeedHandle = null;
var opaqueId = 'camera-receiver-' + Janus.randomString(12);

var room = 1000;
var source = null;

document.addEventListener('DOMContentLoaded', function() {
	parseRoomFromURL();

	Janus.init({ debug: 'all', callback: function() {
		if (!Janus.isWebrtcSupported()) {
			Janus.error('No WebRTC support... ');
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

						var viewButton = document.getElementById('view');
						viewButton.removeAttribute('disabled');
						viewButton.onclick = function() {
							joinRoom();
							viewButton.remove();
							viewButton = null;
						};
					},
					error: function(error) {
						Janus.error('Error attaching plugin: ', error);
					},
					onmessage: handleMessagePublisher
				});
			},
			error: function(error) {
				Janus.error(error);
				window.location.reload();
			},
			destroyed: function() {
				Janus.error('Stopped');
				window.location.reload();
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
			} else if (msg['leaving']) {
				var leaving = msg['leaving'];
				Janus.log('Publisher left: ' + leaving);
				if (leaving === source) {
					Janus.log('Publisher left');
				}
			} else if (msg['error']) {
				Janus.log('handleMessagePublisher error: ' + msg['error']);
			}
		}
	}
	if (jsep) {
		videoRoomHandle.handleRemoteJsep({ jsep });
	}
}

function newRemoteFeed(id) {
	source = id;
	console.log('newRemoteFeed id: ' + id);
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
		},
		onmessage: handleMessageListener,
		onremotestream: function(stream) {
			if (document.getElementById('camera-feed') == null) {
				var video = document.createElement('video');
				video.setAttribute('id', 'camera-feed');
				video.setAttribute('autoplay', '');
				video.setAttribute('playsinline', '');
				video.setAttribute('muted', 'muted');
				document.getElementById('camera-container').appendChild(video);
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

function parseRoomFromURL() {
	var urlParams = new URLSearchParams(window.location.search);
	var roomParam = urlParams.get('room');
	if (roomParam != null && !isNaN(roomParam)) {
		room = parseInt(roomParam);
		console.log('Using room ' + room + ' from URL query string');
	} else {
		console.log('Got no valid room in URL query string, using default room ' + room);
	}
}
