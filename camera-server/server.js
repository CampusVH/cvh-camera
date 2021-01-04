const ValidationError = require('./models/validation-error');

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let port = 5000;
if (process.env.PORT) {
    port = +process.env.PORT;
    console.log('Using port ' + port + ' from PORT environment variable');
} else {
    console.log('Got no PORT environment variable - using default port ' + port);
}

let cameraSlots = 4;
if (process.env.CAMERA_SLOTS) {
    cameraSlots = +process.env.CAMERA_SLOTS;
    console.log('Using camera count ' + cameraSlots + ' from CAMERA_SLOTS environment variable');
} else {
    console.log('Got no CAMERA_SLOTS environment variable - using default count of ' + cameraSlots);
}

const io = require('socket.io')(port);

const visibilityCommands = ['hide', 'show'];
const geometryCommands = [
    'set_geometry_relative_to_window',
    'set_geometry_relative_to_canvas'
];
const internalCommands = [
    'activate_slot',
    'deactivate_slot',
    'refresh_token'
];

let cameraStates = [];
for (let i = 0; i < cameraSlots; i++) {
    cameraStates.push({
        slotActive: false,
        token: null,
        feedActive: false,
        feedId: null,
        senderSocketId: null,
        visibility: {
            command: 'show',
            params: []
        },
        geometry: {
            command: 'set_geometry_relative_to_canvas',
            params: ['rb', '0', '0', '200', '200']
        }
    });
}

const emitNewFeed = (slot) => {
    const cameraState = cameraStates[slot];
    io.emit('new_feed', {
        slot,
        feedId: cameraState.feedId,
        visibility: cameraState.visibility,
        geometry: cameraState.geometry
    });
};

const emitRemoveFeed = (slot) => {
    io.emit('remove_feed', { slot });
};

const handleSetFeedId = (socket, data, fn) => {
    let success = true;
    let message = '';

    try {
        const slot = socket.cameraSlot;
        const currentCameraState = cameraStates[slot];

        if (currentCameraState.token !== socket.cameraSlotToken) {
            console.log('Error: Got set_feed_id event for slot ' + slot + ' with an old token');
            throw new ValidationError('The provided token is not valid anymore - the feed is not transmitted');
        }

        if (currentCameraState.feedActive) {
            console.log('Error: Got set_feed_id event for slot ' + slot + ' which already has an active feed');
            throw new ValidationError('There is already somebody using this slot');
        }

        if (data == null) {
            console.log('Error: Got set_feed_id event for slot ' + slot + ' without data');
            throw new ValidationError('Could not get feed id because no data was provided');
        }

        const feedId = data.feedId;
        if (feedId == null) {
            console.log('Error: Got set_feed_id event without a feed id on slot ' + slot);
            throw new ValidationError('No feed id was provided');
        }

        console.log('Setting feed id of slot ' + slot + ' to ' + feedId);
        message = 'Successfully set feed id - you are now using this slot';

        currentCameraState.feedActive = true;
        currentCameraState.feedId = feedId;
        currentCameraState.senderSocketId = socket.id;

        emitNewFeed(slot);
    } catch (e) {
        if (e instanceof ValidationError) {
            success = false;
            message = e.message;
        } else {
            throw e;
        }
    }

    fn({ success, message });
};

const handleSenderDisconnect = (socket, reason) => {
    const slot = socket.cameraSlot;
    if (slot != null) {
        const currentCameraState = cameraStates[slot];
        if (currentCameraState.feedActive && socket.id === currentCameraState.senderSocketId) {
            console.log('Sender on slot ' + slot + ' disconnected - Clearing slot');
            currentCameraState.feedActive = false;
            currentCameraState.feedId = null;
            currentCameraState.senderSocketId = null;

            emitRemoveFeed(slot);
        }
    }
};

const registerSenderHandlers = (socket) => {
    socket.on('set_feed_id', handleSetFeedId.bind(null, socket));
    socket.on('disconnect', handleSenderDisconnect.bind(null, socket));
};

const handleSenderInit = (socket, data, fn) => {
    let success = true;
    let message = '';
    try {
        const slotStr = data.slot;
        if (isNaN(slotStr)) {
            console.log('Error: Got socket connection with slot ' + slotStr + ' that cannot be parsed to a number');
            throw new ValidationError('Slot ' + slotStr + ' cannot be parsed to number');
        }

        const slot = parseInt(slotStr);
        if (slot < 0 || slot > cameraStates.length - 1) {
            console.log('Error: Got socket connection with slot ' + slot + ' which is not in the list of slots');
            throw new ValidationError('Slot ' + slot + ' is not in the list of slots');
        }

        const currentCameraState = cameraStates[slot];
        if (!currentCameraState.slotActive) {
            console.log('Error: Got socket connection for inactive slot ' + slot);
            throw new ValidationError('Slot ' + slot + ' is not active');
        }

        const token = data.token;
        if (currentCameraState.token !== token) {
            console.log('Error: Got socket connecion with wrong token ' + token + ' for slot ' + slot);
            throw new ValidationError('Invalid token');
        }

        console.log('Got sender socket connection on slot ' + slot);
        
        message = 'Socket authenticated';
        socket.cameraSlot = slot;
        socket.cameraSlotToken = data.token;

        registerSenderHandlers(socket);
    } catch (e) {
        if (e instanceof ValidationError) {
            success = false;
            message = e.message;
        } else {
            throw e;
        }
    }

    fn({ success, message });
};

const handleQueryState = (fn) => {
    console.log('Got state query from socket');
    let response = {};
    for (let i = 0; i < cameraStates.length; i++) {
        const cameraState = cameraStates[i];
        if (cameraState.feedActive) {
            response[i] = {
                feedId: cameraState.feedId,
                visibility: cameraState.visibility,
                geometry: cameraState.geometry
            };
        }
    }
    fn(response);
}

io.on('connection', (socket) => {
    socket.on('query_state', handleQueryState);

    socket.on('sender_init', handleSenderInit.bind(null, socket));
});

const handleInternalCommand = (command, slot, params) => {
    const currentCameraState = cameraStates[slot];
    switch (command) {
        case 'activate_slot':
            if (currentCameraState.slotActive) {
                console.log('Error: Tried to activate active slot ' + slot);
                return;
            }
            if (params.length === 0) {
                console.log('Error while activating slot ' + slot + ' - Got no token parameter');
                return;
            }
            currentCameraState.token = params[0];
            currentCameraState.slotActive = true;
            break;
        case 'deactivate_slot':
            if (!currentCameraState.slotActive) {
                console.log('Error: Tried to deactivate inactive slot ' + slot );
                return;
            }
            console.log('Deactivating slot ' + slot);
            emitRemoveFeed(slot);

            currentCameraState.slotActive = false;
            currentCameraState.token = null;
            currentCameraState.feedActive = false;
            currentCameraState.feedId = null;
            currentCameraState.senderSocketId = null;
            break;
        case 'refresh_token':
            if (!currentCameraState.slotActive) {
                console.log('Error: Tried to refresh token for inactive slot ' + slot);
                return;
            }
            if (params.length === 0) {
                console.log('Error while refreshing token for slot ' + slot + ' - Got no token parameter');
                console.log('Keeping old token');
                return;
            }
            console.log('Refreshing token for slot ' + slot);
            currentCameraState.token = params[0];
            break;
        default:
            console.log('Error: handleInternalCommand got unknown command ' + command);
            break;
    }
};

const handleCommand = (line) => {
    let emitCommand = false;

    console.log('Got command from stdin:', line);
    const params = line.split(' ');
    const command = params.shift();
    if (params.length === 0) {
        console.log('Error: Got no slot to apply the command on');
        return;
    }
    const slotStr = params.shift();
    if (isNaN(slotStr)) {
        console.log('Error: Could not parse slot ' + slotStr + ' to an integer');
        return;
    }
    const slot = parseInt(slotStr);
    console.log('command:', command);
    console.log('slot:', slot);
    console.log('params:', params);

    if (slot < 0 || slot > cameraStates.length - 1) {
        console.log(`Error: Got invalid slot number ${slot}. There are ${cameraStates.length} camera slots.`);
        return;
    }

    const currentCameraState = cameraStates[slot];

    if (visibilityCommands.includes(command)) {
        currentCameraState.visibility = {
            command,
            params
        };
        emitCommand = true;
    } else if (geometryCommands.includes(command)) {
        currentCameraState.geometry = {
            command,
            params
        };
        emitCommand = true;
    } else if (internalCommands.includes(command)) {
        handleInternalCommand(command, slot, params);
    } else {
        console.log('Command "' + command + '" is not a valid command');
        return;
    }

    console.log('new cameraState:', currentCameraState);
    
    if (currentCameraState.feedActive && emitCommand) {
        io.emit('command', {
            slot,
            command,
            params
        });
    }
}

rl.on('line', handleCommand);

const cleanup = () => {
    console.log('cleanup');
    io.emit('remove_all_feeds');
};

const exitHandler = (options, exitCode) => {
        if (options.cleanup) cleanup();
        if (exitCode || exitCode === 0) console.log(exitCode);
        if (options.exit) process.exit();
}

// do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup:true }));

// catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit:true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit:true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit:true }));

// catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, { exit:true }));

// catches termination
process.on('SIGTERM', exitHandler.bind(null, { exit:true }));
