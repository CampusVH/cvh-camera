import { socketIO } from '../socket-io';
import { cameraSlotState } from '../../state/camera-slot-state';
import { CommandDescriptor } from '../../models/command-descriptor';
import {
    notifyNewFeed,
    notifyRemoveFeed
} from '../../io-interface/handlers/output-handlers';

export const emitNewFeed = (slot: number) => {
    const slotState = cameraSlotState[slot];
    socketIO.emit('new_feed', {
        slot,
        feedId: slotState.feedId,
        visibility: slotState.visibility,
        geometry: slotState.geometry,
        annotation: slotState.annotation
    });
    notifyNewFeed(slot);
};

export const emitRemoveFeed = (slot: number) => {
    socketIO.emit('remove_feed', { slot });
    notifyRemoveFeed(slot);
};

export const emitSetAnnotation = (slot: number, annotation: string) => {
    socketIO.emit('set_annotation', { slot, annotation });
};

export const emitRemoveAnnotation = (slot: number) => {
    socketIO.emit('remove_annotation', { slot });
};

export const handleQueryState = (fn: Function) => {
    console.log('Got state query from socket');
    let response: {
        [index: number]: {
            feedId: string | null;
            visibility: CommandDescriptor;
            geometry: CommandDescriptor;
            annotation: string | null;
        };
    } = {};
    for (let i = 0; i < cameraSlotState.length; i++) {
        const slotState = cameraSlotState[i];
        if (slotState.feedActive) {
            response[i] = {
                feedId: slotState.feedId,
                visibility: slotState.visibility,
                geometry: slotState.geometry,
                annotation: slotState.annotation
            };
        }
    }
    fn(response);
};
