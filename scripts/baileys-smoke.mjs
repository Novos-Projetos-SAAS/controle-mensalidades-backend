// Diagnóstico exclusivamente local. Não importar no servidor nem usar em produção.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    throw new Error('DIAGNOSTICO_BAILEYS_SOMENTE_LOCAL');
}
if (!stdin.isTTY || !stdout.isTTY) throw new Error('TERMINAL_INTERATIVO_OBRIGATORIO');
const numero = process.env.BAILEYS_TEST_NUMBER ?? '';
if (!/^55[1-9]\d{9,10}$/.test(numero)) {
    throw new Error('Informe BAILEYS_TEST_NUMBER com DDI 55, DDD e número de teste próprio.');
}
const rl = createInterface({ input: stdin, output: stdout });
const resposta = await rl.question('Você controla o número destinatário e autoriza um único envio de teste? Digite SIM: ');
rl.close();
if (resposta.trim() !== 'SIM') process.exit(0);

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await import('@whiskeysockets/baileys');
const { default: qrcode } = await import('qrcode-terminal');
const { default: pino } = await import('pino');
const pasta = await mkdtemp(join(tmpdir(), 'orbe-baileys-teste-'));
let socket;
let gravacao = Promise.resolve();
let tentouEnviar = false;
try {
    const { state, saveCreds } = await useMultiFileAuthState(pasta);
    for (let tentativa = 0; tentativa < 2; tentativa++) {
        socket = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            syncFullHistory: false,
            markOnlineOnConnect: false,
        });
        socket.ev.on('creds.update', () => {
            gravacao = gravacao.then(() => saveCreds());
            void gravacao.catch(() => {});
        });
        const status = await new Promise((resolve, reject) => {
            const atual = socket;
            const timer = setTimeout(() => finish(new Error('TEMPO_CONEXAO_ESGOTADO')), 120000);
            function finish(error, value) {
                clearTimeout(timer);
                atual.ev.off('connection.update', update);
                if (error) reject(error);
                else resolve(value);
            }
            function update({ qr, connection, lastDisconnect }) {
                if (qr) {
                    console.log('No número de teste: WhatsApp > Aparelhos conectados > Conectar aparelho.');
                    qrcode.generate(qr, { small: true });
                }
                if (connection === 'open') finish(null, 'open');
                if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    finish(null, code);
                }
            }
            atual.ev.on('connection.update', update);
        });
        await gravacao;
        if (status === DisconnectReason.restartRequired && tentativa === 0) {
            socket.end(undefined);
            socket = undefined;
            continue;
        }
        if (status !== 'open') throw new Error('CONEXAO_NAO_ESTABELECIDA');
        console.log('Conectado. Enviando uma única mensagem de teste.');
        tentouEnviar = true;
        const result = await socket.sendMessage(numero + '@s.whatsapp.net', {
            text: 'Olá! Esta é uma mensagem de teste do sistema de controle de mensalidades.',
        });
        if (!result?.key?.id) throw new Error('RESULTADO_ENVIO_INCERTO');
        console.log('Mensagem submetida. Confirme a chegada no celular destinatário.');
        break;
    }
} catch {
    console.error(tentouEnviar ? 'Envio não confirmado; não repita automaticamente.' : 'Conexão não concluída.');
    process.exitCode = 1;
} finally {
    socket?.end(undefined);
    await gravacao.catch(() => {});
    await rm(pasta, { recursive: true, force: true });
    console.log('Remova o aparelho de teste em Aparelhos conectados no celular.');
}
