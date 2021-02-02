import axios from 'axios';

import * as janusAPI from './janus-api';
import { AxiosResponse } from 'axios';
import { config } from '../config/config';

class JanusRoom {
    private sessionId: number;
    private videoroomId: number;
    private _sessionAlive = false;
    private source = axios.CancelToken.source();

    get sessionAlive() {
        return this._sessionAlive;
    }

    async init() {
        await this.createSession();
        this.doSessionLongPoll();
        await this.attachVideoroomPlugin();
        await this.createRoom();
    }

    private async createSession() {
        const { data } = await janusAPI.createSession();

        if (data?.janus === 'success') {
            this.sessionId = data.data.id;
            this._sessionAlive = true;
            console.log(
                `Established session with janus server (session id: ${this.sessionId})`
            );
        } else {
            throw new Error(
                `Could not create janus session. Server response: ${JSON.stringify(
                    data,
                    null,
                    2
                )}`
            );
        }
    }

    private async doSessionLongPoll() {
        console.log('Starting janus long polling to keep session alive');
        try {
            let response: AxiosResponse;
            do {
                // Response data will be an array of events with maximum length of 10
                // If no events occured for 30s, the array will contain one keepalive event
                response = await janusAPI.sessionLongPoll(
                    this.sessionId,
                    this.source.token
                );
            } while (response.data.length >= 0);
        } catch (err) {
            if (axios.isCancel(err)) {
                console.log(
                    'Janus session long poll got canceled:',
                    err.message
                );
            } else {
                console.log(
                    'Error: An unexpected error occured while performing janus long poll'
                );
            }
        }
        console.log(
            'Warning: Janus session will timeout because long poll got no response'
        );
        this._sessionAlive = false;
    }

    private async attachVideoroomPlugin() {
        const { data } = await janusAPI.attachVideoroomPlugin(this.sessionId);

        if (data?.janus === 'success') {
            this.videoroomId = data.data.id;
            console.log(
                `Attached janus videoroom plugin (plugin id: ${this.videoroomId})`
            );
        } else {
            throw new Error(
                `Could not attach janus videoroom plugin. Janus response: ${JSON.stringify(
                    data,
                    null,
                    2
                )}`
            );
        }
    }

    private async createRoom() {
        console.log('Trying to destroy old janus room');
        const { data: destroyData } = await janusAPI.destroyRoom(
            this.sessionId,
            this.videoroomId,
            config.janusRoom,
            config.janusRoomSecret
        );
        const pluginData = destroyData?.plugindata?.data;
        // Room could not be destroyed (excluding the case where the room was just not existing)
        if (
            destroyData?.janus === 'success' &&
            (pluginData.videoroom === 'destroyed' ||
                (pluginData.videoroom === 'event' &&
                    pluginData.error_code === 426))
        ) {
            console.log(
                `Janus room ${config.janusRoom} was destroyed or not existing`
            );
        } else {
            throw new Error(
                `Could not destroy old janus room. Janus response: ${JSON.stringify(
                    destroyData,
                    null,
                    2
                )}`
            );
        }

        console.log('Creating new janus room');
        const { data: createData } = await janusAPI.createRoom(
            this.sessionId,
            this.videoroomId,
            {
                room: config.janusRoom,
                bitrate: config.janusBitrate,
                publishers: config.cameraSlots,
                pin: config.janusRoomPin,
                secret: config.janusRoomSecret
            }
        );

        if (
            createData?.janus === 'success' &&
            createData.plugindata.data.videoroom === 'created'
        ) {
            console.log(`Created new janus room ${config.janusRoom}`);
        } else {
            throw new Error(
                `Could not create Janus room. Server response: ${JSON.stringify(
                    createData,
                    null,
                    2
                )}`
            );
        }
    }

    async cleaup() {
        console.log(`Cleaning up janus room ${config.janusRoom}`);
        if (this._sessionAlive) {
            this.source.cancel('Cleanup');
            console.log('Destroying janus room');
            const { data } = await janusAPI.destroyRoom(
                this.sessionId,
                this.videoroomId,
                config.janusRoom,
                config.janusRoomSecret
            );
            if (
                data?.janus === 'success' &&
                data.plugindata.data.videoroom === 'destroyed'
            ) {
                console.log('Successfully destroyed room');
            } else {
                console.log('Error: Could not destroy room');
            }

            console.log('Detaching videoroom plugin');
            await janusAPI.detachVideoroomPlugin(
                this.sessionId,
                this.videoroomId
            );

            console.log('Destroying janus session');
            await janusAPI.destroySession(this.sessionId);
        } else {
            console.log("Can't clean up janus room because session timed out");
        }
    }
}

export const room = new JanusRoom();
