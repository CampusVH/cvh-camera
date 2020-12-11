const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

const defaultPort = 5005;
let port;
if (process.env.PORT) {
    port = process.env.PORT;
    console.log('Using port ' + port + ' from PORT environment variable');
} else {
    port = defaultPort;
    console.log('Got no PORT environment variable - using default port ' + defaultPort);
}

const io = require('socket.io')(port);

const visibilityCommands = ['hide', 'show'];
const geometryCommands = [
    'set_geometry_relative_to_window',
    'set_geometry_relative_to_canvas'
];

const cameraState = {
    visibility: {
        command: 'show',
        params: []
    },
    geometry: {
        command: 'set_geometry_relative_to_canvas',
        params: ['rb', '0', '0', '200', '200']
    }
};

io.on('connection', (socket) => {
    socket.on('query_state', () => {
        console.log('Got state query from socket');
        socket.emit('init', cameraState);
    });
});

const handleCommand = (line) => {
    console.log('Got command from stdin:', line);
    const params = line.split(' ');
    const command = params.shift();
    console.log('command:', command);
    console.log('params:', params);

    if (visibilityCommands.includes(command)) {
        cameraState.visibility = {
            command,
            params
        };
    } else if(geometryCommands.includes(command)) {
        cameraState.geometry = {
            command,
            params
        };
    }

    console.log('new cameraState:', cameraState);
    
    io.emit('command', {
        command,
        params
    });
}

rl.on('line', handleCommand);

const cleanup = () => {
    console.log('cleanup');
    handleCommand('hide');
};

function exitHandler(options, exitCode) {
        cleanup();
        if (exitCode || exitCode === 0) console.log(exitCode);
        if (options.exit) process.exit();
}

// do something when app is closing
process.on('exit', exitHandler.bind(null,{cleanup:true}));

// catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, {exit:true}));
process.on('SIGUSR2', exitHandler.bind(null, {exit:true}));

// catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

// catches termination
process.on('SIGTERM', exitHandler.bind(null, {exit:true}));
