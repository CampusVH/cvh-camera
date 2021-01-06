import { socketIO } from '../socket-io/socket-io';
import { isBlocking } from '../io-interface/handlers/output-handlers';

interface ExitHandlerOptions {
    cleanup?: boolean;
    exit?: boolean;
}

const exitHandler = (
    options: ExitHandlerOptions,
    exitCode: string | number
) => {
    if (options.cleanup) {
        console.log('cleanup');
        socketIO.emit('remove_all_feeds');
    }
    if (exitCode || exitCode === 0) {
        console.log('Exit code:', exitCode);
        if (exitCode === 0 && isBlocking()) {
            console.log('Aborting process due to blocking file append');
            process.abort();
        }
    }
    if (options.exit) {
        process.exit();
    }
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
