const { test } = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const { allowedOrigins } = require('../apps/api/dist/cors');

test('REST and Socket.IO accept configured origins and packaged desktop origins without wildcards', () => {
  const previous = process.env.WEB_ORIGIN;
  try {
    process.env.WEB_ORIGIN = ' https://chat.example.com,https://chat.example.com, https://other.example.com ';
    const expected = allowedOrigins();
    assert.equal(expected.filter(value => value === 'https://chat.example.com').length, 1);
    for (const origin of ['https://other.example.com', 'tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) assert.ok(expected.includes(origin));
    assert.ok(!expected.includes('*'));
    const { MessagesGateway } = require('../apps/api/dist/messages/messages.gateway');
    const options = Reflect.getMetadata('websockets:gateway_options', MessagesGateway);
    assert.deepEqual(options.cors.origin, expected);
  } finally {
    if (previous === undefined) delete process.env.WEB_ORIGIN;
    else process.env.WEB_ORIGIN = previous;
  }
});
