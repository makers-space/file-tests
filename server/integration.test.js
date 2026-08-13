/**
 * External Integrations - HTTP API Test Suite
 *
 * Validates that FilesystemOne can SAFELY send file content and metadata to
 * verified external APIs:
 *  - registration rules (admin global scope, premium user scope)
 *  - SSRF guards (HTTPS-only, private/loopback address blocking)
 *  - challenge/response endpoint verification
 *  - HMAC-signed deliveries with content checksums
 *  - permission enforcement (file read access, integration ownership)
 *  - delivery logging, secret rotation and lifecycle management
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import TestStartup from '../utils/test.startup.js';

// Allow HTTP + private addresses BEFORE the server boots so the in-test mock
// receiver (127.0.0.1) is reachable. Production defaults keep both disabled.
process.env.EXTERNAL_SHARE_ALLOW_HTTP = 'true';
process.env.EXTERNAL_SHARE_ALLOW_PRIVATE = 'true';

const RECEIVER_PORT = 8399;
const RECEIVER_URL = `http://127.0.0.1:${RECEIVER_PORT}/hooks/fsone`;

/**
 * Minimal cooperating external API endpoint.
 * Records every request (headers + raw + parsed body) and echoes verification
 * challenges back, as a real FSOne-compatible receiver would.
 */
class MockReceiver {
    constructor(port) {
        this.port = port;
        this.requests = [];
        this.mode = 'ok'; // 'ok' | 'fail' | 'no-echo'
        this.server = null;
    }

    start() {
        return new Promise((resolve) => {
            this.server = http.createServer((req, res) => {
                const chunks = [];
                req.on('data', (c) => chunks.push(c));
                req.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf-8');
                    let body = null;
                    try { body = JSON.parse(raw); } catch { /* keep raw only */ }
                    this.requests.push({headers: req.headers, raw, body});

                    if (this.mode === 'fail') {
                        res.writeHead(500, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify({error: 'receiver exploded'}));
                        return;
                    }

                    if (body?.type === 'verification' && this.mode !== 'no-echo') {
                        res.writeHead(200, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify({challenge: body.challenge}));
                        return;
                    }

                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({received: true}));
                });
            });
            this.server.listen(this.port, '127.0.0.1', resolve);
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) this.server.close(resolve);
            else resolve();
        });
    }

    reset() {
        this.requests = [];
        this.mode = 'ok';
    }

    lastRequest() {
        return this.requests[this.requests.length - 1] || null;
    }
}

/** Verify an X-FSOne-Signature header against a known signing secret */
const verifySignature = (secret, request) => {
    const timestamp = request.headers['x-fsone-timestamp'];
    const signature = request.headers['x-fsone-signature'];
    const expected = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${request.raw}`)
        .digest('hex');
    return signature === expected;
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

describe('External Integrations - HTTP API', () => {
    let testStartup;
    let client;
    let receiver;

    let testRoot;
    let sampleFilePath;
    const sampleContent = 'External sharing test content — hello receiver!';

    // Personal integration owned by creator
    let personalIntegration;
    let personalSecret;
    // Global integration registered by admin
    let globalIntegration;
    let globalSecret;

    beforeAll(async () => {
        receiver = new MockReceiver(RECEIVER_PORT);
        await receiver.start();

        testStartup = new TestStartup('integration');
        await testStartup.initialize();
        client = testStartup.getClient();
        console.log('Integration tests initialized on port:', testStartup.port, 'DB:', testStartup.dbName);

        // Creator workspace + a sample file to export
        await testStartup.loginAsUser('creator');
        testRoot = `/${testStartup.creator.username}/integration-tests-${Date.now()}`;

        const dirResponse = await client.post('/api/v1/files/directory', {
            dirPath: testRoot,
            description: 'External integration test root'
        });
        expect(dirResponse.status).toBe(201);

        sampleFilePath = `${testRoot}/export-me.txt`;
        const fileResponse = await client.post('/api/v1/files', {
            filePath: sampleFilePath,
            content: sampleContent,
            description: 'File exported to external APIs in tests'
        });
        expect(fileResponse.status).toBe(201);
    }, 120000);

    afterAll(async () => {
        await receiver.stop();
        await testStartup.cleanup();
    }, 45000);

    beforeEach(async () => {
        receiver.reset();
        await testStartup.loginAsUser('creator');
    });

    // =========================================================================
    // Registration & scope rules
    // =========================================================================
    describe('Registration and scope rules', () => {
        test('creator registers a personal integration and receives the signing secret once', async () => {
            const response = await client.post('/api/v1/integrations', {
                name: 'My export target',
                description: 'Personal webhook for my other app',
                baseUrl: RECEIVER_URL,
                apiKey: 'personal-api-key-123',
                apiKeyHeader: 'X-Api-Key'
            });

            expect(response.status).toBe(201);
            expect(response.data.success).toBe(true);
            expect(response.data.signingSecret).toMatch(/^[a-f0-9]{64}$/);
            expect(response.data.integration.status).toBe('pending');
            expect(response.data.integration.scope).toBe('user');
            // Secrets must never be present on the integration object itself
            expect(response.data.integration.signingSecret).toBeUndefined();
            expect(response.data.integration.apiKey).toBeUndefined();

            personalIntegration = response.data.integration;
            personalSecret = response.data.signingSecret;
        });

        test('admin registers a global integration', async () => {
            await testStartup.loginAsUser('admin');

            const response = await client.post('/api/v1/integrations', {
                name: 'Company-wide backup API',
                baseUrl: RECEIVER_URL,
                scope: 'global'
            });

            expect(response.status).toBe(201);
            expect(response.data.integration.scope).toBe('global');
            globalIntegration = response.data.integration;
            globalSecret = response.data.signingSecret;
        });

        test('non-admin cannot register a global integration', async () => {
            const response = await client.post('/api/v1/integrations', {
                name: 'Sneaky global',
                baseUrl: RECEIVER_URL,
                scope: 'global'
            });

            expect(response.status).toBe(403);
            expect(response.data.success).toBe(false);
        });

        test('regular USER cannot register a personal integration (premium gate)', async () => {
            await testStartup.loginAsUser('user');

            const response = await client.post('/api/v1/integrations', {
                name: 'Free tier attempt',
                baseUrl: RECEIVER_URL
            });

            expect(response.status).toBe(403);
            expect(response.data.message).toMatch(/upgraded account/i);
        });

        test('rejects invalid URLs', async () => {
            const response = await client.post('/api/v1/integrations', {
                name: 'Bad URL',
                baseUrl: 'ftp://example.com/files'
            });
            expect(response.status).toBe(400);
        });

        test('rejects URLs containing credentials', async () => {
            const response = await client.post('/api/v1/integrations', {
                name: 'Creds in URL',
                baseUrl: 'https://user:hunter2@example.com/hook'
            });
            expect(response.status).toBe(400);
        });

        test('rejects missing name', async () => {
            const response = await client.post('/api/v1/integrations', {
                baseUrl: RECEIVER_URL
            });
            expect(response.status).toBe(400);
        });
    });

    // =========================================================================
    // SSRF guards (production defaults)
    // =========================================================================
    describe('SSRF protection with production settings', () => {
        const withProdSettings = async (fn) => {
            const prevHttp = process.env.EXTERNAL_SHARE_ALLOW_HTTP;
            const prevPrivate = process.env.EXTERNAL_SHARE_ALLOW_PRIVATE;
            process.env.EXTERNAL_SHARE_ALLOW_HTTP = 'false';
            process.env.EXTERNAL_SHARE_ALLOW_PRIVATE = 'false';
            try {
                await fn();
            } finally {
                process.env.EXTERNAL_SHARE_ALLOW_HTTP = prevHttp;
                process.env.EXTERNAL_SHARE_ALLOW_PRIVATE = prevPrivate;
            }
        };

        test('blocks plain HTTP endpoints', async () => {
            await withProdSettings(async () => {
                const response = await client.post('/api/v1/integrations', {
                    name: 'Plain HTTP',
                    baseUrl: 'http://insecure-api.example.com/hook'
                });
                expect(response.status).toBe(400);
                expect(response.data.message).toMatch(/https/i);
            });
        });

        test('blocks loopback addresses', async () => {
            await withProdSettings(async () => {
                const response = await client.post('/api/v1/integrations', {
                    name: 'Loopback',
                    baseUrl: 'https://127.0.0.1/hook'
                });
                expect(response.status).toBe(400);
                expect(response.data.message).toMatch(/private or reserved/i);
            });
        });

        test('blocks private network and cloud metadata addresses', async () => {
            await withProdSettings(async () => {
                for (const target of [
                    'https://10.0.0.5/hook',
                    'https://192.168.1.10/hook',
                    'https://172.16.0.1/hook',
                    'https://169.254.169.254/latest/meta-data', // cloud metadata endpoint
                    'https://localhost/hook',
                    'https://[::1]/hook'
                ]) {
                    const response = await client.post('/api/v1/integrations', {
                        name: 'Private target',
                        baseUrl: target
                    });
                    expect(response.status, `expected ${target} to be blocked`).toBe(400);
                }
            });
        });
    });

    // =========================================================================
    // Endpoint verification handshake
    // =========================================================================
    describe('Endpoint verification', () => {
        test('cannot send files through an unverified integration', async () => {
            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath
            });

            expect(response.status).toBe(403);
            expect(response.data.message).toMatch(/verified/i);
        });

        test('verification fails when the endpoint does not echo the challenge', async () => {
            receiver.mode = 'no-echo';

            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/verify`);
            expect(response.status).toBe(422);
            expect(response.data.success).toBe(false);
            expect(response.data.integration.status).toBe('pending');
        });

        test('verifies the endpoint via signed challenge/response', async () => {
            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/verify`);

            expect(response.status).toBe(200);
            expect(response.data.integration.status).toBe('verified');

            // The receiver got a signed verification payload
            const request = receiver.lastRequest();
            expect(request.body.type).toBe('verification');
            expect(request.body.challenge).toMatch(/^[a-f0-9]{48}$/);
            expect(request.headers['x-fsone-event']).toBe('integration.verify');
            expect(verifySignature(personalSecret, request)).toBe(true);
        });

        test('non-owner cannot verify someone else\'s personal integration', async () => {
            await testStartup.loginAsUser('user');

            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/verify`);
            expect(response.status).toBe(403);
        });

        test('admin verifies the global integration', async () => {
            await testStartup.loginAsUser('admin');

            const response = await client.post(`/api/v1/integrations/${globalIntegration.id}/verify`);
            expect(response.status).toBe(200);
            expect(response.data.integration.status).toBe('verified');
        });
    });

    // =========================================================================
    // Sending files
    // =========================================================================
    describe('Sending file metadata and content', () => {
        test('sends metadata-only payload with valid signature and API key', async () => {
            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.delivery.includedContent).toBe(false);

            const request = receiver.lastRequest();
            expect(request.body.type).toBe('file.export');
            expect(request.body.file.filePath).toBe(sampleFilePath);
            expect(request.body.file.fileName).toBe('export-me.txt');
            expect(request.body.file.mimeType).toBeDefined();
            expect(request.body.file.content).toBeUndefined();
            expect(request.body.sender.username).toBe(testStartup.creator.username);

            // Transport safety: signed payload + configured API key + event header
            expect(verifySignature(personalSecret, request)).toBe(true);
            expect(request.headers['x-api-key']).toBe('personal-api-key-123');
            expect(request.headers['x-fsone-event']).toBe('file.export');
            expect(request.headers['x-fsone-integration-id']).toBe(personalIntegration.id);
        });

        test('sends file content with matching sha256 checksum', async () => {
            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath,
                includeContent: true,
                event: 'file.backup'
            });

            expect(response.status).toBe(200);
            expect(response.data.delivery.includedContent).toBe(true);

            const request = receiver.lastRequest();
            expect(request.body.event).toBe('file.backup');
            expect(request.body.file.content).toBe(sampleContent);
            expect(request.body.file.contentEncoding).toBe('utf-8');
            expect(request.body.file.checksumAlgorithm).toBe('sha256');
            expect(request.body.file.checksum).toBe(sha256(sampleContent));
            expect(verifySignature(personalSecret, request)).toBe(true);
        });

        test('user without read access on the file cannot export it', async () => {
            await testStartup.loginAsUser('user');

            const response = await client.post(`/api/v1/integrations/${globalIntegration.id}/send`, {
                filePath: sampleFilePath // creator's file, not shared with user
            });

            expect(response.status).toBe(404);
            expect(response.data.message).toMatch(/not found|permission/i);
        });

        test('user cannot use someone else\'s personal integration', async () => {
            await testStartup.loginAsUser('user');

            // Regular user creates their own file first
            const userFilePath = `/${testStartup.user.username}/user-export-${Date.now()}.txt`;
            const createResponse = await client.post('/api/v1/files', {
                filePath: userFilePath,
                content: 'User private file'
            });
            expect(createResponse.status).toBe(201);

            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: userFilePath
            });

            expect(response.status).toBe(403);
            expect(response.data.message).toMatch(/access/i);
        });

        test('any user can export their own files through a verified global integration', async () => {
            await testStartup.loginAsUser('user');

            const userFilePath = `/${testStartup.user.username}/global-export-${Date.now()}.txt`;
            await client.post('/api/v1/files', {
                filePath: userFilePath,
                content: 'Export via global integration'
            });

            const response = await client.post(`/api/v1/integrations/${globalIntegration.id}/send`, {
                filePath: userFilePath,
                includeContent: true
            });

            expect(response.status).toBe(200);
            const request = receiver.lastRequest();
            expect(request.body.file.content).toBe('Export via global integration');
            expect(verifySignature(globalSecret, request)).toBe(true);
        });

        test('returns 502 and records failure when the receiver rejects the delivery', async () => {
            receiver.mode = 'fail';

            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath
            });

            expect(response.status).toBe(502);
            expect(response.data.success).toBe(false);
            expect(response.data.delivery.httpStatus).toBe(500);
        });

        test('returns 404 for a nonexistent file', async () => {
            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: `${testRoot}/does-not-exist.txt`
            });
            expect(response.status).toBe(404);
        });

        test('rejects malformed file paths', async () => {
            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: '../../etc/passwd'
            });
            expect(response.status).toBe(400);
        });

        test('rejects unauthenticated requests', async () => {
            await testStartup.logout();

            const response = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath
            });
            expect(response.status).toBe(401);

            await testStartup.loginAsUser('creator');
        });
    });

    // =========================================================================
    // Delivery log, listing and secret handling
    // =========================================================================
    describe('Delivery log and listing', () => {
        test('owner sees delivery history including failures', async () => {
            const response = await client.get(`/api/v1/integrations/${personalIntegration.id}/deliveries`);

            expect(response.status).toBe(200);
            expect(response.data.stats.totalDeliveries).toBeGreaterThanOrEqual(3);
            expect(response.data.stats.failedDeliveries).toBeGreaterThanOrEqual(1);
            expect(response.data.deliveries.length).toBeGreaterThan(0);

            const entry = response.data.deliveries[0];
            expect(entry).toHaveProperty('filePath');
            expect(entry).toHaveProperty('success');
            expect(entry).toHaveProperty('sentAt');
        });

        test('non-owner cannot read the delivery log', async () => {
            await testStartup.loginAsUser('user');

            const response = await client.get(`/api/v1/integrations/${personalIntegration.id}/deliveries`);
            expect(response.status).toBe(403);
        });

        test('listing hides other users\' personal integrations but shows global ones', async () => {
            await testStartup.loginAsUser('user');

            const response = await client.get('/api/v1/integrations');
            expect(response.status).toBe(200);

            const ids = response.data.integrations.map(i => i.id);
            expect(ids).toContain(globalIntegration.id);
            expect(ids).not.toContain(personalIntegration.id);
        });

        test('admin sees all integrations', async () => {
            await testStartup.loginAsUser('admin');

            const response = await client.get('/api/v1/integrations');
            const ids = response.data.integrations.map(i => i.id);
            expect(ids).toContain(globalIntegration.id);
            expect(ids).toContain(personalIntegration.id);
        });

        test('integration payloads never expose secrets', async () => {
            const listResponse = await client.get('/api/v1/integrations');
            for (const integration of listResponse.data.integrations) {
                expect(integration.signingSecret).toBeUndefined();
                expect(integration.apiKey).toBeUndefined();
            }

            const getResponse = await client.get(`/api/v1/integrations/${personalIntegration.id}`);
            expect(getResponse.status).toBe(200);
            expect(getResponse.data.integration.signingSecret).toBeUndefined();
            expect(getResponse.data.integration.apiKey).toBeUndefined();
        });
    });

    // =========================================================================
    // Lifecycle: URL changes, rotation, disable, delete
    // =========================================================================
    describe('Integration lifecycle', () => {
        test('changing the URL resets verification and blocks sending until re-verified', async () => {
            const patchResponse = await client.patch(`/api/v1/integrations/${personalIntegration.id}`, {
                baseUrl: `${RECEIVER_URL}?v=2`
            });
            expect(patchResponse.status).toBe(200);
            expect(patchResponse.data.integration.status).toBe('pending');

            const sendResponse = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath
            });
            expect(sendResponse.status).toBe(403);

            // Re-verify to restore
            const verifyResponse = await client.post(`/api/v1/integrations/${personalIntegration.id}/verify`);
            expect(verifyResponse.status).toBe(200);
            expect(verifyResponse.data.integration.status).toBe('verified');
        });

        test('rotating the signing secret signs subsequent deliveries with the new secret', async () => {
            const rotateResponse = await client.post(`/api/v1/integrations/${personalIntegration.id}/rotate-secret`);
            expect(rotateResponse.status).toBe(200);
            const newSecret = rotateResponse.data.signingSecret;
            expect(newSecret).toMatch(/^[a-f0-9]{64}$/);
            expect(newSecret).not.toBe(personalSecret);

            receiver.reset();
            const sendResponse = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath
            });
            expect(sendResponse.status).toBe(200);

            const request = receiver.lastRequest();
            expect(verifySignature(personalSecret, request)).toBe(false); // old secret invalid
            expect(verifySignature(newSecret, request)).toBe(true);       // new secret valid

            personalSecret = newSecret;
        });

        test('disabled integrations refuse deliveries and verification', async () => {
            const disableResponse = await client.patch(`/api/v1/integrations/${personalIntegration.id}`, {
                status: 'disabled'
            });
            expect(disableResponse.status).toBe(200);
            expect(disableResponse.data.integration.status).toBe('disabled');

            const sendResponse = await client.post(`/api/v1/integrations/${personalIntegration.id}/send`, {
                filePath: sampleFilePath
            });
            expect(sendResponse.status).toBe(403);
            expect(sendResponse.data.message).toMatch(/disabled/i);

            const verifyResponse = await client.post(`/api/v1/integrations/${personalIntegration.id}/verify`);
            expect(verifyResponse.status).toBe(400);
        });

        test('status cannot be forced to verified through updates', async () => {
            const response = await client.patch(`/api/v1/integrations/${personalIntegration.id}`, {
                status: 'verified'
            });
            // Joi only allows status: 'disabled' — anything else is rejected
            expect(response.status).toBe(400);
        });

        test('non-owner cannot delete someone else\'s integration', async () => {
            await testStartup.loginAsUser('user');

            const response = await client.delete(`/api/v1/integrations/${personalIntegration.id}`);
            expect(response.status).toBe(403);
        });

        test('owner deletes their integration', async () => {
            const response = await client.delete(`/api/v1/integrations/${personalIntegration.id}`);
            expect(response.status).toBe(200);

            const getResponse = await client.get(`/api/v1/integrations/${personalIntegration.id}`);
            expect(getResponse.status).toBe(404);
        });

        test('admin deletes the global integration', async () => {
            await testStartup.loginAsUser('admin');

            const response = await client.delete(`/api/v1/integrations/${globalIntegration.id}`);
            expect(response.status).toBe(200);
        });
    });
});
