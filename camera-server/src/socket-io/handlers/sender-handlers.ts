import { cameraSlotState } from '../../state/camera-slot-state';
import { emitNewFeed, emitRemoveFeed } from './common-handlers';
import { SenderSocket } from '../../models/sender-socket';
import { ValidationError } from '../../models/validation-error';
import { notifyCustomName } from '../../io-interface/handlers/output-handlers';
import { escapeHTML } from '../../util/escape-html';

const handleSetFeedId = (
    socket: SenderSocket,
    data: null | { feedId?: string; customName?: string },
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

const handleSenderDisconnect = (socket: SenderSocket, _: string) => {
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

        emitRemoveFeed(slot);
    }
};

const registerSenderHandlers = (socket: SenderSocket) => {
    socket.on('set_feed_id', handleSetFeedId.bind(null, socket));
    socket.on('change_name', handleChangeName.bind(null, socket));
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
