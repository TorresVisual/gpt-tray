const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveBrowserChoice } = require('./browser-select');

test('resolveBrowserChoice returns the explicitly requested browser when available', () => {
  const available = [
    { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' },
    { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' }
  ];
  const result = resolveBrowserChoice('edge', available);
  assert.deepEqual(result, { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' });
});

test('resolveBrowserChoice falls back to preference order when the requested browser is unavailable', () => {
  const available = [
    { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' },
    { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' }
  ];
  const result = resolveBrowserChoice('brave', available);
  assert.deepEqual(result, { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' });
});

test('resolveBrowserChoice prefers brave over chrome and edge when no browserId is given', () => {
  const available = [
    { id: 'edge', name: 'Edge', path: 'C:\\edge.exe' },
    { id: 'brave', name: 'Brave', path: 'C:\\brave.exe' },
    { id: 'chrome', name: 'Chrome', path: 'C:\\chrome.exe' }
  ];
  const result = resolveBrowserChoice(null, available);
  assert.deepEqual(result, { id: 'brave', name: 'Brave', path: 'C:\\brave.exe' });
});

test('resolveBrowserChoice returns null when no browsers are available', () => {
  const result = resolveBrowserChoice(null, []);
  assert.equal(result, null);
});
