export interface CommandDescriptor {
    command: string;
    params: string[];
}

type NullableString = string | null;

export class CameraSlotState {
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