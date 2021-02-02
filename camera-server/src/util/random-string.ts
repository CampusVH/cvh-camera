const charSet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const randomString = (length: number) => {
    let str = '';
    for (let i = 0; i < length; i++) {
        const pos = Math.floor(Math.random() * charSet.length);
        str += charSet.substring(pos, pos + 1);
    }
    return str;
};
