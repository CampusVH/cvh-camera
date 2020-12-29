const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

let port = 5006;
if (process.env.PORT) {
    port = +process.env.PORT;
    console.log('Using port ' + port + ' from PORT environment variable');
} else {
    console.log('Got no PORT environment variable - using default port ' + port);
}

let cameraSlots = 2;
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

io.on('connection', (socket) => {
    socket.on('query_state', () => {
        console.log('Got state query from socket');
        socket.emit('init', cameraStates);
    });
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
            currentCameraState.token = null;
            currentCameraState.slotActive = false;
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
    const emitCommand = false;

    console.log('Got command from stdin:', line);
    const params = line.split(' ');
    const command = params.shift();
    if (params.length === 0) {
        console.log('Error: Got no slot to apply the command on');
        return;
    }
    const slot = +params.shift();
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
    
    if (emitCommand) {
        io.emit('command', {
            command,
            params
        });
    }
}

rl.on('line', handleCommand);

const cleanup = () => {
    console.log('cleanup');
    io.emit('hide_all');
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
