import * as fs from 'fs';
import * as path from 'path';

interface Config {
    port: number;
    cameraSlots: number;
    notifyPath: string;
    janusURL: string;
    janusRoom: number;
    janusRoomSecret: string;
    janusRoomPin: string;
    janusBitrate: number;
    janusAdminKey: string;
}

// Required to access config with config[key]
// But only an object of type Config should be returned
interface IndexableConfig extends Config {
    [key: string]: number | string;
}

let configPath = process.env.CONFIG_PATH;

let fileContent: string = '';

if (configPath) {
    try {
        fileContent = fs.readFileSync(configPath).toString();
    } catch (err) {
        console.log(
            `Error: Could not read config at ${path.resolve(configPath)}:`,
            err
        );
        console.log('Using default values');
    }
} else {
    console.log('Got not CONFIG_PATH environment variable');
}

const indexableConfig: IndexableConfig = {
    port: 5000,
    cameraSlots: 4,
    notifyPath: '',
    janusURL: 'http://localhost:8088/janus',
    janusRoom: 1000,
    janusRoomSecret: 'default',
    janusRoomPin: '',
    janusBitrate: 128000,
    janusAdminKey: ''
};

if (fileContent) {
    let readConfig: any;

    // No need to process error because if-check below sanitizes read config
    try {
        readConfig = JSON.parse(fileContent);
    } catch (err) {}

    if (typeof readConfig === 'object' && readConfig !== null) {
        console.log(`Reading config at ${path.resolve(configPath!)}`);
        // Overwrite default values with values of read config
        Object.keys(readConfig).forEach((key) => {
            if (indexableConfig.hasOwnProperty(key)) {
                const expectedType = typeof indexableConfig[key];
                const readType = typeof readConfig[key];
                if (expectedType === readType) {
                    indexableConfig[key] = readConfig[key];
                } else {
                    console.log(
                        `Error: Read config propety '${key}' is of type ${readType}, but type ${expectedType} was expected`
                    );
                }
            } else {
                console.log(`Error: Unknown property ${key} in config`);
            }
        });
    } else {
        console.log(
            `Error: Config at ${path.resolve(
                configPath!
            )} is malformed - using default values`
        );
    }
}

const ENV_CONFIG_PREFIX = 'CVH_CAMERA_CONFIG_';
Object.keys(process.env).forEach((envKey) => {
    if (envKey.startsWith(ENV_CONFIG_PREFIX)) {
        const configKey = envKey.slice(ENV_CONFIG_PREFIX.length);
        if (indexableConfig.hasOwnProperty(configKey)) {
            const expectedType = typeof indexableConfig[configKey];
            if (expectedType === 'string') {
                indexableConfig[configKey] = process.env[envKey]!;
            } else if (expectedType === 'number') {
                const envValue = process.env[envKey]!;
                const num = parseInt(envValue);
                if (!isNaN(num)) {
                    indexableConfig[configKey] = num;
                } else {
                    console.log(
                        `Error: Config key ${configKey} from environment could not be parsed to a number`
                    );
                }
            }
        } else {
            console.log(
                `Error: Unknown config key ${configKey} in environment`
            );
        }
    }
});

const config = indexableConfig as Config;
if (config.notifyPath && !path.isAbsolute(config.notifyPath) && configPath) {
    config.notifyPath = path.resolve(
        path.dirname(configPath),
        config.notifyPath
    );
}

console.log('Using config:', config);

export { config };
