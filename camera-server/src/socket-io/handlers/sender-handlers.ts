import { cameraSlotState } from '../../state/camera-slot-state';
import { emitNewFeed, emitRemoveFeed } from './common-handlers';
import { SenderSocket } from '../../models/sender-socket';
import { ValidationError } from '../../models/validation-error';

const handleSetFeedId = (
    socket: SenderSocket,
    data: null | { feedId?: string },
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

        console.log('Setting feed id of slot ' + slot + ' to ' + feedId);
        message = 'Successfully set feed id - you are now using this slot';

        currentSlotState.feedActive = true;
        currentSlotState.feedId = feedId;
        currentSlotState.senderSocketId = socket.id;

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
        const currentSlotState = cameraSlotState[slot];
        if (
            currentSlotState.feedActive &&
            socket.id === currentSlotState.senderSocketId
        ) {
            console.log(
                'Sender on slot ' + slot + ' disconnected - Clearing slot'
            );
            currentSlotState.feedActive = false;
            currentSlotState.feedId = null;
            currentSlotState.senderSocketId = null;

            emitRemoveFeed(slot);
        }
    }
};

const registerSenderHandlers = (socket: SenderSocket) => {
    socket.on('set_feed_id', handleSetFeedId.bind(null, socket));
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
