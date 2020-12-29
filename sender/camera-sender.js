document.addEventListener('DOMContentLoaded', function() {
    var server = 'https://' + window.location.hostname + ':8089/janus';

    var janus = null;
    var videoroomHandle = null;
    var room = 1006;
    var sendResolution = 'stdres';

    const socketNumber = room + 4000;
    const socket = io('https://' + window.location.hostname, { path: '/socket.io/' + socketNumber });

    var startButton = document.getElementById('start');
    var stopButton = document.getElementById('stop');

    parseRoomFromURL();

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
                            var pinInput = document.getElementById('pin-input');
                            startButton.setAttribute('disabled', '');
                            resSelect.setAttribute('disabled', '');
                            stopButton.removeAttribute('disabled');
                            stopButton.onclick = function() {
                                janus.destroy();
                            };
                            sendResolution = resSelect.value;
                            Janus.log('sendResolution:', sendResolution);
                            shareCamera(pinInput.value);
                            pinInput.value = '';
                        };
                        startButton.removeAttribute('disabled');
                    },
                    error: function(error) {
                        Janus.error('Error attaching plugin: ', error);
                        alert(error);
                    },
                    webrtcState: function(on) {
                        if (on) {
                            var bandwidthForm = document.getElementById('bandwidth-form');
                            var bandwidthSubmit = document.getElementById('bandwidth-submit');
                            bandwidthForm.onsubmit = handleBandwidthFormSubmit;
                            bandwidthSubmit.removeAttribute('disabled', '');
                            alert('Sharing camera');
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
                Janus.log('Successfully joined room ' + msg['room'] + ' with ID ' + msg['id']);
                if (msg['publishers'].length === 0) {
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
                } else {
                    alert('There is already somebody who is sharing his camera in this room!');
                    window.location.reload();
                }
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
        var roomIndicator = document.getElementById('room-indicator');
        var appendix = '';
        if (roomParam != null && !isNaN(roomParam)) {
            room = parseInt(roomParam);
        } else {
            console.log('Got no valid room in URL search params, using default room ' + room);
            appendix = ' (Default value)';
        }
        roomIndicator.innerText = `VNC ${room - 1000} - Room ${room}` + appendix;
    }
}, false);

