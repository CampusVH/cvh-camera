import * as janusAPI from './janus-api';
import { cameraSlotState } from '../state/camera-slot-state';

export const setBitrate = async (
    slot: number,
    newBitrate: number
): Promise<boolean> => {
    const currentSlotState = cameraSlotState[slot];
    if (!currentSlotState.feedActive) {
        console.log(
            `Error: Tried to set bitrate of feed on slot ${slot} which has no active feed`
        );
        return false;
    }
    console.log(`Setting bitrate of feed on slot ${slot} to ${newBitrate}`);
    try {
        const response = await janusAPI.configureVideoroomBitrate(
            currentSlotState.sessionId!,
            currentSlotState.videoroomId!,
            newBitrate
        );
        if (response.data?.janus === 'ack') {
            console.log(`Successfully set new bitrate of feed on slot ${slot}`);
            return true;
        } else {
            console.log(
                `Error: Could not set new bitrate of feed on slot ${slot}`
            );
            return false;
        }
    } catch (err) {
        console.log(
            `Error: An unknown error occurred while setting the bitrate of the feed on slot ${slot}:`,
            err
        );
        return false;
    }
};
