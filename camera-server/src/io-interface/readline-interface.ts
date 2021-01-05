import * as readline from 'readline';

export const readlineInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});
