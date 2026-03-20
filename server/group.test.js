/**
 * Group System Test Suite
 * Tests all group endpoints at /api/v1/groups
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import TestStartup from '../utils/test.startup.js';

describe('Group System Tests', () => {
    let testStartup;
    let client;
    let ownerUser;
    let memberUser;
    let outsiderUser;
    let creatorUser;
    let groupId;
    let publicGroupId;
    let testFileId;

    beforeAll(async () => {
        testStartup = new TestStartup('group');
        await testStartup.initialize();
        client = testStartup.getClient();

        // Create mutable users for group operations
        ownerUser = await testStartup.createMutableUser({ role: 'CREATOR', firstName: 'Group', lastName: 'Owner', prefix: 'grp_owner' });
        memberUser = await testStartup.createMutableUser({ role: 'USER', firstName: 'Group', lastName: 'Member', prefix: 'grp_member' });
        outsiderUser = await testStartup.createMutableUser({ role: 'USER', firstName: 'Group', lastName: 'Outsider', prefix: 'grp_out' });
        creatorUser = await testStartup.createMutableUser({ role: 'CREATOR', firstName: 'Group', lastName: 'Creator', prefix: 'grp_creator' });

        // Create a test file to share later
        await loginAs(ownerUser);
        const testRoot = `/grp-test-${Date.now()}`;
        await client.post('/api/v1/files/directory', { dirPath: testRoot, description: 'Group test dir' });
        const fileResp = await client.post('/api/v1/files', {
            filePath: `${testRoot}/shared.txt`,
            content: 'File for group sharing',
            description: 'Test file for groups'
        });
        testFileId = fileResp.data.file?.id || fileResp.data.file?._id;

        console.log('Group tests initialized on port:', testStartup.port, 'DB:', testStartup.dbName);
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
    // POST /api/v1/groups - Create Group
    // =========================================================================
    describe('POST /api/v1/groups - Create Group', () => {
        it('should create a private group', async () => {
            await loginAs(ownerUser);
            const response = await client.post('/api/v1/groups', {
                name: 'Test Private Group',
                description: 'A private group for testing',
                privacy: 'private'
            });

            expect(response.status).toBe(201);
            expect(response.data.success).toBe(true);
            expect(response.data.data).toHaveProperty('_id');
            expect(response.data.data.name).toBe('Test Private Group');
            expect(response.data.data.privacy).toBe('private');
            expect(response.data.data.members).toHaveLength(1);
            expect(response.data.data.members[0].role).toBe('OWNER');

            groupId = response.data.data._id;
        });

        it('should create a public group', async () => {
            await loginAs(ownerUser);
            const response = await client.post('/api/v1/groups', {
                name: 'Test Public Group',
                description: 'A public group',
                privacy: 'public'
            });

            expect(response.status).toBe(201);
            expect(response.data.data.privacy).toBe('public');
            publicGroupId = response.data.data._id;
        });

        it('should reject missing name', async () => {
            await loginAs(ownerUser);
            const response = await client.post('/api/v1/groups', {
                description: 'No name provided'
            });

            expect(response.status).toBe(400);
            expect(response.data.success).toBe(false);
        });

        it('should require authentication', async () => {
            client.clearCookies();
            const response = await client.post('/api/v1/groups', {
                name: 'Anon group'
            });

            expect(response.status).toBe(401);
        });
    });

    // =========================================================================
    // GET /api/v1/groups - List My Groups
    // =========================================================================
    describe('GET /api/v1/groups - List My Groups', () => {
        it('should list groups the user belongs to', async () => {
            await loginAs(ownerUser);
            const response = await client.get('/api/v1/groups');

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(Array.isArray(response.data.data)).toBe(true);
            expect(response.data.pagination).toBeDefined();
            expect(response.data.data.length).toBeGreaterThanOrEqual(2);
        });

        it('should return empty for user with no groups', async () => {
            await loginAs(outsiderUser);
            const response = await client.get('/api/v1/groups');

            expect(response.status).toBe(200);
            expect(response.data.data).toEqual([]);
        });

        it('should support pagination', async () => {
            await loginAs(ownerUser);
            const response = await client.get('/api/v1/groups?page=1&limit=1');

            expect(response.status).toBe(200);
            expect(response.data.pagination.page).toBe(1);
            expect(response.data.pagination.limit).toBe(1);
            expect(response.data.data.length).toBeLessThanOrEqual(1);
        });
    });

    // =========================================================================
    // GET /api/v1/groups/discover - Discover Public Groups
    // =========================================================================
    describe('GET /api/v1/groups/discover - Discover Public Groups', () => {
        it('should list public groups', async () => {
            await loginAs(outsiderUser);
            const response = await client.get('/api/v1/groups/discover');

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(Array.isArray(response.data.data)).toBe(true);
            expect(response.data.pagination).toBeDefined();
        });

        it('should support search by name', async () => {
            await loginAs(outsiderUser);
            const response = await client.get('/api/v1/groups/discover?search=Public');

            expect(response.status).toBe(200);
            expect(response.data.data.length).toBeGreaterThanOrEqual(1);
        });
    });

    // =========================================================================
    // GET /api/v1/groups/:groupId - Get Group Details
    // =========================================================================
    describe('GET /api/v1/groups/:groupId - Get Group Details', () => {
        it('should return group details for a member', async () => {
            await loginAs(ownerUser);
            const response = await client.get(`/api/v1/groups/${groupId}`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.data._id).toBe(groupId);
            expect(response.data.data.name).toBe('Test Private Group');
            expect(response.data.data.members).toBeDefined();
        });

        it('should deny access for non-member on private group', async () => {
            await loginAs(outsiderUser);
            const response = await client.get(`/api/v1/groups/${groupId}`);

            expect(response.status).toBe(403);
            expect(response.data.success).toBe(false);
        });
    });

    // =========================================================================
    // POST /api/v1/groups/:groupId/members - Add Member
    // =========================================================================
    describe('POST /api/v1/groups/:groupId/members - Add Member', () => {
        it('should add a member as group owner', async () => {
            await loginAs(ownerUser);
            const response = await client.post(`/api/v1/groups/${groupId}/members`, {
                userId: memberUser.id,
                role: 'MEMBER'
            });

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'Member added successfully'
            });
        });

        it('should add a creator-role member', async () => {
            await loginAs(ownerUser);
            const response = await client.post(`/api/v1/groups/${groupId}/members`, {
                userId: creatorUser.id,
                role: 'CREATOR'
            });

            expect(response.status).toBe(200);
        });

        it('should reject adding a user that is already a member', async () => {
            await loginAs(ownerUser);
            const response = await client.post(`/api/v1/groups/${groupId}/members`, {
                userId: memberUser.id,
                role: 'MEMBER'
            });

            expect(response.status).toBe(400);
            expect(response.data.message).toMatch(/already a member/i);
        });

        it('should reject assigning a role equal to or higher than own', async () => {
            await loginAs(ownerUser);
            const response = await client.post(`/api/v1/groups/${groupId}/members`, {
                userId: outsiderUser.id,
                role: 'OWNER'
            });

            expect(response.status).toBe(403);
        });

        it('should deny non-admin members from adding users', async () => {
            await loginAs(memberUser);
            const response = await client.post(`/api/v1/groups/${groupId}/members`, {
                userId: outsiderUser.id,
                role: 'MEMBER'
            });

            expect(response.status).toBe(403);
        });
    });

    // =========================================================================
    // PATCH /api/v1/groups/:groupId/members/:userId - Update Member Role
    // =========================================================================
    describe('PATCH /api/v1/groups/:groupId/members/:userId - Update Member Role', () => {
        it('should update a member role', async () => {
            await loginAs(ownerUser);
            const response = await client.patch(`/api/v1/groups/${groupId}/members/${memberUser.id}`, {
                role: 'CREATOR'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.message).toMatch(/CREATOR/);
        });

        it('should reject promoting to equal or higher role', async () => {
            await loginAs(ownerUser);
            const response = await client.patch(`/api/v1/groups/${groupId}/members/${memberUser.id}`, {
                role: 'OWNER'
            });

            expect(response.status).toBe(403);
        });

        it('should reject changing the owner role', async () => {
            await loginAs(ownerUser);
            const response = await client.patch(`/api/v1/groups/${groupId}/members/${ownerUser.id}`, {
                role: 'MEMBER'
            });

            expect(response.status).toBe(403);
        });
    });

    // =========================================================================
    // PATCH /api/v1/groups/:groupId - Update Group
    // =========================================================================
    describe('PATCH /api/v1/groups/:groupId - Update Group', () => {
        it('should update group details as owner', async () => {
            await loginAs(ownerUser);
            const response = await client.patch(`/api/v1/groups/${groupId}`, {
                name: 'Updated Group Name',
                description: 'Updated description'
            });

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(response.data.data.name).toBe('Updated Group Name');
        });

        it('should deny members from updating group details', async () => {
            await loginAs(memberUser);
            const response = await client.patch(`/api/v1/groups/${groupId}`, {
                name: 'Nope'
            });

            expect(response.status).toBe(403);
        });
    });

    // =========================================================================
    // POST /api/v1/groups/:groupId/join - Join Public Group
    // =========================================================================
    describe('POST /api/v1/groups/:groupId/join - Join Public Group', () => {
        it('should allow joining a public group', async () => {
            await loginAs(outsiderUser);
            const response = await client.post(`/api/v1/groups/${publicGroupId}/join`);

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'Joined group successfully'
            });
        });

        it('should reject joining if already a member', async () => {
            await loginAs(outsiderUser);
            const response = await client.post(`/api/v1/groups/${publicGroupId}/join`);

            expect(response.status).toBe(400);
            expect(response.data.message).toMatch(/already a member/i);
        });

        it('should reject joining a private group', async () => {
            await loginAs(outsiderUser);
            const response = await client.post(`/api/v1/groups/${groupId}/join`);

            expect(response.status).toBe(403);
            expect(response.data.message).toMatch(/private/i);
        });
    });

    // =========================================================================
    // POST /api/v1/groups/:groupId/files - Share File to Group
    // =========================================================================
    describe('POST /api/v1/groups/:groupId/files - Share File', () => {
        it('should share a file to a group as creator-role member', async () => {
            await loginAs(creatorUser);
            const response = await client.post(`/api/v1/groups/${groupId}/files`, {
                fileId: testFileId,
                caption: 'Check out this file!'
            });

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'File shared to group successfully'
            });
        });

        it('should reject sharing the same file again', async () => {
            await loginAs(creatorUser);
            const response = await client.post(`/api/v1/groups/${groupId}/files`, {
                fileId: testFileId
            });

            expect(response.status).toBe(400);
            expect(response.data.message).toMatch(/already shared/i);
        });

        it('should reject duplicate share from another creator', async () => {
            await loginAs(memberUser);
            const response = await client.post(`/api/v1/groups/${groupId}/files`, {
                fileId: testFileId
            });

            // memberUser was promoted to CREATOR earlier, so they have share permission,
            // but the file is already shared → 400
            expect(response.status).toBe(400);
            expect(response.data.message).toMatch(/already shared/i);
        });

        it('should return 404 for non-existent file', async () => {
            await loginAs(creatorUser);
            const fakeFileId = '000000000000000000000000';
            const response = await client.post(`/api/v1/groups/${groupId}/files`, {
                fileId: fakeFileId
            });

            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // GET /api/v1/groups/:groupId/files - Get Group Files (Timeline)
    // =========================================================================
    describe('GET /api/v1/groups/:groupId/files - Group Timeline', () => {
        it('should return group files for a member', async () => {
            await loginAs(memberUser);
            const response = await client.get(`/api/v1/groups/${groupId}/files`);

            expect(response.status).toBe(200);
            expect(response.data.success).toBe(true);
            expect(Array.isArray(response.data.data)).toBe(true);
            expect(response.data.pagination).toBeDefined();

            if (response.data.data.length > 0) {
                const item = response.data.data[0];
                expect(item).toHaveProperty('file');
                expect(item).toHaveProperty('sharedBy');
                expect(item).toHaveProperty('sharedAt');
                expect(item).toHaveProperty('caption');
                expect(item).toHaveProperty('pinned');
            }
        });

        it('should deny non-members from viewing group files', async () => {
            await loginAs(outsiderUser);
            const response = await client.get(`/api/v1/groups/${groupId}/files`);

            expect(response.status).toBe(403);
        });

        it('should support pagination', async () => {
            await loginAs(memberUser);
            const response = await client.get(`/api/v1/groups/${groupId}/files?page=1&limit=5`);

            expect(response.status).toBe(200);
            expect(response.data.pagination.page).toBe(1);
            expect(response.data.pagination.limit).toBe(5);
        });
    });

    // =========================================================================
    // PATCH /api/v1/groups/:groupId/files/:fileId - Update Group File
    // =========================================================================
    describe('PATCH /api/v1/groups/:groupId/files/:fileId - Update Group File', () => {
        it('should pin a file as admin/owner', async () => {
            await loginAs(ownerUser);
            const response = await client.patch(`/api/v1/groups/${groupId}/files/${testFileId}`, {
                pinned: true,
                caption: 'Pinned update'
            });

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'Group file updated'
            });
        });

        it('should deny members from updating file metadata', async () => {
            await loginAs(memberUser);
            const response = await client.patch(`/api/v1/groups/${groupId}/files/${testFileId}`, {
                pinned: false
            });

            // memberUser is CREATOR; route requires ADMIN+ → 403
            expect(response.status).toBe(403);
        });
    });

    // =========================================================================
    // DELETE /api/v1/groups/:groupId/files/:fileId - Remove File from Group
    // =========================================================================
    describe('DELETE /api/v1/groups/:groupId/files/:fileId - Remove File', () => {
        it('should remove a file from the group as owner', async () => {
            await loginAs(ownerUser);
            const response = await client.delete(`/api/v1/groups/${groupId}/files/${testFileId}`);

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'File removed from group'
            });
        });

        it('should return 404 for file not in group', async () => {
            await loginAs(ownerUser);
            const response = await client.delete(`/api/v1/groups/${groupId}/files/${testFileId}`);

            expect(response.status).toBe(404);
        });
    });

    // =========================================================================
    // PATCH /api/v1/groups/:groupId/transfer - Transfer Ownership
    // =========================================================================
    describe('PATCH /api/v1/groups/:groupId/transfer - Transfer Ownership', () => {
        it('should transfer ownership to another member', async () => {
            await loginAs(ownerUser);
            const response = await client.patch(`/api/v1/groups/${groupId}/transfer`, {
                userId: creatorUser.id
            });

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'Ownership transferred successfully'
            });
        });

        it('should deny non-owner from transferring', async () => {
            // ownerUser is now ADMIN after transfer
            await loginAs(ownerUser);
            const response = await client.patch(`/api/v1/groups/${groupId}/transfer`, {
                userId: memberUser.id
            });

            expect(response.status).toBe(403);
        });

        it('should reject transfer to non-member', async () => {
            await loginAs(creatorUser); // now the owner
            const fakeId = '000000000000000000000000';
            const response = await client.patch(`/api/v1/groups/${groupId}/transfer`, {
                userId: fakeId
            });

            expect(response.status).toBe(400);
        });
    });

    // =========================================================================
    // POST /api/v1/groups/:groupId/leave - Leave Group
    // =========================================================================
    describe('POST /api/v1/groups/:groupId/leave - Leave Group', () => {
        it('should allow a member to leave', async () => {
            await loginAs(memberUser);
            const response = await client.post(`/api/v1/groups/${groupId}/leave`);

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'You have left the group'
            });
        });

        it('should reject leaving if not a member', async () => {
            await loginAs(memberUser);
            const response = await client.post(`/api/v1/groups/${groupId}/leave`);

            expect(response.status).toBe(403);
        });

        it('should prevent owner from leaving', async () => {
            await loginAs(creatorUser); // current owner
            const response = await client.post(`/api/v1/groups/${groupId}/leave`);

            expect(response.status).toBe(403);
            expect(response.data.message).toMatch(/owner/i);
        });
    });

    // =========================================================================
    // DELETE /api/v1/groups/:groupId/members/:userId - Remove Member
    // =========================================================================
    describe('DELETE /api/v1/groups/:groupId/members/:userId - Remove Member', () => {
        it('should allow owner to remove a member', async () => {
            // First re-add ownerUser (who is ADMIN) — actually let's add outsiderUser
            await loginAs(creatorUser); // owner
            await client.post(`/api/v1/groups/${groupId}/members`, {
                userId: outsiderUser.id,
                role: 'MEMBER'
            });

            const response = await client.delete(`/api/v1/groups/${groupId}/members/${outsiderUser.id}`);

            expect(response.status).toBe(200);
            expect(response.data.message).toMatch(/removed/i);
        });

        it('should return 404 for non-member', async () => {
            await loginAs(creatorUser);
            const response = await client.delete(`/api/v1/groups/${groupId}/members/${outsiderUser.id}`);

            expect(response.status).toBe(404);
        });

        it('should prevent removing the owner', async () => {
            await loginAs(ownerUser); // ADMIN role now
            const response = await client.delete(`/api/v1/groups/${groupId}/members/${creatorUser.id}`);

            expect(response.status).toBe(403);
        });
    });

    // =========================================================================
    // DELETE /api/v1/groups/:groupId - Delete Group
    // =========================================================================
    describe('DELETE /api/v1/groups/:groupId - Delete Group', () => {
        it('should deny non-owner from deleting', async () => {
            await loginAs(ownerUser); // now ADMIN
            const response = await client.delete(`/api/v1/groups/${groupId}`);

            expect(response.status).toBe(403);
        });

        it('should delete group as owner', async () => {
            await loginAs(creatorUser); // current owner
            const response = await client.delete(`/api/v1/groups/${groupId}`);

            expect(response.status).toBe(200);
            expect(response.data).toEqual({
                success: true,
                message: 'Group deleted successfully'
            });
        });

        it('should return 404 for deleted group', async () => {
            await loginAs(creatorUser);
            const response = await client.get(`/api/v1/groups/${groupId}`);

            expect(response.status).toBe(404);
        });
    });
});
