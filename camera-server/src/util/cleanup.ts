import { socketIO } from '../socket-io/socket-io';

interface ExitHandlerOptions {
    cleanup?: boolean;
    exit?: boolean;
}

const cleanup = () => {
    console.log('cleanup');
    socketIO.emit('remove_all_feeds');
};

const exitHandler = (options: ExitHandlerOptions, exitCode: number) => {
    if (options.cleanup) cleanup();
    if (exitCode || exitCode === 0) console.log(exitCode);
    if (options.exit) process.exit();
};

export const registerCleanupLogic = () => {
    // do something when app is closing
    process.on('exit', exitHandler.bind(null, { cleanup: true }));

    // catches ctrl+c event
    process.on('SIGINT', exitHandler.bind(null, { exit: true }));

    // catches "kill pid" (for example: nodemon restart)
    process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
    process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

    // catches uncaught exceptions
    process.on('uncaughtException', exitHandler.bind(null, { exit: true }));

    // catches termination
    process.on('SIGTERM', exitHandler.bind(null, { exit: true }));
};
