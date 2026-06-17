const errorHandler = require('../../middleware/errorHandler');

describe('Error Handler', () => {
  test('should pass through to next if headers already sent', () => {
    const err = new Error('Test error');
    const req = { get: () => null, path: '/test' };
    const res = { headersSent: true };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
  });

  test('should return JSON response for API requests', () => {
    const err = new Error('Test error');
    const req = { get: () => 'application/json', xhr: false, path: '/api/test' };
    const jsonMock = jest.fn();
    const res = { headersSent: false, status: jest.fn(() => ({ json: jsonMock })), json: jsonMock };
    const next = jest.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalled();
    expect(jsonMock).toHaveBeenCalled();
  });
});
