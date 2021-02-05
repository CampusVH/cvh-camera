import { cameraSlotState } from '../../state/camera-slot-state';
import { emitNewFeed, emitRemoveFeed } from './common-handlers';
import { SenderSocket } from '../../models/sender-socket';
import { ValidationError } from '../../models/validation-error';
import { notifyCustomName } from '../../io-interface/handlers/output-handlers';
import { escapeHTML } from '../../util/escape-html';
import { setBitrate } from '../../janus/handlers';
import { socketIO } from '../socket-io';
import { config } from '../../config/config';

export const disconnectSocket = (socketId: string) => {
    const socket = socketIO.sockets.sockets.get(socketId);
    if (socket) {
        socket.disconnect();
    } else {
        console.log('Error: Tried to disconnect socket that does not exist');
    }
};

export const emitControllerBitrateLimit = (
    socketId: string,
    bitrateLimit: number
) => {
    socketIO
        .to(socketId)
        .emit('new_controller_bitrate_limit', { bitrateLimit });
};

const handleSetFeedId = (
    socket: SenderSocket,
    data: null | {
        feedId?: string;
        sessionId?: number;
        videoroomId?: number;
        customName?: string;
    },
    fn: Function
) => {
    let success = true;
    let message = '';

    try {
        const slot = socket.cameraSlot;
        const currentSlotState = cameraSlotState[slot];

        if (currentSlotState.token !== socket.cameraSlotToken) {
            console.log(
                'Error: Got set_feed_id event for slot ' +
                    slot +
                    ' with an old token'
            );
            throw new ValidationError(
                'The provided token is not valid anymore - the feed is not transmitted'
            );
        }

        if (currentSlotState.feedActive) {
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

        const sessionId = data.sessionId;
        if (sessionId == null) {
            console.log(
                'Error: Got set_feed_id without a session id on slot ' + slot
            );
            throw new ValidationError('No session id was provided');
        }
        if (typeof sessionId !== 'number') {
            console.log(
                'Error: Got set_feed_id event with a non-numeric session id on slot ' +
                    slot
            );
            throw new ValidationError('Session id has to be a number');
        }

        const videoroomId = data.videoroomId;
        if (videoroomId == null) {
            console.log(
                'Error: Got set_feed_id event with no handle id on slot ' + slot
            );
            throw new ValidationError('No handle id was provided');
        }
        if (typeof videoroomId !== 'number') {
            console.log(
                'Error: Got set_feed_id event with a non-numeric handle id on slot ' +
                    slot
            );
            throw new ValidationError('Handle id has to be a number');
        }

        let unescapedCustomName = data.customName;
        if (unescapedCustomName != null) {
            unescapedCustomName = unescapedCustomName.trim();
            if (unescapedCustomName.length > 0) {
                console.log(
                    `Got custom name from slot ${slot}: ${unescapedCustomName}`
                );
                const customName = escapeHTML(unescapedCustomName);
                if (unescapedCustomName !== customName) {
                    console.log(
                        `Warning: Escaped custom name (${customName}) does not equal the unescaped custom name` +
                            `(${unescapedCustomName}) on slot ${slot} - this could mean that the user tried a Cross-Site-Scripting (XSS) attack`
                    );
                }
                notifyCustomName(slot, customName);
            } else {
                console.log(
                    'Error: Got a name that is either empty or consists only of whitespaces'
                );
            }
        }

        console.log('Setting feed id of slot ' + slot + ' to ' + feedId);
        message = 'Successfully set feed id - you are now using this slot';

        currentSlotState.feedActive = true;
        currentSlotState.feedId = feedId;
        currentSlotState.senderSocketId = socket.id;
        currentSlotState.sessionId = sessionId;
        currentSlotState.videoroomId = videoroomId;

        emitNewFeed(slot);

        // Controller set bitrate before feed is sent
        // => bitrate of the transmitted feed has to be adjusted
        if (currentSlotState.controllerBitrateLimit !== config.janusBitrate) {
            setBitrate(slot, currentSlotState.controllerBitrateLimit);
        }
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

const handleChangeName = (
    socket: SenderSocket,
    data: null | { newName?: string }
) => {
    const slot = socket.cameraSlot;
    const currentSlotState = cameraSlotState[slot];

    if (!currentSlotState.feedActive) {
        console.log(
            'Error: Got change_name event on slot ' +
                slot +
                ' which has no active feed'
        );
        return;
    }

    if (socket.id !== currentSlotState.senderSocketId) {
        console.log(
            'Error: Got change_name event on slot ' +
                slot +
                ' from somebody who is not the sender'
        );
        return;
    }

    if (data == null) {
        console.log(
            'Error: Got change_name event with no data on slot ' + slot
        );
        return;
    }

    let unescapedNewName = data.newName;
    if (unescapedNewName == null) {
        console.log(
            'Error: Got change_name event with no new name on slot' + slot
        );
        return;
    }

    unescapedNewName = unescapedNewName.trim();
    if (unescapedNewName.length > 0) {
        console.log(`Got new name for slot ${slot}: ${unescapedNewName}`);
        const newName = escapeHTML(unescapedNewName);
        if (unescapedNewName !== newName) {
            console.log(
                `Warning: Escaped new name (${newName}) does not equal the unescaped new name` +
                    `(${unescapedNewName}) on slot ${slot} - this could mean that the user tried a Cross-Site-Scripting (XSS) attack`
            );
        }
        notifyCustomName(slot, newName);
    } else {
        console.log(
            'Error: Got a name that is either empty or consists only of whitespaces'
        );
    }
};

const handleSetBitrateLimit = async (
    socket: SenderSocket,
    data: null | { bitrateLimit?: number },
    fn: Function
) => {
    let success = true;
    let message = '';

    try {
        const slot = socket.cameraSlot;
        const currentSlotState = cameraSlotState[slot];

        if (!currentSlotState.feedActive) {
            console.log(
                `Error: Got set_bitrate_limit event on slot ${slot} which has no active feed`
            );
            throw new ValidationError(
                'There is no camera feed being transmitted'
            );
        }

        if (socket.id !== currentSlotState.senderSocketId) {
            console.log(
                `Error: Got set_bitrate_limit event on slot ${slot} from somebody who is not the sender`
            );
            throw new ValidationError('You are not the sender of this slot');
        }

        if (data == null) {
            console.log(
                `Error: Got set_bitrate_limit event on slot ${slot} without data`
            );
            throw new ValidationError('Got no data in the request');
        }

        let { bitrateLimit } = data;
        if (bitrateLimit == null) {
            console.log(
                `Error: Got set_bitrate_limit event on slot ${slot} without bitrate limit`
            );
            throw new ValidationError('Got no bitrate limit in the request');
        }
        if (typeof bitrateLimit !== 'number') {
            console.log(
                `Error: Got set_bitrate_limit event on slot ${slot} with a non-numeric bitrate (${bitrateLimit})`
            );
            throw new ValidationError('The provided bitrate is not a number');
        }

        if (bitrateLimit < 0) {
            bitrateLimit = 0;
        }

        const prevBitrate = currentSlotState.getCurrentBitrate();
        currentSlotState.userBitrateLimit = bitrateLimit;
        const newBitrate = currentSlotState.getCurrentBitrate();

        message = 'Your bitrate limit was updated';

        if (prevBitrate !== newBitrate) {
            setBitrate(slot, newBitrate);
        }
    } catch (err) {
        if (err instanceof ValidationError) {
            success = false;
            message = err.message;
        } else {
            throw err;
        }
    }

    fn({ success, message });
};

const handleSenderDisconnect = (socket: SenderSocket) => {
    const slot = socket.cameraSlot;
    const currentSlotState = cameraSlotState[slot];
    if (
        currentSlotState.feedActive &&
        socket.id === currentSlotState.senderSocketId
    ) {
        console.log('Sender on slot ' + slot + ' disconnected - Clearing slot');
        currentSlotState.feedActive = false;
        currentSlotState.feedId = null;
        currentSlotState.senderSocketId = null;
        currentSlotState.sessionId = null;
        currentSlotState.videoroomId = null;
        currentSlotState.userBitrateLimit = 0;

        emitRemoveFeed(slot);
    }
};

const registerSenderHandlers = (socket: SenderSocket) => {
    socket.on('set_feed_id', handleSetFeedId.bind(null, socket));
    socket.on('change_name', handleChangeName.bind(null, socket));
    socket.on('set_bitrate_limit', handleSetBitrateLimit.bind(null, socket));
    socket.on('disconnect', handleSenderDisconnect.bind(null, socket));
};

export const handleSenderInit = (
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
                'An invalid camera slot was provided (' + slotStr + ')'
            );
        }
        if (slot < 0 || slot > cameraSlotState.length - 1) {
            console.log(
                'Error: Got socket connection with slot ' +
                    slot +
                    ' which is not in the list of slots'
            );
            throw new ValidationError('This camera slot does not exist');
        }

        const slotState = cameraSlotState[slot];
        if (!slotState.slotActive) {
            console.log(
                'Error: Got socket connection for inactive slot ' + slot
            );
            throw new ValidationError(
                'This camera slot is not activated, contact your moderator'
            );
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
            throw new ValidationError('Invalid token, contact your moderator');
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
