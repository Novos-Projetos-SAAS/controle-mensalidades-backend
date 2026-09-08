import dotenv from 'dotenv';
import knex from 'knex';

import { criarConfiguracaoBanco, type DatabaseEnvironment } from './database.config.js';

const environment = (process.env.NODE_ENV || 'development') as DatabaseEnvironment;

dotenv.config({
    path: environment === 'test' ? '.env.test' : '.env',
});

if (environment === 'test' && process.env.AMBIENTE_BANCO !== 'teste') {
    throw new Error('O ambiente de teste deve utilizar um banco exclusivo para testes.');
}

const config = criarConfiguracaoBanco(environment);

const connection = knex(config);

export default connection;
