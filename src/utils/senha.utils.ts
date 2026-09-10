import argon2, { type HashOptions } from 'argon2';

const opcoesArgon2: HashOptions = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
};

export async function hashPassword(password: string) {
    return argon2.hash(password, opcoesArgon2);
}

export async function comparePassword(password: string, hash: string) {
    try {
        return await argon2.verify(hash, password);
    } catch {
        return false;
    }
}
