import assert from 'node:assert/strict'
import test from 'node:test'
import { createLiveUpdatesUrl } from '../utils/liveUpdates.js'

test('relative API uses the deployed host and port', () => {
  assert.equal(createLiveUpdatesUrl('/api/v1', 'http://test-server:8080'), 'ws://test-server:8080/api/v1/ws/updates')
})

test('HTTPS API uses a secure WebSocket', () => {
  assert.equal(createLiveUpdatesUrl('/api/v1/', 'https://uk.example.org'), 'wss://uk.example.org/api/v1/ws/updates')
})

test('local development can use a separate backend port', () => {
  assert.equal(createLiveUpdatesUrl('http://127.0.0.1:8000/api/v1', 'http://localhost:3000'), 'ws://127.0.0.1:8000/api/v1/ws/updates')
})

test('API subpaths are preserved and URL parameters are removed', () => {
  assert.equal(createLiveUpdatesUrl('/uk/api/v1/?x=1#top', 'https://uk.example.org'), 'wss://uk.example.org/uk/api/v1/ws/updates')
})

test('empty or unsupported addresses are ignored', () => {
  assert.equal(createLiveUpdatesUrl('', 'https://uk.example.org'), '')
  assert.equal(createLiveUpdatesUrl('file:///api/v1', 'https://uk.example.org'), '')
})
