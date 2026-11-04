import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleStudentRoutes } from './routes.js';
import { studentStore } from './store.js';
import { emptyDrawing } from '../shared/drawing.js';
import { HttpError, json } from '../server/http-helpers.js';

const directory = mkdtempSync(join(tmpdir(), 'scoreler-routes-'));
const videoId = randomUUID();
const server = createServer((req, res) => {
	void handleStudentRoutes(req, res, req.method!, req.url!, directory).catch(error => {
		if (res.headersSent) res.destroy();
		else json(res, error instanceof HttpError ? error.statusCode : 500, { error: error.message });
	});
});
let base: string;
beforeAll(async () => {
	studentStore(directory).put('videos', { id: videoId, status: 'ready' });
	const videoDir = join(directory, 'teaching-videos', videoId);
	mkdirSync(videoDir, { recursive: true });
	writeFileSync(join(videoDir, 'lesson.mp4'), Buffer.from('0123456789'));
	writeFileSync(join(videoDir, 'poster.jpg'), Buffer.from('poster'));
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>(resolve => server.close(() => resolve()));
	studentStore(directory).close();
	rmSync(directory, { recursive: true, force: true });
});
const request = (path: string, method = 'GET', body?: unknown, headers?: Record<string,string>) => fetch(base + '/api/student/' + path, {
	method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
});

describe('student HTTP boundaries', () => {
	it.each([null, [], true, 1, 'text'])('rejects a non-object request body: %j', async body => {
		const response = await request('memory', 'PUT', body);
		expect(response.status).toBe(400);
	});
	it('does not recreate a deleted mistake from a stale edit', async () => {
		const response = await request('mistakes', 'PUT', { id: randomUUID(), subject: 'Physics', topic: 'Waves', question: 'Why?' });
		expect(response.status).toBe(400);
		expect(studentStore(directory).list('mistakes')).toHaveLength(0);
	});
	it('returns a complete 404 response for a missing screenshot', async () => {
		const response = await request(`mistake-images/${randomUUID()}.png`);
		expect(response.status).toBe(404);
		expect(await response.json()).toHaveProperty('error');
	});
	it('reports malformed URL encoding as a client error', async () => {
		expect((await request('capsules/%', 'DELETE')).status).toBe(400);
	});
	it('rejects corrupt note elements without changing the saved note', async () => {
		const note = emptyDrawing();
		expect((await request('workspace/drawing', 'PUT', { folderId: 'scoreler-notes', path: 'Valid.scoreler-drawing', note, create: true })).status).toBe(200);
		const corrupt = await request('workspace/drawing', 'PUT', { folderId: 'scoreler-notes', path: 'Valid.scoreler-drawing', note: { ...note, elements: [null] } });
		expect(corrupt.status).toBe(400);
		expect(await (await request('workspace/drawing?folderId=scoreler-notes&path=Valid.scoreler-drawing')).json()).toEqual(note);
	});
	it('reports an existing folder as an actionable client error', async () => {
		const body = { folderId: 'scoreler-notes', path: '', name: 'Physics' };
		expect((await request('workspace/directory', 'POST', body)).status).toBe(201);
		expect((await request('workspace/directory', 'POST', body)).status).toBe(400);
	});
	it('rejects invalid appearance settings as a client error', async () => {
		expect((await request('appearance', 'PUT', { selected: null, themes: [{ id: 'invalid' }] })).status).toBe(400);
	});
});

describe('video byte ranges', () => {
	it.each(['bytes=0-2', 'bytes=7-', 'bytes=-3'])('serves a valid range %s', async range => {
		const response = await request(`videos/${videoId}/media`, 'GET', undefined, { Range: range });
		expect(response.status).toBe(206);
		expect(await response.text()).toBe(range === 'bytes=0-2' ? '012' : '789');
	});
	it.each(['bytes=-', 'bytes=-0', 'bytes=20-', 'bytes=3-1', 'bytes=0-1,5-7'])('rejects an invalid range %s', async range => {
		const response = await request(`videos/${videoId}/media`, 'GET', undefined, { Range: range });
		expect(response.status).toBe(416);
		expect(response.headers.get('content-range')).toBe('bytes */10');
		await response.arrayBuffer();
	});
	it('downloads a poster with a JPEG filename', async () => {
		const response = await request(`videos/${videoId}/poster?download`);
		expect(response.headers.get('content-disposition')).toContain('.jpg');
		await response.arrayBuffer();
	});
});
