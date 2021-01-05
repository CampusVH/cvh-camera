import { socketIO } from '../socket-io';
import { cameraSlotState } from '../../state/camera-slot-state';
import { CommandDescriptor } from '../../models/command-descriptor';

export const emitNewFeed = (slot: number) => {
    const cameraState = cameraSlotState[slot];
    socketIO.emit('new_feed', {
        slot,
        feedId: cameraState.feedId,
        visibility: cameraState.visibility,
        geometry: cameraState.geometry
    });
};

export const emitRemoveFeed = (slot: number) => {
    socketIO.emit('remove_feed', { slot });
};

export const handleQueryState = (fn: Function) => {
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
