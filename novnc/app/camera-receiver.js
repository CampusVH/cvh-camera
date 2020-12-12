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

    var socket = io();
    var socketEventListenersRegistered = false;
    var videoMounted = false;
    var videoActiveGeometry = '';
    var previousCanvasGeometryState = {
        vncHeight: 0,
        vncWidth: 0,
        canvasHeight: 0,
        canvasWidth: 0,
        canvasX: 0,
        canvasY: 0
    };
    var videoGeometryParams = {
        origin: 'lt',
        x: 0,
        y: 0,
        w: 0,
        h: 0
    };

    socket.on('connect', function() {
        console.log('camera-receiver socket connected');
        // Checks when to mount the event listeners on the logic
        var socketMountCheckInterval = setInterval(function () {
            // Video element and vnc canvas must be mounted
            if (
                videoMounted &&
                document.querySelector('canvas') != null
            ) {
                console.log('mount socket logic');
                clearInterval(socketMountCheckInterval);
                if (!socketEventListenersRegistered) {
                    registerSocketEventListeners();
                }
                socket.emit('query_state');
                setInterval(adjustVideoGeometry, 500);
            }
        }, 500);
    });

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
                        video.classList.add('hidden');
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
                var video = document.getElementById('camera-feed');
                if (video == null) {
                    video = document.createElement('video');
                    video.setAttribute('id', 'camera-feed');
                    video.setAttribute('autoplay', '');
                    video.setAttribute('playsinline', '');
                    video.setAttribute(
                        'style',
                        'position: fixed;' +
                        'bottom: 0;' +
                        'right: 0;' +
                        'max-width: calc(150px + 10%);' +
                        'max-height: calc(150px + 20%);'
                    );
                    // Hide until the init socket event is received which will overwrite this
                    video.classList.add('visually-hidden');
                    document.body.appendChild(video);
                    // video.onclick = function(event) {
                    //  event.target.classList.toggle('fullscreen');
                    // }
                    videoMounted = true;
                }
                video.classList.remove('hidden');
                Janus.attachMediaStream(video, stream);
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

    function registerSocketEventListeners() {
        socket.on('command', function (data) {
            handleCommand(data.command, data.params);
        });

        socket.on('init', function (cameraState) {
            handleCommand(cameraState.geometry.command, cameraState.geometry.params);
            handleCommand(cameraState.visibility.command, cameraState.visibility.params);
        });

        socketEventListenersRegistered = true;
    }

    function handleCommand(command, params) {
        var video = document.getElementById('camera-feed');
        console.log('Got command:', command);
        console.log('With params:', params);
        switch(command) {
            case 'set_geometry_relative_to_window':
                var origin = params[0];
                var x = params[1];
                var y = params[2];
                var w = params[3];
                var h = params[4];

                setFixedPosition(video, origin, x, y, w, h);
                videoGeometryParams = { origin, x, y, w, h };
                videoActiveGeometry = command;

                break;
            case 'set_geometry_relative_to_canvas':
                var origin = params[0];
                var x = parseInt(params[1]);
                var y = parseInt(params[2]);
                var w = parseInt(params[3]);
                var h = parseInt(params[4]);

                handleSetGeometryRelativeToCanvas(origin, x, y, w, h);

                break;
            case 'show':
                video.classList.remove('visually-hidden');
                break;
            case 'hide':
                video.classList.add('visually-hidden');
                break;
            default:
                console.log(`Socket got unknown command '${command}'`);
                break;
        }
    }

    function handleSetGeometryRelativeToCanvas(origin, x, y, w, h) {
        var video = document.getElementById('camera-feed');
        // Site contains only one canvas - the vnc viewer
        var canvas = document.querySelector('canvas');
        videoGeometryParams = { origin, x, y, w, h };

        var vncWidth = parseInt(canvas.width);
        var vncHeight = parseInt(canvas.height);
        // Remove 'px' at the end before parsing to int
        var canvasWidth = parseInt(canvas.style.width.slice(0, -2));
        var canvasHeight = parseInt(canvas.style.height.slice(0, -2));

        // width in vnc * factor = width in html
        var factor = canvasWidth / vncWidth;

        x *= factor;
        y *= factor;
        w *= factor;
        h *= factor;

        var canvasRect = canvas.getBoundingClientRect();
        var xOrigin = origin.charAt(0);
        var yOrigin = origin.charAt(1);
        if (xOrigin === 'l') {
            x += canvasRect.left;
        } else if (xOrigin === 'r') {
            // Explanation
            // _____________________________________
            // |          <-        right        ->|
            // |<- left -><-   width   ->          | 
            // |                                   |
            // |          x x x x x x x x          |
            // |          x    canvas   x          |
            x += (canvasRect.right - canvasRect.width);
        } 

        if (yOrigin === 't') {
            y += canvasRect.top;
        } else if (yOrigin === 'b') {
            // Explanation analog to the one above
            y += (canvasRect.bottom - canvasRect.height);
        }

        setFixedPosition(video, origin, x, y, w, h);
        videoActiveGeometry = 'set_geometry_relative_to_canvas';
        previousCanvasGeometryState = {
            vncWidth,
            vncHeight,
            canvasWidth,
            canvasHeight,
            canvasX: canvasRect.x,
            canvasY: canvasRect.y
        };
    }

    function setFixedPosition(element, origin, x, y, w, h) {
        var style = ( 
            'position: fixed;' +
            `width: ${w}px;` +
            `height: ${h}px;`
        );
        
        var xOrigin = origin.charAt(0);
        var yOrigin = origin.charAt(1);
        if (xOrigin === 'l') {
            style += `left: ${x}px;`;
        } else if (xOrigin === 'r') {
            style += `right: ${x}px;`;
        } else {
            console.log('setFixedPosition unknown xOrigin', xOrigin);
            return;
        }
        if (yOrigin === 't') {
            style += `top: ${y}px;`;
        } else if (yOrigin === 'b') {
            style += `bottom: ${y}px;`;
        } else {
            console.log('setFixedPosition unknown yOrigin', yOrigin);
            return;
        }

        element.setAttribute('style', style);
    }

    function adjustVideoGeometry() {
        if (videoActiveGeometry === 'set_geometry_relative_to_canvas') {
            var canvas = document.querySelector('canvas');
            var canvasRect = canvas.getBoundingClientRect();
            var vncWidth = canvas.width;
            var vncHeight = canvas.height;
            var canvasWidth = canvasRect.width;
            var canvasHeight = canvasRect.height;
            var canvasX = canvasRect.x;
            var canvasY = canvasRect.y
            if (
                vncWidth !== previousCanvasGeometryState.vncWidth ||
                vncHeight !== previousCanvasGeometryState.vncHeight ||
                canvasWidth !== previousCanvasGeometryState.canvasWidth ||
                canvasHeight !== previousCanvasGeometryState.canvasHeight ||
                canvasX !== previousCanvasGeometryState.x ||
                canvasY !== previousCanvasGeometryState.y
            ) {
                handleSetGeometryRelativeToCanvas(
                    videoGeometryParams.origin,
                    videoGeometryParams.x,
                    videoGeometryParams.y,
                    videoGeometryParams.w,
                    videoGeometryParams.h
                );
            }
        }
    }
});

