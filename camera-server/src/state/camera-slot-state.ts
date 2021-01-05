import { config } from '../config/config';
import { CommandDescriptor } from '../models/command-descriptor';

type NullableString = string | null;

class SingleCameraSlotState {
    slotActive = false;
    token: NullableString = null;
    feedActive = false;
    feedId: NullableString = null;
    senderSocketId: NullableString = null;
    visibility: CommandDescriptor = {
        command: 'show',
        params: []
    };
    geometry: CommandDescriptor = {
        command: 'set_geometry_relative_to_canvas',
        params: ['rb', '0', '0', '200', '200']
    };
}

const cameraSlotState: SingleCameraSlotState[] = [];

for (let i = 0; i < config.cameraSlots; i++) {
    cameraSlotState.push(new SingleCameraSlotState());
}

export { cameraSlotState };
