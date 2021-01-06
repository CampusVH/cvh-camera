import * as fs from 'fs';

import { config } from '../../config/config';

// Saves the amount of blocking append calls
// in case the named pipe is not read by PULT
let blockingAppendCalls = 0;

const timeoutTime = 5000;

const printTimeoutMessage = (notifyPath: string) => {
    console.log(
        `Error: Controller did not read file at path '${notifyPath}' for ${timeoutTime}ms`
    );
};

const notifyController = (message: string) => {
    const { notifyPath } = config;
    if (notifyPath) {
        if (fs.existsSync(notifyPath)) {
            const timeoutId = setTimeout(
                printTimeoutMessage.bind(null, notifyPath),
                timeoutTime
            );
            console.log(
                `Notifying controller about message '${message}' using file at path '${notifyPath}'`
            );
            blockingAppendCalls += 1;
            fs.appendFile(notifyPath, message + '\n', (err) => {
                if (err) {
                    console.log(
                        `Error: Tried to notify controller about message '${message}' but could not write to path '${notifyPath}' - Error:`,
                        err
                    );
                }
                blockingAppendCalls -= 1;
                clearTimeout(timeoutId);
            });
        } else {
            console.log(
                `Error: Tried to notify controller about message '${message}' using file at path '${notifyPath}' which does not exist`
            );
        }
    }
};

export const isBlocking = () => blockingAppendCalls !== 0;

export const notifyNewFeed = (slot: number) => {
    notifyController(`new_feed ${slot}`);
};

export const notifyRemoveFeed = (slot: number) => {
    notifyController(`remove_feed ${slot}`);
};
