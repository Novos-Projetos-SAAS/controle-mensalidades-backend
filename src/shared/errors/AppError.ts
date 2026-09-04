class AppError extends Error {
    statusCode: number;
    code: string | null;
    isOperational: boolean;

    constructor(message: string, statusCode = 400, code: string | null = null) {
        super(message);

        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;

        Error.captureStackTrace?.(this, this.constructor);
    }
}

export default AppError;
