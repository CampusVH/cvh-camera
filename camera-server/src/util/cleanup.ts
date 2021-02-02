import { socketIO } from '../socket-io/socket-io';
import { isBlocking } from '../io-interface/handlers/output-handlers';
import { room } from '../janus/janus-room';

const asyncExitHandler = async (reason: number | string | Error) => {
    console.log('Async exit handler');
    try {
        await room.cleaup();
    } catch (err) {
        console.log('Error in async exit handler:', err);
    }

    process.exit(isNaN(+reason) ? 1 : +reason);
};

const syncExitHandler = () => {
    console.log('Sync exit handler');
    socketIO.emit('remove_all_feeds');
    if (isBlocking()) {
        console.log('Aborting process due to blocking file append');
        process.abort();
    }
};

export const registerCleanupLogic = () => {
    [
        'beforeExit',
        'uncaughtException',
        'unhandledRejection',
        'SIGHUP',
        'SIGINT',
        'SIGQUIT',
        'SIGILL',
        'SIGTRAP',
        'SIGABRT',
        'SIGBUS',
        'SIGFPE',
        'SIGUSR1',
        'SIGSEGV',
        'SIGUSR2',
        'SIGTERM'
    ].forEach((evt) => process.on(evt, asyncExitHandler));

    process.on('exit', syncExitHandler);
};
