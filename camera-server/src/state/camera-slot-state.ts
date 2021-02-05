import { config } from '../config/config';
import { CommandDescriptor } from '../models/command-descriptor';

type NullableString = string | null;
type NullableNumber = number | null;

class SingleCameraSlotState {
    slotActive = false;
    token: NullableString = null;
    feedActive = false;
    feedId: NullableString = null;
    senderSocketId: NullableString = null;
    sessionId: NullableNumber = null;
    videoroomId: NullableNumber = null;
    controllerBitrateLimit = config.janusBitrate;
    userBitrateLimit = 0;
    annotation: NullableString = null;
    visibility: CommandDescriptor = {
        command: 'show',
        params: []
    };
    geometry: CommandDescriptor = {
        command: 'set_geometry_relative_to_canvas',
        params: ['rb', '0', '0', '320', '240']
    };

    getCurrentBitrate(): number {
        if (
            this.controllerBitrateLimit === 0 ||
            (this.userBitrateLimit > 0 &&
                this.userBitrateLimit < this.controllerBitrateLimit)
        ) {
            return this.userBitrateLimit;
        }
        return this.controllerBitrateLimit;
    }
}

const cameraSlotState: SingleCameraSlotState[] = [];

for (let i = 0; i < config.cameraSlots; i++) {
    cameraSlotState.push(new SingleCameraSlotState());
}

export { cameraSlotState };
