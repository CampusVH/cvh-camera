import * as janusAPI from './janus-api';
import { cameraSlotState } from '../state/camera-slot-state';

export const setBitrate = async (
    slot: number,
    newBitrate: number
): Promise<boolean> => {
    const currentSlotState = cameraSlotState[slot];
    if (!currentSlotState.feedActive) {
        console.log(`Tried to set bitrate for inactive slot ${slot}`);
        return false;
    }
    try {
        const response = await janusAPI.configureVideoroomBitrate(
            currentSlotState.sessionId!,
            currentSlotState.videoroomId!,
            newBitrate
        );
        if (response.data?.janus === 'ack') {
            console.log('Set new bitrate for slot ' + slot);
            return true;
        } else {
            console.log(`Error: Could not set new bitrate for slot ${slot}`);
            return false;
        }
    } catch (err) {
        console.log(
            `Error: An unknown error occurred while setting the bitrate of slot ${slot}:`,
            err
        );
        return false;
    }
};
