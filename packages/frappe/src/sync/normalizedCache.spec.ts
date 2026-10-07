import { beforeEach, describe, expect, it } from 'vitest';

import { NormalizedCache } from './normalizedCache';

describe(NormalizedCache, () => {
  let cache: NormalizedCache;

  beforeEach(() => {
    cache = new NormalizedCache();
  });

  describe('upsert', () => {
    it('should insert a new document', () => {
      const doc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
        status: 'Open',
      };
      cache.upsert(doc);
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toEqual(doc);
      expect(cache.state.Task.allIds).toContain('TASK-001');
    });

    it('should update an existing document', () => {
      const originalDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Original Task',
        status: 'Open',
      };
      const updatedDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Updated Task',
        status: 'Closed',
      };
      cache.upsert(originalDoc);
      cache.upsert(updatedDoc);
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toEqual(updatedDoc);
      expect(cache.state.Task.allIds).toHaveLength(1);
      expect(cache.state.Task.allIds).toContain('TASK-001');
    });

    it("should create bucket if it doesn't exist", () => {
      expect(cache.state.Task).toBeUndefined();
      const doc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
      };
      cache.upsert(doc);
      expect(cache.state.Task).toBeDefined();
      expect(cache.state.Task.byId).toBeDefined();
      expect(cache.state.Task.allIds).toBeDefined();
    });

    it('should handle document without name', () => {
      const doc = {
        doctype: 'Task',
        title: 'Test Task',
      } as any;
      cache.upsert(doc);
      expect(cache.state.Task).toBeDefined();
      expect(cache.state.Task.allIds).toHaveLength(0);
      expect(Object.keys(cache.state.Task.byId)).toHaveLength(0);
    });

    it('should preserve unprojected fields on narrow-projection upsert', () => {
      const fullDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
        status: 'Open',
        description: 'Long description',
        owner: 'user@example.com',
      };
      const narrowDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Renamed Task',
      };
      cache.upsert(fullDoc);
      cache.upsert(narrowDoc);
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toEqual({
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Renamed Task',
        status: 'Open',
        description: 'Long description',
        owner: 'user@example.com',
      });
    });

    it('should overwrite a field present with null (cleared server-side)', () => {
      const fullDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
        status: 'Open',
        description: 'Long description',
      };
      const clearedDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        description: null,
      } as any;
      cache.upsert(fullDoc);
      cache.upsert(clearedDoc);
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved?.description).toBeNull();
      expect(retrieved?.title).toBe('Test Task');
      expect(retrieved?.status).toBe('Open');
    });

    it('should replace values present on a full-doc upsert', () => {
      const originalDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Original Task',
        status: 'Open',
        description: 'Original description',
      };
      const fullUpdate = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Updated Task',
        status: 'Closed',
        description: '',
      };
      cache.upsert(originalDoc);
      cache.upsert(fullUpdate);
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toEqual(fullUpdate);
    });

    it('should drop fields absent from the incoming doc when replace is true', () => {
      const optimisticDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Optimistic Task',
        status: 'Open',
        extraField: 'added optimistically',
      };
      const snapshot = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Snapshot Task',
        status: 'Open',
      };
      cache.upsert(optimisticDoc);
      cache.upsert(snapshot, { replace: true });
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toEqual(snapshot);
      expect(retrieved).not.toHaveProperty('extraField');
    });

    it('should not mutate the previously cached object when merging', () => {
      const originalDoc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Original Task',
        status: 'Open',
      };
      cache.upsert(originalDoc);
      cache.upsert({ name: 'TASK-001', doctype: 'Task', title: 'Updated' });
      expect(originalDoc.title).toBe('Original Task');
    });

    it('should handle multiple doctypes', () => {
      const task = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
      };
      const project = {
        name: 'PROJ-001',
        doctype: 'Project',
        title: 'Test Project',
      };
      cache.upsert(task);
      cache.upsert(project);
      expect(cache.get({ doctype: 'Task', name: 'TASK-001' })).toEqual(task);
      expect(cache.get({ doctype: 'Project', name: 'PROJ-001' })).toEqual(project);
      expect(cache.state.Task.allIds).toContain('TASK-001');
      expect(cache.state.Project.allIds).toContain('PROJ-001');
    });
  });

  describe('get', () => {
    it('should retrieve an existing document', () => {
      const doc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
      };
      cache.upsert(doc);
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toEqual(doc);
    });

    it('should return undefined for non-existent document', () => {
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-999' });
      expect(retrieved).toBeUndefined();
    });

    it('should return undefined for non-existent doctype', () => {
      const retrieved = cache.get({
        doctype: 'NonExistentDoctype',
        name: 'DOC-001',
      });
      expect(retrieved).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove an existing document', () => {
      const doc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
      };
      cache.upsert(doc);
      cache.remove({ doctype: 'Task', name: 'TASK-001' });
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toBeUndefined();
      expect(cache.state.Task.allIds).not.toContain('TASK-001');
    });

    it('should handle removing non-existent document gracefully', () => {
      const doc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Test Task',
      };
      cache.upsert(doc);
      expect(() => {
        cache.remove({ doctype: 'Task', name: 'TASK-999' });
      }).not.toThrow();
      expect(cache.get({ doctype: 'Task', name: 'TASK-001' })).toEqual(doc);
    });

    it('should handle removing from non-existent doctype gracefully', () => {
      expect(() => {
        cache.remove({ doctype: 'NonExistentDoctype', name: 'DOC-001' });
      }).not.toThrow();
    });

    it('should properly update allIds when removing', () => {
      const doc1 = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Task 1',
      };
      const doc2 = {
        name: 'TASK-002',
        doctype: 'Task',
        title: 'Task 2',
      };
      const doc3 = {
        name: 'TASK-003',
        doctype: 'Task',
        title: 'Task 3',
      };
      cache.upsert(doc1);
      cache.upsert(doc2);
      cache.upsert(doc3);
      expect(cache.state.Task.allIds).toHaveLength(3);
      cache.remove({ doctype: 'Task', name: 'TASK-002' });
      expect(cache.state.Task.allIds).toHaveLength(2);
      expect(cache.state.Task.allIds).toContain('TASK-001');
      expect(cache.state.Task.allIds).toContain('TASK-003');
      expect(cache.state.Task.allIds).not.toContain('TASK-002');
    });
  });

  describe('state management', () => {
    it('should maintain separate buckets for different doctypes', () => {
      const task1 = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Task 1',
      };
      const task2 = {
        name: 'TASK-002',
        doctype: 'Task',
        title: 'Task 2',
      };
      const project = {
        name: 'PROJ-001',
        doctype: 'Project',
        title: 'Project 1',
      };
      cache.upsert(task1);
      cache.upsert(task2);
      cache.upsert(project);
      expect(cache.state.Task.allIds).toHaveLength(2);
      expect(cache.state.Project.allIds).toHaveLength(1);
      expect(Object.keys(cache.state)).toHaveLength(2);
    });

    it('should maintain insertion order in allIds', () => {
      const docs = [
        { name: 'TASK-003', doctype: 'Task', title: 'Task 3' },
        { name: 'TASK-001', doctype: 'Task', title: 'Task 1' },
        { name: 'TASK-002', doctype: 'Task', title: 'Task 2' },
      ];
      docs.forEach((doc) => {
        cache.upsert(doc);
      });
      expect(cache.state.Task.allIds).toEqual(['TASK-003', 'TASK-001', 'TASK-002']);
    });

    it('should not duplicate IDs when updating', () => {
      const doc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Original',
      };
      cache.upsert(doc);
      cache.upsert({ ...doc, title: 'Updated 1' });
      cache.upsert({ ...doc, title: 'Updated 2' });
      cache.upsert({ ...doc, title: 'Updated 3' });
      expect(cache.state.Task.allIds).toHaveLength(1);
      expect(cache.state.Task.allIds).toContain('TASK-001');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string as document name', () => {
      const doc = {
        name: '',
        doctype: 'Task',
        title: 'Test Task',
      };
      cache.upsert(doc);
      expect(cache.state.Task).toBeDefined();
      expect(cache.state.Task.allIds).toHaveLength(0);
      expect(Object.keys(cache.state.Task.byId)).toHaveLength(0);
    });

    it('should handle complex document structures', () => {
      const doc = {
        name: 'TASK-001',
        doctype: 'Task',
        title: 'Complex Task',
        metadata: {
          created_by: 'user@example.com',
          tags: ['urgent', 'important'],
          nested: {
            deeply: {
              nested: 'value',
            },
          },
        },
        items: [
          { idx: 1, description: 'Item 1' },
          { idx: 2, description: 'Item 2' },
        ],
      };
      cache.upsert(doc);
      const retrieved = cache.get({ doctype: 'Task', name: 'TASK-001' });
      expect(retrieved).toEqual(doc);
      expect(retrieved?.metadata).toEqual(doc.metadata);
      expect(retrieved?.items).toEqual(doc.items);
    });
  });
});
