document.addEventListener('DOMContentLoaded', function() {

	var server = 'https://' + window.location.hostname + ':8089/janus';

	var janus = null;
	var videoroomHandle = null;
	var remoteFeedHandle = null;
	var opaqueId = 'camera-receiver-' + Janus.randomString(12);

	var room = 1000;
	var source = null;

	var passwordSubmitClicked = false;

	var passwordButton = document.getElementById('noVNC_password_button');
	var passwordInput = document.getElementById('noVNC_password_input');
	var currentPassword = '';
	var pin = '';

	passwordInput.addEventListener('input', function(event) {
		currentPassword = event.target.value;
	});

	passwordButton.onclick = function() {
		pin = currentPassword;
		passwordSubmitClicked = true;
	};

	parseRoomFromURL();

	Janus.init({ debug: true, callback: function() {
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

						if (passwordSubmitClicked) {
							joinRoom();
						} else {
							passwordButton.onclick = function() {
								pin = currentPassword;
								joinRoom();
							};
						}
					},
					error: function(error) {
						var formattedError = JSON.stringify(error, null, 2);
						Janus.error('Error attaching plugin: ', formattedError);
						alert(formattedError);
					},
					onmessage: handleMessagePublisher
				});
			},
			error: function(error) {
				var formattedError = JSON.stringify(error, null, 2);
				Janus.error(formattedError);
				alert('Janus error: ' + formattedError);
			},
			destroyed: function() {
				alert('Janus stopped');
			}
		});
	}});

	function handleMessagePublisher(msg, jsep) {
		var event = msg['videoroom'];
		if (event) {
			if (event === 'joined') {
				Janus.log('Successfully joined room ' + msg['room'] + ' with ID ' + msg['id']);
				passwordButton.onclick = null;
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
					if (msg['error_code'] === 433) {
						console.error('Janus: wrong pin "' + pin + '" for room ' + room);
						return;
					}
					alert('Error message: ' + msg['error'] + '.\nError object: ' + JSON.stringify(msg, null, 2));
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
				Janus.log('Plugin attached (subscriber)! (' + remoteFeedHandle.getPlugin() + ', id=' + remoteFeedHandle.getId() + ')');
				var listen = {
					request: 'join',
					room,
					ptype: 'subscriber',
					feed: id,
					pin
				};
				remoteFeedHandle.send({ message: listen });
			},
			error: function(error) {
				var formattedError = JSON.stringify(error, null, 2);
				Janus.error('Error attaching plugin (subscriber): ', formattedError);
				alert(formattedError);
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
					var formattedError = JSON.stringify(error, null, 2);
					Janus.error('WebRTC error:', formattedError);
					alert('WebRTC error: ', formattedError);
				}
			});
		}
	}

	function joinRoom() {
		var register = {
			request: 'join',
			room,
			ptype: 'publisher',
			pin
		};
		videoroomHandle.send({ message: register });
	}

	function parseRoomFromURL() {
		var urlParams = new URLSearchParams(window.location.search);
		var roomParam = urlParams.get('room');
		if (roomParam != null && !isNaN(roomParam)) {
			room = parseInt(roomParam);
		} else {
			console.log('Got no valid room in URL search params, using default room ' + room);
		}
	}
});

