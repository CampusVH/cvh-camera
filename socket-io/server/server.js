const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

const io = require('socket.io')(5005);

io.on('connection', (socket) => {
    socket.on('query', (data) => {
        console.log('Got query from socket:', data);
    });

    rl.on('line', function(line) {
        console.log('Got command from stdin:', line);
        const params = line.split(' ');
        const command = params.shift();
        console.log('command:', command);
        console.log('params:', params);
        socket.emit('command', {
            command,
            params
        });
    });
});
