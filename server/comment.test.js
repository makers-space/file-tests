/**
 * Comment System Test Suite
 * Tests all comment endpoints at /api/v1/comments
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import TestStartup from '../utils/test.startup.js';

describe('Comment System Tests', () => {
    let testStartup;
    let client;
    let fileOwner;
    let commenter;
    let outsiderUser;
    let testFileId;
    let testGroupId;
    let commentId;
    let replyId;

    beforeAll(async () => {
        testStartup = new TestStartup('comment');
        await testStartup.initialize();
        client = testStartup.getClient();

        // Create mutable users
        fileOwner = await testStartup.createMutableUser({ role: 'CREATOR', firstName: 'File', lastName: 'Owner', prefix: 'cmt_owner' });
        commenter = await testStartup.createMutableUser({ role: 'CREATOR', firstName: 'Comment', lastName: 'Author', prefix: 'cmt_author' });
        outsiderUser = await testStartup.createMutableUser({ role: 'USER', firstName: 'Comment', lastName: 'Outsider', prefix: 'cmt_out' });

        // Create a file to comment on
        await loginAs(fileOwner);
        const testRoot = `/cmt-test-${Date.now()}`;
        await client.post('/api/v1/files/directory', { dirPath: testRoot, description: 'Comment test dir' });
        const fileResp = await client.post('/api/v1/files', {
            filePath: `${testRoot}/commentable.txt`,
            content: 'This file has comments',
            description: 'Test file for comments'
        });
        testFileId = fileResp.data.file?.id || fileResp.data.file?._id;

        // Share with commenter so they have read access
        await client.post(`/api/v1/files/${encodeURIComponent(`${testRoot}/commentable.txt`)}/share`, {
            userIds: [commenter.id],
            permission: 'read'
        });

        // Create a group and share the file there for group-context comment tests
        const groupResp = await client.post('/api/v1/groups', {
            name: 'Comment Test Group',
            description: 'Group for comment testing',
            privacy: 'private'
        });
        testGroupId = groupResp.data.data._id;

        // Add commenter to group with CREATOR role
        await client.post(`/api/v1/groups/${testGroupId}/members`, {
            userId: commenter.id,
            role: 'CREATOR'
        });

        // Share file to group
        await client.post(`/api/v1/groups/${testGroupId}/files`, {
            fileId: testFileId,
            caption: 'File for comment testing'
        });

        console.log('Comment tests initialized on port:', testStartup.port, 'DB:', testStartup.dbName);
    }, 120000);

    afterAll(async () => {
        await testStartup.cleanup();
    }, 30000);

    const loginAs = async (mutableUser) => {
        const response = await client.post('/api/v1/auth/login', mutableUser.credentials);
        expect(response.status).toBe(200);
        return response;
    };

    // =========================================================================
    // POST /api/v1/comments - Create Comment
    // =========================================================================
    describe('POST /api/v1/comments - Create Comment', () => {
        it('should create a comment on a file the user owns', async () => {
            await loginAs(fileOwner);
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'This is my first comment!'
            });

            expect(response.status).toBe(201);
            expect(response.data.success).toBe(true);
            expect(response.data.data).toHaveProperty('_id');
            expect(response.data.data.body).toBe('This is my first comment!');
            expect(response.data.data.file).toBe(testFileId);
            expect(response.data.data.author).toHaveProperty('firstName');

            commentId = response.data.data._id;
        });

        it('should create a comment with read permission', async () => {
            await loginAs(commenter);
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Comment from a reader'
            });

            expect(response.status).toBe(201);
            expect(response.data.data.body).toBe('Comment from a reader');
        });

        it('should create a group-context comment', async () => {
            await loginAs(commenter);
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Group comment!',
                groupId: testGroupId
            });

            expect(response.status).toBe(201);
            expect(response.data.data.group).toBe(testGroupId);
        });

        it('should create a reply to an existing comment', async () => {
            await loginAs(fileOwner);
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'This is a reply',
                parentComment: commentId
            });

            expect(response.status).toBe(201);
            expect(response.data.data.parentComment).toBe(commentId);
            replyId = response.data.data._id;
        });

        it('should reject comment from user without access', async () => {
            await loginAs(outsiderUser);
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Should fail'
            });

            expect(response.status).toBe(403);
            expect(response.data.success).toBe(false);
        });

        it('should reject comment on non-existent file', async () => {
            await loginAs(fileOwner);
            const fakeFileId = '000000000000000000000000';
            const response = await client.post('/api/v1/comments', {
                fileId: fakeFileId,
                body: 'No file'
            });

            expect(response.status).toBe(404);
        });

        it('should reject reply to non-existent parent', async () => {
            await loginAs(fileOwner);
            const fakeCommentId = '000000000000000000000000';
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Reply to nothing',
                parentComment: fakeCommentId
            });

            expect(response.status).toBe(404);
        });

        it('should reject comment with empty body', async () => {
            await loginAs(fileOwner);
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: ''
            });

            expect(response.status).toBe(400);
        });

        it('should require authentication', async () => {
            client.clearCookies();
            const response = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Anon comment'
            });

            expect(response.status).toBe(401);
        });
    });

    // =========================================================================
    // GET /api/v1/comments/file/:fileId - Get File Comments
    // =========================================================================
    describe('GET /api/v1/comments/file/:fileId - Get File Comments', () => {
        it('should return top-level comments for a file', async () => {
            await loginAs(fileOwner);
            const response = await client.get(`/api/v1/comments/file/${testFileId}`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(Array.isArray(response.data.data)).toBe(true);
            expect(response.data.pagination).toBeDefined();
            expect(response.data.pagination).toHaveProperty('page');
            expect(response.data.pagination).toHaveProperty('limit');
            expect(response.data.pagination).toHaveProperty('total');

            // Should not include replies in top-level
            const hasParent = response.data.data.some(c => c.parentComment !== null);
            expect(hasParent).toBe(false);
        });

        it('should include replyCount on each comment', async () => {
            await loginAs(fileOwner);
            const response = await client.get(`/api/v1/comments/file/${testFileId}`);

            const topComment = response.data.data.find(c => c._id === commentId);
            if (topComment) {
                expect(topComment).toHaveProperty('replyCount');
                expect(topComment.replyCount).toBeGreaterThanOrEqual(1);
            }
        });

        it('should filter by groupId', async () => {
            await loginAs(commenter);
            const response = await client.get(`/api/v1/comments/file/${testFileId}?groupId=${testGroupId}`);

            expect(response.status).toBe(200);
            response.data.data.forEach(c => {
                expect(c.group).toBe(testGroupId);
            });
        });

        it('should support pagination', async () => {
            await loginAs(fileOwner);
            const response = await client.get(`/api/v1/comments/file/${testFileId}?page=1&limit=1`);

            expect(response.status).toBe(200);
            expect(response.data.pagination.page).toBe(1);
            expect(response.data.pagination.limit).toBe(1);
            expect(response.data.data.length).toBeLessThanOrEqual(1);
        });
    });

    // =========================================================================
    // GET /api/v1/comments/:commentId/replies - Get Replies
    // =========================================================================
    describe('GET /api/v1/comments/:commentId/replies - Get Replies', () => {
        it('should return replies to a comment', async () => {
            await loginAs(fileOwner);
            const response = await client.get(`/api/v1/comments/${commentId}/replies`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(Array.isArray(response.data.data)).toBe(true);
            expect(response.data.pagination).toBeDefined();

            if (response.data.data.length > 0) {
                const reply = response.data.data[0];
                expect(reply.parentComment).toBe(commentId);
                expect(reply.author).toHaveProperty('firstName');
            }
        });

        it('should return empty for comment with no replies', async () => {
            await loginAs(fileOwner);
            const response = await client.get(`/api/v1/comments/${replyId}/replies`);

            expect(response.status).toBe(200);
            expect(response.data.data).toEqual([]);
        });
    });

    // =========================================================================
    // GET /api/v1/comments/file/:fileId/count - Get Comment Count
    // =========================================================================
    describe('GET /api/v1/comments/file/:fileId/count - Get Comment Count', () => {
        it('should return comment count for a file', async () => {
            await loginAs(fileOwner);
            const response = await client.get(`/api/v1/comments/file/${testFileId}/count`);

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                data: { count: expect.any(Number) }
            });
            expect(response.data.data.count).toBeGreaterThanOrEqual(1);
        });

        it('should filter count by groupId', async () => {
            await loginAs(fileOwner);
            const response = await client.get(`/api/v1/comments/file/${testFileId}/count?groupId=${testGroupId}`);

            expect(response.status).toBe(200);
            expect(response.data.data.count).toBeGreaterThanOrEqual(1);
        });

        it('should return 0 for file with no comments', async () => {
            await loginAs(fileOwner);
            const fakeFileId = '000000000000000000000000';
            const response = await client.get(`/api/v1/comments/file/${fakeFileId}/count`);

            expect(response.status).toBe(200);
            expect(response.data.data.count).toBe(0);
        });
    });

    // =========================================================================
    // PATCH /api/v1/comments/:commentId - Update Comment
    // =========================================================================
    describe('PATCH /api/v1/comments/:commentId - Update Comment', () => {
        it('should update own comment', async () => {
            await loginAs(fileOwner);
            const response = await client.patch(`/api/v1/comments/${commentId}`, {
                body: 'Updated comment body'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.data.body).toBe('Updated comment body');
            expect(response.data.data.editedAt).toBeDefined();
            expect(response.data.data.author).toHaveProperty('firstName');
        });

        it('should deny editing another user\'s comment', async () => {
            await loginAs(commenter);
            const response = await client.patch(`/api/v1/comments/${commentId}`, {
                body: 'Hijacked!'
            });

            expect(response.status).toBe(403);
            expect(response.data.success).toBe(false);
        });

        it('should return 404 for non-existent comment', async () => {
            await loginAs(fileOwner);
            const fakeId = '000000000000000000000000';
            const response = await client.patch(`/api/v1/comments/${fakeId}`, {
                body: 'Ghost'
            });

            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // DELETE /api/v1/comments/:commentId - Delete Comment (Soft)
    // =========================================================================
    describe('DELETE /api/v1/comments/:commentId - Delete Comment', () => {
        it('should soft-delete own comment', async () => {
            // Create a disposable comment
            await loginAs(commenter);
            const createResp = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'This will be deleted'
            });
            const disposableId = createResp.data.data._id;

            const response = await client.delete(`/api/v1/comments/${disposableId}`);

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'Comment deleted'
            });
        });

        it('should allow file owner to delete any comment', async () => {
            // commenter creates a comment, fileOwner deletes it
            await loginAs(commenter);
            const createResp = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Owner will delete this'
            });
            const targetId = createResp.data.data._id;

            await loginAs(fileOwner);
            const response = await client.delete(`/api/v1/comments/${targetId}`);

            expect(response.status).toBe(200);
            expect(response.data.message).toBe('Comment deleted');
        });

        it('should deny outsider from deleting comment', async () => {
            await loginAs(fileOwner);
            const createResp = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Protected comment'
            });
            const protectedId = createResp.data.data._id;

            await loginAs(outsiderUser);
            const response = await client.delete(`/api/v1/comments/${protectedId}`);

            expect(response.status).toBe(403);
        });

        it('should return 404 for already-deleted comment', async () => {
            await loginAs(fileOwner);
            const createResp = await client.post('/api/v1/comments', {
                fileId: testFileId,
                body: 'Delete me twice'
            });
            const id = createResp.data.data._id;

            await client.delete(`/api/v1/comments/${id}`);
            const response = await client.delete(`/api/v1/comments/${id}`);

            expect(response.status).toBe(404);
        });
    });
});
