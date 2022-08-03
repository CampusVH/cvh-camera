import { Socket } from 'socket.io';
import * as readline from 'readline';

import { socketIO } from './socket-io/socket-io';
import { handleSenderInit } from './socket-io/handlers/sender-handlers';
import { handleQueryState } from './socket-io/handlers/common-handlers';
import { handleCommand } from './io-interface/handlers/input-handlers';
import { registerCleanupLogic } from './util/cleanup';
import { room } from './janus/janus-room';

(async () => {
    try {
        await room.init();
    } catch (err) {
        console.log(err);
        console.log('Exiting process');
        process.exit(1);
    }

    socketIO.on('connection', (socket: Socket) => {
        socket.on('query_state', handleQueryState);

        socket.on('sender_init', handleSenderInit.bind(null, socket));
    });


    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });
    readlineInterface.on('line', handleCommand);

    registerCleanupLogic();
})();
