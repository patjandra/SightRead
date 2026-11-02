/** An error that maps directly to an HTTP response with the standard shape. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorBody(code, message) {
  return { error: { code, message } };
}
