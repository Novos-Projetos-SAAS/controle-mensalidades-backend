class HealthService {
    executar() {
        return {
            situacao: 'OK',
            timestamp: new Date().toISOString(),
        };
    }
}

export default new HealthService();
