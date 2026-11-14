import { TLSSocket } from 'node:tls';

import { Client } from 'pg';

import { normalizarSslConnectionString } from '../database/ssl-connection-string.js';
import { classificarFalhaTls, selecionarAlvoDiagnostico } from './clinical-operations.js';

async function executar(): Promise<void> {
    const alvo = selecionarAlvoDiagnostico(process.argv.slice(2), process.env);
    const client = new Client({
        connectionString: normalizarSslConnectionString(alvo.connectionString, true),
        connectionTimeoutMillis: 8000,
    });

    try {
        await client.connect();
        const socket = (client as unknown as { connection?: { stream?: unknown } }).connection
            ?.stream;

        if (!(socket instanceof TLSSocket) || socket.authorized !== true) {
            console.log(
                JSON.stringify(
                    {
                        ambiente: alvo.ambiente,
                        estado: 'REPROVADO',
                        evidencia: {
                            tlsSocket: socket instanceof TLSSocket,
                            certificadoAutorizado:
                                socket instanceof TLSSocket ? socket.authorized : null,
                            sqlExecutado: false,
                            detalhesSensíveisOmitidos: true,
                        },
                    },
                    null,
                    2,
                ),
            );
            return;
        }

        console.log(
            JSON.stringify(
                {
                    ambiente: alvo.ambiente,
                    estado: 'APROVADO',
                    evidencia: {
                        modo: 'verify-full',
                        tlsSocket: true,
                        certificadoAutorizado: true,
                        verificacaoHostname: true,
                        protocolo: socket.getProtocol(),
                        cifra: socket.getCipher().name,
                        sqlExecutado: false,
                    },
                },
                null,
                2,
            ),
        );
    } catch (error) {
        const code =
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            typeof error.code === 'string'
                ? error.code
                : undefined;
        const falha = classificarFalhaTls(code);

        console.log(
            JSON.stringify(
                {
                    ambiente: alvo.ambiente,
                    estado: falha.estado,
                    evidencia: {
                        categoria: falha.categoria,
                        sqlExecutado: false,
                        detalhesSensíveisOmitidos: true,
                    },
                },
                null,
                2,
            ),
        );
    } finally {
        await client.end().catch(() => undefined);
    }
}

await executar();
