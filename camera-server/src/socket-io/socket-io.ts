import { Server as SocketIOServer } from 'socket.io';

import { config } from '../config/config';

export const socketIO = new SocketIOServer(config.port);
