import { Server as SocketIOServer, Socket } from 'socket.io';

import { mountCleanupLogic } from './util/cleanup';
import { ValidationError } from './models/validation-error';
import { CameraSlotState, CommandDescriptor } from './models/camera-slot-state';
import { SenderSocket } from './models/sender-socket';
import { config } from './config/config';

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

const io = new SocketIOServer(config.port);

const visibilityCommands = ['hide', 'show'];
const geometryCommands = [
    'set_geometry_relative_to_window',
    'set_geometry_relative_to_canvas'
];
const internalCommands = ['activate_slot', 'deactivate_slot', 'refresh_token'];

let cameraSlotState: CameraSlotState[] = [];
for (let i = 0; i < config.cameraSlots; i++) {
    cameraSlotState.push(new CameraSlotState());
}

const emitNewFeed = (slot: number) => {
    const cameraState = cameraSlotState[slot];
    io.emit('new_feed', {
        slot,
        feedId: cameraState.feedId,
        visibility: cameraState.visibility,
        geometry: cameraState.geometry
    });
};

const emitRemoveFeed = (slot: number) => {
    io.emit('remove_feed', { slot });
};

const handleSetFeedId = (
    socket: SenderSocket,
    data: null | { feedId?: string },
    fn: Function
) => {
    let success = true;
    let message = '';

    try {
        const slot = socket.cameraSlot;
        const currentCameraState = cameraSlotState[slot];

        if (currentCameraState.token !== socket.cameraSlotToken) {
            console.log(
                'Error: Got set_feed_id event for slot ' +
                    slot +
                    ' with an old token'
            );
            throw new ValidationError(
                'The provided token is not valid anymore - the feed is not transmitted'
            );
        }

        if (currentCameraState.feedActive) {
            console.log(
                'Error: Got set_feed_id event for slot ' +
                    slot +
                    ' which already has an active feed'
            );
            throw new ValidationError(
                'There is already somebody using this slot'
            );
        }

        if (data == null) {
            console.log(
                'Error: Got set_feed_id event for slot ' +
                    slot +
                    ' without data'
            );
            throw new ValidationError(
                'Could not get feed id because no data was provided'
            );
        }

        const feedId = data.feedId;
        if (feedId == null) {
            console.log(
                'Error: Got set_feed_id event without a feed id on slot ' + slot
            );
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

const handleSenderDisconnect = (socket: SenderSocket, _: string) => {
    const slot = socket.cameraSlot;
    if (slot != null) {
        const currentCameraState = cameraSlotState[slot];
        if (
            currentCameraState.feedActive &&
            socket.id === currentCameraState.senderSocketId
        ) {
            console.log(
                'Sender on slot ' + slot + ' disconnected - Clearing slot'
            );
            currentCameraState.feedActive = false;
            currentCameraState.feedId = null;
            currentCameraState.senderSocketId = null;

            emitRemoveFeed(slot);
        }
    }
};

const registerSenderHandlers = (socket: SenderSocket) => {
    socket.on('set_feed_id', handleSetFeedId.bind(null, socket));
    socket.on('disconnect', handleSenderDisconnect.bind(null, socket));
};

const handleSenderInit = (
    socket: SenderSocket,
    data: null | { slot?: string; token?: string },
    fn: Function
) => {
    let success = true;
    let message = '';
    try {
        if (data == null) {
            console.log('Error: Got socket connection without data');
            throw new ValidationError('No data provided');
        }

        const slotStr = data.slot;
        if (slotStr == null) {
            console.log('Error: Got socket connection without a slot');
            throw new ValidationError('No slot provided');
        }

        const slot = parseInt(slotStr);
        if (isNaN(slot)) {
            console.log(
                'Error: Got socket connection with slot ' +
                    slotStr +
                    ' that cannot be parsed to a number'
            );
            throw new ValidationError(
                'Slot ' + slotStr + ' cannot be parsed to number'
            );
        }
        if (slot < 0 || slot > cameraSlotState.length - 1) {
            console.log(
                'Error: Got socket connection with slot ' +
                    slot +
                    ' which is not in the list of slots'
            );
            throw new ValidationError(
                'Slot ' + slot + ' is not in the list of slots'
            );
        }

        const slotState = cameraSlotState[slot];
        if (!slotState.slotActive) {
            console.log(
                'Error: Got socket connection for inactive slot ' + slot
            );
            throw new ValidationError('Slot ' + slot + ' is not active');
        }

        const token = data.token;
        if (token == null) {
            console.log('Error: Got socket connection without token');
            throw new ValidationError('No token provided');
        }
        if (slotState.token !== token) {
            console.log(
                'Error: Got socket connecion with wrong token ' +
                    token +
                    ' for slot ' +
                    slot
            );
            throw new ValidationError('Invalid token');
        }

        console.log('Got sender socket connection on slot ' + slot);

        message = 'Socket authenticated';
        socket.cameraSlot = slot;
        socket.cameraSlotToken = token;

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

const handleQueryState = (fn: Function) => {
    console.log('Got state query from socket');
    let response: {
        [index: number]: {
            feedId: string | null;
            visibility: CommandDescriptor;
            geometry: CommandDescriptor;
        };
    } = {};
    for (let i = 0; i < cameraSlotState.length; i++) {
        const cameraState = cameraSlotState[i];
        if (cameraState.feedActive) {
            response[i] = {
                feedId: cameraState.feedId,
                visibility: cameraState.visibility,
                geometry: cameraState.geometry
            };
        }
    }
    fn(response);
};

io.on('connection', (socket: Socket) => {
    socket.on('query_state', handleQueryState);

    socket.on('sender_init', handleSenderInit.bind(null, socket));
});

const handleInternalCommand = (
    command: string,
    slot: number,
    params: string[]
) => {
    const currentCameraState = cameraSlotState[slot];
    switch (command) {
        case 'activate_slot':
            if (currentCameraState.slotActive) {
                console.log('Error: Tried to activate active slot ' + slot);
                return;
            }
            if (params.length === 0) {
                console.log(
                    'Error while activating slot ' +
                        slot +
                        ' - Got no token parameter'
                );
                return;
            }
            currentCameraState.token = params[0];
            currentCameraState.slotActive = true;
            break;
        case 'deactivate_slot':
            if (!currentCameraState.slotActive) {
                console.log('Error: Tried to deactivate inactive slot ' + slot);
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
                console.log(
                    'Error: Tried to refresh token for inactive slot ' + slot
                );
                return;
            }
            if (params.length === 0) {
                console.log(
                    'Error while refreshing token for slot ' +
                        slot +
                        ' - Got no token parameter'
                );
                console.log('Keeping old token');
                return;
            }
            console.log('Refreshing token for slot ' + slot);
            currentCameraState.token = params[0];
            break;
        default:
            console.log(
                'Error: handleInternalCommand got unknown command ' + command
            );
            break;
    }
};

const handleCommand = (line: string) => {
    let emitCommand = false;

    console.log('Got command from stdin:', line);
    const params = line.split(' ');

    const command = params.shift();
    if (command == null) {
        console.log('Error: Got malformed line with no command');
        return;
    }

    const slotStr = params.shift();
    if (slotStr == null) {
        console.log('Error: Got no slot to apply the command on');
        return;
    }

    const slot = parseInt(slotStr);
    if (isNaN(slot)) {
        console.log(
            'Error: Could not parse slot ' + slotStr + ' to an integer'
        );
        return;
    }
    if (slot < 0 || slot > cameraSlotState.length - 1) {
        console.log(
            `Error: Got invalid slot number ${slot}. There are ${cameraSlotState.length} camera slots.`
        );
        return;
    }

    console.log('command:', command);
    console.log('slot:', slot);
    console.log('params:', params);

    const currentCameraState = cameraSlotState[slot];

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
};

rl.on('line', handleCommand);

mountCleanupLogic(io);
