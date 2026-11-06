export class AppError extends Error { constructor(message, statusCode=400, code='BAD_REQUEST') { super(message); this.statusCode=statusCode; this.code=code; } }
