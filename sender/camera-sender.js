document.addEventListener('DOMContentLoaded', function() {
    var server = 'https://' + window.location.hostname + ':8089/janus';

    var janus = null;
    var videoroomHandle = null;
    var sendResolution = 'stdres';

    var startButton = document.getElementById('start');
    var stopButton = document.getElementById('stop');

    var gotSocketInitResponse = false;
    var transmitting = false;
    var room = 1000;
    var slot = 0;
    var token = '';
    var pin = '';
    var useUserPin = true;
    var customNameAllowed = false;
    var feedId = null;

    var STATUS_CODE = {
        success: 0,
        warning: 1,
        error: 2
    };

    parseRoomFromURL();
    parseSlotFromURL();
    parsePinFromURL();
    parseTokenFromURL();
    parseCustomNameAllowed();

    document.getElementById('room').innerText = room - 1000;
    document.getElementById('slot').innerText = slot + 1;

    const socketNumber = room + 4000;
    const socket = io('https://' + window.location.hostname, {
        path: '/socket.io/' + socketNumber
    });
    setStatusMessage('Connecting to camera server...');

    document.getElementById('options-toggle').onclick = function() {
        document.getElementById('options').classList.toggle('hidden');
    };

    document.getElementById('reload').onclick = function() {
        window.location.reload();
    };

    var timeoutTime = 10000;
    var cameraServerTimeout = setTimeout(function() {
        setStatusMessage('Camera server connection timeout... Please try again later', STATUS_CODE.error);
    }, timeoutTime);

    registerSocketHandlers();

    function handleUnexpectedSocketDisconnect() {
        console.log('Socket disconnected');
        setStatusMessage('Socket disconnected. This either means that you are having connectivity ' +
            'issues or that the server disconnected you on purpose.', STATUS_CODE.error);
    }

    function registerSocketHandlers() {
        socket.on('connect', function() {
            clearTimeout(cameraServerTimeout);
            // This event will be triggered on every connect including reconnects
            // That's why the check is necessary to ensure that the event is only emitted once
            if (!gotSocketInitResponse) {
                socket.emit(
                    'sender_init',
                    { slot, token },
                    handleSenderInitResponse
                );
            }
        });
        socket.on('disconnect', handleUnexpectedSocketDisconnect);
        socket.on('new_controller_bitrate_limit', function(data) {
            setControllerBitrateLimit(Math.floor(data.bitrateLimit / 1000));
        });
    };

    function handleSenderInitResponse(data) {
        if (!gotSocketInitResponse) {
            gotSocketInitResponse = true;
            console.log('sender_init response data:', data);
            if (data.success) {
                initJanus();
            } else {
                setStatusMessage(`Socket connection error: ${data.message} - Reload to try again`, STATUS_CODE.error);
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
                setStatusMessage('Transmission stopped', STATUS_CODE.warning);
                cleanup();
            };

            showVideo();
            showOptions();
            setControllerBitrateLimit(Math.floor(data.controllerBitrateLimit / 1000));
            if (customNameAllowed) {
                var nameForm = document.getElementById('name-form');
                nameForm.onsubmit = function(event) {
                    event.preventDefault();
                    const newName = document.getElementById('name-input').value;
                    socket.emit('change_name', { newName });
                    setStatusMessage(`Requested name change to: ${newName}`);
                };
                var nameChangeButton = document.getElementById('name-change');
                nameChangeButton.removeAttribute('disabled');
                showElement(nameChangeButton);
            }

            setStatusMessage('Sharing camera');
        } else {
            setStatusMessage(`Error: ${data.message} - Reload to try again`, STATUS_CODE.error);
        }
    }

    function initJanus() {
        setStatusMessage('Initializing Janus...')
        Janus.init({ debug: 'all', callback: function() {
            if (!Janus.isWebrtcSupported()) {
                setStatusMessage('Your browser does not support camera transmission', STATUS_CODE.error);
                return;
            }


            janus = new Janus({
                server: server,
                success: function() {
                    Janus.log('Janus instance created with session id ' + janus.getSessionId());
                    janus.attach({
                        plugin: 'janus.plugin.videoroom',
                        success: function(pluginHandle) {
                            videoroomHandle = pluginHandle;
                            Janus.log('Plugin attached! (' + videoroomHandle.getPlugin() + ', id=' + videoroomHandle.getId() + ')');

                            hideSpinner();
                            showInputs();

                            startButton.onclick = function() {
                                setStatusMessage('Connecting...');
                                var resSelect = document.getElementById('res-select');
                                startButton.setAttribute('disabled', '');
                                resSelect.setAttribute('disabled', '');
                                sendResolution = resSelect.value;
                                Janus.log('sendResolution:', sendResolution);
                                if (useUserPin) {
                                    var pinInputEl = document.getElementById('pin-input');
                                    pin = pinInputEl.value;
                                    pinInputEl.setAttribute('disabled', '');
                                }
                                shareCamera(pin);
                            };
                            startButton.removeAttribute('disabled');
                            setStatusMessage('Connected - Click Start to transmit your camera feed');
                        },
                        error: function(error) {
                            Janus.error('Error attaching plugin: ', error);
                            setStatusMessage(`Janus attach error: ${error} - Reload to try again`, STATUS_CODE.error);
                        },
                        webrtcState: function(on) {
                            if (on) {
                                var data = {
                                    feedId,
                                    sessionId: janus.getSessionId(),
                                    videoroomId: videoroomHandle.getId()
                                };
                                if (customNameAllowed) {
                                    data.customName = document.getElementById('name-input').value;
                                }
                                socket.emit('set_feed_id', data, handleSetFeedIdResponse);
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
                                document.getElementById('preview-container').appendChild(video);
                            }
                            Janus.attachMediaStream(document.getElementById('camera-preview'), stream);
                        }
                    });
                },
                error: function(error) {
                    Janus.error(error);
                    setStatusMessage(`Janus error: ${error} - Reload to try again`, STATUS_CODE.error);
                },
                destroyed: function() {
                    console.log('Janus destroyed!');
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
        var bitrateLimit = parseInt(bandwidthInput.value);
        bandwidthInput.value = '';
        socket.emit(
            'set_bitrate_limit',
            { bitrateLimit: 1000 * bitrateLimit },
            function(data) {
                console.log('set_bitrate_limit response', data);
                if (data.success) {
                    setUserBitrateLimit(bitrateLimit);
                }
            }
        );
    }

    function handleMessage(msg, jsep) {
        var event = msg['videoroom'];
        if (event) {
            if (event === 'joined') {
                Janus.log('Joined event:', msg);
                feedId = msg.id;
                Janus.log('Successfully joined room ' + msg['room'] + ' with ID ' + feedId);
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
                        setStatusMessage(`Janus WebRTC error: ${error.message} - Reload to try again`, STATUS_CODE.error);
                    }
                });
            }
            if (event === 'event' && msg['error']) {
                setStatusMessage(`Janus error: ${msg['error']} - Reload to try again`, STATUS_CODE.error);
            }
        }
        if (jsep) {
            videoroomHandle.handleRemoteJsep({ jsep });
        }
    };

    function setStatusMessage(message, statusCode) {
        // For error status messages a cleanup is performed automatically
        // If this is not desired, use warnings
        if (statusCode == null) {
            statusCode = STATUS_CODE.success;
        }
        var statusEl = document.getElementById('status');
        statusEl.setAttribute('data-status-code', statusCode);
        statusEl.innerText = message;
        if (statusCode === STATUS_CODE.error) {
            cleanup();
        }
    }

    function setUserBitrateLimit(bitrateLimit) {
        document.getElementById('user-bitrate-limit').innerText = bitrateLimit;
    }

    function setControllerBitrateLimit(bitrateLimit) {
        document.getElementById('controller-bitrate-limit').innerText = bitrateLimit;
    }

    function cleanup() {
        hideVideo();
        hideOptions();
        hideInputs();
        hideSpinner();
        showReload();
        if (videoroomHandle) {
            videoroomHandle.detach();
        }
        if (socket && socket.connected) {
            // Remove handler because this disconnect call is expected
            // in the case of an error
            socket.off('disconnect', handleUnexpectedSocketDisconnect);
            socket.disconnect();
        }
    }

    function hideElement(el) {
        el.classList.add('hidden');
    }

    function showElement(el) {
        el.classList.remove('hidden');
    }

    function hideSpinner() {
        hideElement(document.getElementById('spinner'));
    }

    function showInputs() {
        showElement(document.getElementById('inputs-container'));
    }

    function hideInputs() {
        hideElement(document.getElementById('inputs-container'));
    }

    function showOptions() {
        showElement(document.getElementById('options-container'));
    }

    function hideOptions() {
        hideElement(document.getElementById('options-container'));
    }

    function showVideo() {
        showElement(document.getElementById('preview-container'));
    }

    function hideVideo() {
        hideElement(document.getElementById('preview-container'));
    }

    function showReload() {
        showElement(document.getElementById('reload'));
        hideElement(startButton);
        hideElement(stopButton);
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
        } else {
            console.log('Got no valid pin in URL search params');
            showElement(document.getElementById('pin-control'));
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

    function parseCustomNameAllowed() {
        var urlParams = new URLSearchParams(window.location.search);
        var param = urlParams.get('customNameAllowed');
        customNameAllowed = param != null;
        if (customNameAllowed) {
            document.getElementById('name-input').value = param;
            showElement(document.getElementById('name-control'));
        }
    }
}, false);

