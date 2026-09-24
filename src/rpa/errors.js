class RpaError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'RpaError'; this.code = code; this.details = details; }
}

module.exports = { RpaError };
