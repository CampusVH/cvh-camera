// Janus API documentation: https://janus.conf.meetecho.com/docs/rest.html

import axios, { AxiosRequestConfig, CancelToken } from 'axios';

import { randomString } from '../util/random-string';
import { config } from '../config/config';

type JanusVerb = 'create' | 'destroy' | 'attach' | 'detach' | 'message';

interface RoomConfig {
    room: number;
    publishers: number;
    bitrate: number;
    secret?: string;
    pin?: string;
    description?: string;
    admin_key?: string;
}

export const api = axios.create({
    baseURL: config.janusURL,
    timeout: 2500
});

export const postRequest = <T extends { janus: JanusVerb }>(
    path: string,
    body: T,
    config: AxiosRequestConfig = {}
) => {
    return api.post(path, { ...body, transaction: randomString(12) }, config);
};

export const sessionLongPoll = (
    sessionId: number,
    cancelToken: CancelToken,
    maxExents = 10
) => {
    return api.get(`/${sessionId}?rid=${Date.now()}&maxev=${maxExents}`, {
        cancelToken,
        // Answer should come in 30000ms
        timeout: 35000
    });
};

export const createSession = () => {
    return postRequest('/', {
        janus: 'create'
    });
};

export const destroySession = (sessionId: number) => {
    return postRequest(`/${sessionId}`, {
        janus: 'destroy'
    });
};

export const attachVideoroomPlugin = (sessionId: number) => {
    return postRequest(`/${sessionId}`, {
        janus: 'attach',
        plugin: 'janus.plugin.videoroom'
    });
};

export const detachVideoroomPlugin = (
    sessionId: number,
    videoroomId: number
) => {
    return postRequest(`/${sessionId}/${videoroomId}`, {
        janus: 'detach'
    });
};

export const configureVideoroomBitrate = (
    sessionId: number,
    videoroomId: number,
    bitrate: number
) => {
    return postRequest(`/${sessionId}/${videoroomId}`, {
        janus: 'message',
        body: {
            request: 'configure',
            bitrate
        }
    });
};

export const createRoom = (
    sessionId: number,
    videoroomId: number,
    config: RoomConfig
) => {
    return postRequest(`/${sessionId}/${videoroomId}`, {
        janus: 'message',
        body: {
            request: 'create',
            ...config
        }
    });
};

export const destroyRoom = (
    sessionId: number,
    videoroomId: number,
    room: number,
    secret: string
) => {
    return postRequest(`/${sessionId}/${videoroomId}`, {
        janus: 'message',
        body: {
            request: 'destroy',
            room,
            secret
        }
    });
};

export const editRoomPin = (
    sessionId: number,
    videoroomId: number,
    room: number,
    secret: string,
    newPin: string
) => {
    return postRequest(`/${sessionId}/${videoroomId}`, {
        janus: 'message',
        body: {
            request: 'edit',
            room,
            secret,
            new_pin: newPin
        }
    });
};
