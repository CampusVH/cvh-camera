document.addEventListener('DOMContentLoaded', function() {
    var server = 'https://' + window.location.hostname + ':8089/janus';

    var janus = null;
    var videoroomHandle = null;
    var sendResolution = 'stdres';

    var startButton = document.getElementById('start');
    var stopButton = document.getElementById('stop');
    var roomIndicator = document.getElementById('room-indicator');

    var gotSocketInitResponse = false;
    var transmitting = false;
    var room = 1006;
    var slot = 0;
    var token = '';
    var pin = '';
    var useUserPin = true;
    var feedId = null;

    parseRoomFromURL();
    parseSlotFromURL();
    parsePinFromURL();
    parseTokenFromURL();

    roomIndicator.innerText = `Channel ${room - 1000}, Camera ${slot + 1}`;

    const socketNumber = room + 4000;
    const socket = io('https://' + window.location.hostname, {
        path: '/socket.io/' + socketNumber
    });

    registerSocketHandlers();

    function handleSenderInitResponse(data) {
        if (!gotSocketInitResponse) {
            gotSocketInitResponse = true;
            console.log('sender_init response data:', data);
            if (data.success) {
                initJanus();
            } else {
                alert('Socket connection error:\n' + data.message);
            }
        }
    }

    function handleSetFeedIdResponse(data) {
        console.log('set_feed_id response data:', data);
        if (data.success) {
            transmitting = true;

            var bandwidthForm = document.getElementById('bandwidth-form');
            var bandwidthSubmit = document.getElementById('bandwidth-submit');
            bandwidthForm.onsubmit = handleBandwidthFormSubmit;
            bandwidthSubmit.removeAttribute('disabled', '');
            stopButton.removeAttribute('disabled');
            stopButton.onclick = function() {
                janus.destroy();
            };

            var video = document.getElementById('camera-preview');
            if (video != null) {
                video.classList.remove('visually-hidden');
            }

            alert('Sharing camera');
        } else {
            alert('Error: ' + data.message);
            window.location.reload();
        }
    }

    function registerSocketHandlers() {
        socket.on('connect', function() {
            // This event will be triggered on every connect including reconnects
            // That's why the check is necessary to ensure that the event is only emitted once
            console.log('socket on connect handler');
            if (!gotSocketInitResponse) {
                socket.emit(
                    'sender_init',
                    { slot, token },
                    handleSenderInitResponse
                );
            }
        });
    };

    function initJanus() {
        Janus.init({ debug: 'all', callback: function() {
            if (!Janus.isWebrtcSupported()) {
                alert('No WebRTC support... ');
                return;
            }

            janus = new Janus({
                server: server,
                success: function() {
                    janus.attach({
                        plugin: 'janus.plugin.videoroom',
                        success: function(pluginHandle) {
                            videoroomHandle = pluginHandle;
                            Janus.log('Plugin attached! (' + videoroomHandle.getPlugin() + ', id=' + videoroomHandle.getId() + ')');    

                            startButton.onclick = function() {
                                var resSelect = document.getElementById('res-select');
                                startButton.setAttribute('disabled', '');
                                resSelect.setAttribute('disabled', '');
                                sendResolution = resSelect.value;
                                Janus.log('sendResolution:', sendResolution);
                                if (useUserPin) {
                                    pin = document.getElementById('pin-input').value;
                                }
                                shareCamera(pin);
                            };
                            startButton.removeAttribute('disabled');
                        },
                        error: function(error) {
                            Janus.error('Error attaching plugin: ', error);
                            alert(error);
                        },
                        webrtcState: function(on) {
                            if (on) {
                                socket.emit('set_feed_id', { feedId }, handleSetFeedIdResponse);
                                // Sharing camera successful, when the set_feed_id request is successful
                            } else {
                                janus.destroy();
                            }
                        },
                        onmessage: handleMessage,
                        onlocalstream: function(stream) {
                            if (document.getElementById('camera-preview') == null) {
                                var video = document.createElement('video');
                                video.setAttribute('id', 'camera-preview');
                                video.setAttribute('autoplay', '');
                                video.setAttribute('playsinline', '');
                                video.setAttribute('muted', 'muted');
                                if (!transmitting) {
                                    video.classList.add('visually-hidden');
                                }
                                document.getElementById('preview-container').appendChild(video);

                                // var noVncLink = 'https://simon-doering.com/novnc/vnc.html?room=' + room;
                                // var linkContainer = document.createElement('div');
                                // linkContainer.innerHTML = `Camera feed can be viewed in noVNC at this link by clicking the connect button: <a href=${noVncLink}>${noVncLink}</a>`;
                                // document.body.appendChild(linkContainer);
                            }
                            Janus.attachMediaStream(document.getElementById('camera-preview'), stream);
                        }
                    });
                },
                error: function(error) {
                    Janus.error(error);
                    alert(error);
                    window.location.reload();
                },
                destroyed: function() {
                    alert('Stopped');
                    window.location.reload();
                }
            });
        }});
    };
    
    function shareCamera(pin) {
        var register = {
            request: 'join',
            room,
            ptype: 'publisher',
            pin
        };
        videoroomHandle.send({ message: register });
    }

    function handleBandwidthFormSubmit(event) {
        event.preventDefault();
        var bandwidthInput = document.getElementById('bandwidth-input');
        var bitrateStr = bandwidthInput.value.trim();
        if (bitrateStr !== '' && !isNaN(bitrateStr) ) {
            var bitrate = parseInt(bitrateStr) * 1000;
            if (bitrate < 0) {
                bandwidth = 0;
                Janus.log('Negative bitrate input set to 0 (unlimited)');
            }
            videoroomHandle.send({ message: { request: 'configure', bitrate }});
            bandwidthInput.value = '';
        } else {
            alert('Invalid value for bitrate');
        }
    }

    function handleMessage(msg, jsep) {
        var event = msg['videoroom'];
        if (event) {
            if (event === 'joined') {
                Janus.log('Joined event:', msg);
                feedId = msg.id;
                Janus.log('Successfully joined room ' + msg['room'] + ' with ID ' + feedId);
                //if (msg['publishers'].length === 0) {
                    videoroomHandle.createOffer({
                        media: {
                            videoSend: true,
                            video: sendResolution,
                            audioSend: false,
                            videoRecv: false
                        },
                        success: function(jsep) {
                            var publish = {
                                request: 'configure',
                                audio: false,
                                video: true
                            };
                            videoroomHandle.send({ message: publish, jsep });
                        },
                        error: function(error) {
                            Janus.error('WebRTC error:', error);
                            alert('WebRTC error: ' + error.message);
                        }
                    });
                //} else {
                //    alert('There is already somebody who is sharing his camera in this room!');
                //    window.location.reload();
                //}
            }
            if (event === 'event' && msg['error']) {
                alert('Error message: ' + msg['error'] + '.\nError object: ' + JSON.stringify(msg, null, 2));
                window.location.reload();
            }
        }
        if (jsep) {
            videoroomHandle.handleRemoteJsep({ jsep });
        }
    };

    function parseRoomFromURL() {
        var urlParams = new URLSearchParams(window.location.search);
        var roomParam = urlParams.get('room');
        if (roomParam != null && !isNaN(roomParam)) {
            room = parseInt(roomParam);
        } else {
            console.log('Got no valid room in URL search params, using default room ' + room);
        }
    }

    function parseSlotFromURL() {
        var urlParams = new URLSearchParams(window.location.search);
        var slotParam = urlParams.get('slot');
        if (slotParam != null && !isNaN(slotParam)) {
            slot = parseInt(slotParam);
        } else {
            console.log('Got no valid slot in URL search params, using default slot ' + slot);
        }
    }

    function parsePinFromURL() {
        var urlParams = new URLSearchParams(window.location.search);
        var pinParam = urlParams.get('pin');
        if (pinParam != null) {
            useUserPin = false;
            pin = pinParam;
            // Providing a pin value of 'none' sets the pin explictly to ''
            if (pin === 'none') {
                pin = '';
            }
            document.getElementById('pin-input').remove();
            document.getElementById('pin-hint').remove();
        } else {
            console.log('Got no valid pin in URL search params');
        }
    }

    function parseTokenFromURL() {
        var urlParams = new URLSearchParams(window.location.search);
        var tokenParam = urlParams.get('token');
        if (tokenParam != null) {
            token = tokenParam;
        } else {
            console.log('Got no valid token in URL search params, using default token ' + token);
        }

    }
}, false);

