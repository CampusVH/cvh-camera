import * as fs from 'fs';
import * as path from 'path';

interface Config {
    port: number;
    cameraSlots: number;
}

// Required to access config with config[key]
// But only an object of type Config should be returned
interface IndexableConfig extends Config {
    // Change type once non-number values are added
    [key: string]: number;
}

let configPath = process.env.CONFIG_PATH;

let fileContent: string = '';

if (configPath) {
    try {
        fileContent = fs.readFileSync(configPath).toString();
    } catch (err) {
        console.log(
            `Could not read config at ${path.resolve(configPath)}:`,
            err
        );
        console.log('Using default values');
    }
} else {
    console.log('Got not CONFIG_PATH environment variable');
}

const indexableConfig: IndexableConfig = {
    port: 5000,
    cameraSlots: 4
};

if (fileContent) {
    let readConfig: any;

    // No need to process error because if-check below sanitises read config
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
                console.log(`Unknown property ${key} in config`);
            }
        });
    } else {
        console.log(
            `Config at ${path.resolve(
                configPath!
            )} is malformed - using default values`
        );
    }
}

const config = indexableConfig as Config;

console.log('Using config:', config);

export { config };
