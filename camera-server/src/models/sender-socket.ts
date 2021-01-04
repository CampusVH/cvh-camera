import { Socket } from 'socket.io';

export interface SenderSocket extends Socket {
    cameraSlot: number;
    cameraSlotToken: string;
};
