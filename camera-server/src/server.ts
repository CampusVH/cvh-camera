import { Socket } from 'socket.io';

import { socketIO } from './socket-io/socket-io';
import { handleSenderInit } from './socket-io/handlers/sender-handlers';
import { handleQueryState } from './socket-io/handlers/common-handlers';
import { readlineInterface } from './io-interface/readline-interface';
import { handleCommand } from './io-interface/handlers/input-handlers';
import { registerCleanupLogic } from './util/cleanup';

socketIO.on('connection', (socket: Socket) => {
    socket.on('query_state', handleQueryState);

    socket.on('sender_init', handleSenderInit.bind(null, socket));
});

readlineInterface.on('line', handleCommand);

registerCleanupLogic();
