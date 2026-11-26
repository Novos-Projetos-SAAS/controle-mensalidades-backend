import app from './app.js';
import { env } from './configuration/env.js';
import connection from './database/connection.js';
import {
    iniciarRotinaPagamentos,
    pararRotinaPagamentos,
} from './modules/pagamentos/pagamentos.worker.js';

const server = app.listen(env.PORT, () => {
    console.log(`Servidor executando na porta ${env.PORT}`);
    iniciarRotinaPagamentos();
});

async function shutdown() {
    server.close();
    await pararRotinaPagamentos();
    await connection.destroy();
}
process.once('SIGTERM', () => {
    void shutdown();
});
process.once('SIGINT', () => {
    void shutdown();
});
