const nodeProcess = globalThis.process;

if (nodeProcess.platform === 'win32' && typeof nodeProcess.geteuid !== 'function') {
    Object.defineProperty(nodeProcess, 'geteuid', {
        configurable: true,
        value: () => 0,
    });
}
