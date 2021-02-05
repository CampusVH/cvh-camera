import { socketIO } from '../../socket-io/socket-io';
import { cameraSlotState } from '../../state/camera-slot-state';
import {
    emitSetAnnotation,
    emitRemoveAnnotation
} from '../../socket-io/handlers/common-handlers';
import {
    disconnectSocket,
    emitControllerBitrateLimit
} from '../../socket-io/handlers/sender-handlers';
import { setBitrate } from '../../janus/handlers';
import { config } from '../../config/config';

const visibilityCommands = ['hide', 'show'];
const geometryCommands = [
    'set_geometry_relative_to_window',
    'set_geometry_relative_to_canvas'
];
const internalCommands = [
    'activate_slot',
    'deactivate_slot',
    'refresh_token',
    'set_annotation',
    'remove_annotation',
    'set_bitrate_limit'
];

const setAnnotation = (slot: number, annotation: string) => {
    console.log(`Setting annotation of slot ${slot} to ${annotation}`);
    cameraSlotState[slot].annotation = annotation;
    if (cameraSlotState[slot].feedActive) {
        emitSetAnnotation(slot, annotation);
    }
};

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
            currentCameraState.token = params.shift()!;
            if (params.length > 0) {
                setAnnotation(slot, params.join(' '));
            }
            currentCameraState.slotActive = true;
            break;
        case 'deactivate_slot':
            if (!currentCameraState.slotActive) {
                console.log('Error: Tried to deactivate inactive slot ' + slot);
                return;
            }
            console.log('Deactivating slot ' + slot);
            if (currentCameraState.feedActive) {
                disconnectSocket(currentCameraState.senderSocketId!);
            }

            currentCameraState.slotActive = false;
            currentCameraState.token = null;
            currentCameraState.feedActive = false;
            currentCameraState.feedId = null;
            currentCameraState.senderSocketId = null;
            currentCameraState.annotation = null;
            currentCameraState.controllerBitrateLimit = config.janusBitrate;
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
        case 'set_annotation':
            if (params.length === 0) {
                console.log(
                    'Error: Tried to set annotation without providing one'
                );
                return;
            }
            setAnnotation(slot, params.join(' '));
            break;
        case 'remove_annotation':
            console.log(`Removing annotation for slot ${slot}`);
            currentCameraState.annotation = null;
            if (currentCameraState.feedActive) {
                emitRemoveAnnotation(slot);
            }
            break;
        case 'set_bitrate_limit':
            if (!currentCameraState.slotActive) {
                console.log(
                    `Error: Tried to set controller bitrate limit for slot ${slot} which is not activated`
                );
                return;
            }

            if (params.length === 0) {
                console.log(
                    `Error: Tried to set controller bitrate limit for slot ${slot} without providing one`
                );
                return;
            }

            const bitrateLimit = parseInt(params[0]);
            if (isNaN(bitrateLimit)) {
                console.log(
                    `Error: Tried to set controller bitrate limit for slot ${slot} with a non-numeric bitrate (${params[0]})`
                );
                return;
            }

            const prevBitrate = currentCameraState.getCurrentBitrate();
            currentCameraState.controllerBitrateLimit = bitrateLimit;

            if (currentCameraState.feedActive) {
                emitControllerBitrateLimit(
                    currentCameraState.senderSocketId!,
                    bitrateLimit
                );

                // Can only update bitrate of a specific feed
                // Janus doesn't know about the concept of slots
                const newBitrate = currentCameraState.getCurrentBitrate();
                if (prevBitrate !== newBitrate) {
                    setBitrate(slot, newBitrate);
                }
            }

            break;
        default:
            console.log(
                'Error: handleInternalCommand got unknown command ' + command
            );
            break;
    }
};

export const handleCommand = (line: string) => {
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
        socketIO.emit('command', {
            slot,
            command,
            params
        });
    }
};
