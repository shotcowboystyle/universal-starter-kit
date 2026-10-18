import { describe, expect, it } from 'vitest';

import {
  defaultWireEndpoints,
  isConflictError,
  isNotFoundError,
  isPermissionError,
  isPreconditionFailedError,
  isValidationError,
} from './wire';
import type {
  ConflictErrorResponse,
  ConnectEvent,
  CreateRequestBody,
  CreateResponse,
  CreateWireContract,
  DeleteRequestBody,
  DeleteResponse,
  DisconnectEvent,
  DocChangedEvent,
  DocDeletedEvent,
  DocumentResponse,
  ListSinceParams,
  ListSinceResponse,
  MutationRequestHeaders,
  NotFoundErrorResponse,
  PermEpochBumpEvent,
  PermissionErrorResponse,
  PreconditionFailedResponse,
  UpdateRequestBody,
  UpdateResponse,
  UpdateWireContract,
  ValidationErrorResponse,
  WireChildTableRow,
  WireEndpoints,
  WireSuccess,
} from './wire';

describe('Wire Protocol Types', () => {
  describe('DEFAULT_WIRE_ENDPOINTS', () => {
    it('should have correct default endpoints', () => {
      expect(defaultWireEndpoints).toStrictEqual({
        create: 'my_app.api.create_doc',
        update: 'my_app.api.update_doc',
        delete: 'my_app.api.delete_doc',
        backfill: 'my_app.api.backfill',
      });
    });

    it('should have all required endpoints', () => {
      expect(defaultWireEndpoints).toHaveProperty('create');
      expect(defaultWireEndpoints).toHaveProperty('update');
      expect(defaultWireEndpoints).toHaveProperty('delete');
      expect(defaultWireEndpoints).toHaveProperty('backfill');
      expect(Object.keys(defaultWireEndpoints)).toHaveLength(4);
    });
  });

  describe('Type Guards', () => {
    describe(isConflictError, () => {
      it('should return true for conflict error', () => {
        const error: ConflictErrorResponse = {
          error: 'VERSION_MISMATCH',
          message: 'Version conflict',
          current_version: 'v2',
        };
        expect(isConflictError(error)).toBe(true);
      });

      it('should return false for non-conflict error', () => {
        expect(isConflictError({})).toBe(false);
        expect(isConflictError({ error: 'OTHER_ERROR' })).toBe(false);
        expect(isConflictError(null)).toBe(false);
        // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
        expect(isConflictError(undefined)).toBe(false);
      });

      it('should handle partial conflict error', () => {
        const error = { error: 'VERSION_MISMATCH' };
        expect(isConflictError(error)).toBe(true);
      });
    });

    describe(isPreconditionFailedError, () => {
      it('should return true for precondition failed error', () => {
        const error: PreconditionFailedResponse = {
          error: 'PRECONDITION_FAILED',
          message: 'Precondition failed',
          current_etag: 'etag123',
        };
        expect(isPreconditionFailedError(error)).toBe(true);
      });

      it('should return false for non-precondition error', () => {
        expect(isPreconditionFailedError({})).toBe(false);
        expect(isPreconditionFailedError({ error: 'OTHER' })).toBe(false);
        expect(isPreconditionFailedError(null)).toBe(false);
      });
    });

    describe(isValidationError, () => {
      it('should return true for validation error', () => {
        const error: ValidationErrorResponse = {
          exc_type: 'ValidationError',
          exception: 'Field required',
        };
        expect(isValidationError(error)).toBe(true);
      });

      it('should return false for non-validation error', () => {
        expect(isValidationError({})).toBe(false);
        expect(isValidationError({ exc_type: 'OtherError' })).toBe(false);
        expect(isValidationError(null)).toBe(false);
      });
    });

    describe(isPermissionError, () => {
      it('should return true for permission error', () => {
        const error: PermissionErrorResponse = {
          exc_type: 'PermissionError',
          exception: 'Access denied',
        };
        expect(isPermissionError(error)).toBe(true);
      });

      it('should return false for non-permission error', () => {
        expect(isPermissionError({})).toBe(false);
        expect(isPermissionError({ exc_type: 'OtherError' })).toBe(false);
        // oxlint-disable-next-line unicorn/no-useless-undefined -- the parameter is required; undefined is the case under test
        expect(isPermissionError(undefined)).toBe(false);
      });
    });

    describe(isNotFoundError, () => {
      it('should return true for not found error', () => {
        const error: NotFoundErrorResponse = {
          exc_type: 'DoesNotExistError',
          exception: 'Document not found',
        };
        expect(isNotFoundError(error)).toBe(true);
      });

      it('should return false for non-not-found error', () => {
        expect(isNotFoundError({})).toBe(false);
        expect(isNotFoundError({ exc_type: 'OtherError' })).toBe(false);
        expect(isNotFoundError(null)).toBe(false);
      });
    });

    describe('multiple type guards', () => {
      it('should correctly identify mixed error types', () => {
        const conflictErr: ConflictErrorResponse = {
          error: 'VERSION_MISMATCH',
          message: 'Conflict',
        };
        const validationErr: ValidationErrorResponse = {
          exc_type: 'ValidationError',
          exception: 'Invalid',
        };

        expect(isConflictError(conflictErr)).toBe(true);
        expect(isValidationError(conflictErr)).toBe(false);

        expect(isValidationError(validationErr)).toBe(true);
        expect(isConflictError(validationErr)).toBe(false);
      });
    });
  });

  describe('Request Body Types', () => {
    it('should correctly type CreateRequestBody', () => {
      const createBody: CreateRequestBody = {
        doctype: 'TestDocType',
        title: 'Test Title',
        status: 'Active',
        custom_field: 'value',
      };

      expect(createBody.doctype).toBe('TestDocType');
      expect(createBody.title).toBe('Test Title');
    });

    it('should correctly type UpdateRequestBody', () => {
      const updateBody: UpdateRequestBody = {
        doctype: 'TestDocType',
        name: 'TEST-001',
        values: {
          title: 'Updated Title',
          status: 'Completed',
        },
      };

      expect(updateBody.doctype).toBe('TestDocType');
      expect(updateBody.name).toBe('TEST-001');
      expect(updateBody.values).toHaveProperty('title');
    });

    it('should correctly type DeleteRequestBody', () => {
      const deleteBody: DeleteRequestBody = {
        doctype: 'TestDocType',
        name: 'TEST-001',
      };

      expect(deleteBody.doctype).toBe('TestDocType');
      expect(deleteBody.name).toBe('TEST-001');
    });

    it('should correctly type ListSinceParams', () => {
      const params: ListSinceParams = {
        doctype: 'TestDocType',
        modified_after: '2025-01-01T00:00:00Z',
        limit: 100,
        fields: ['name', 'title'],
        filters: { status: 'Active' },
      };

      expect(params.doctype).toBe('TestDocType');
      expect(params.limit).toBe(100);
      expect(params.fields).toContain('name');
    });
  });

  describe('Response Types', () => {
    it('should correctly type DocumentResponse', () => {
      const doc: DocumentResponse = {
        name: 'TEST-001',
        doctype: 'TestDocType',
        owner: 'user@example.com',
        creation: '2025-01-01T10:00:00Z',
        modified: '2025-01-02T10:00:00Z',
        modified_by: 'admin@example.com',
        docstatus: 0,
        idx: 1,
        custom_field: 'value',
      };

      expect(doc.name).toBe('TEST-001');
      expect(doc.docstatus).toBe(0);
    });

    it('should correctly type WireChildTableRow', () => {
      const childRow: WireChildTableRow = {
        name: 'CHILD-001',
        idx: 1,
        parent: 'PARENT-001',
        parenttype: 'ParentDocType',
        parentfield: 'items',
        item_name: 'Test Item',
        quantity: 5,
      };

      expect(childRow.parent).toBe('PARENT-001');
      expect(childRow.parentfield).toBe('items');
    });

    it('should correctly type CreateResponse', () => {
      const response: CreateResponse = {
        name: 'TEST-001',
        doctype: 'TestDocType',
        owner: 'user@example.com',
        creation: '2025-01-01T10:00:00Z',
        modified: '2025-01-01T10:00:00Z',
        modified_by: 'user@example.com',
        docstatus: 0,
        _idempotent_replay: false,
      };

      expect(response._idempotent_replay).toBe(false);
    });

    it('should correctly type UpdateResponse', () => {
      const response: UpdateResponse = {
        name: 'TEST-001',
        doctype: 'TestDocType',
        owner: 'user@example.com',
        creation: '2025-01-01T10:00:00Z',
        modified: '2025-01-02T10:00:00Z',
        modified_by: 'admin@example.com',
        docstatus: 1,
        _idempotent_replay: true,
      };

      expect(response._idempotent_replay).toBe(true);
      expect(response.docstatus).toBe(1);
    });

    it('should correctly type DeleteResponse', () => {
      const response: DeleteResponse = {
        message: 'Document deleted successfully',
        _idempotent_replay: false,
      };

      expect(response.message).toBe('Document deleted successfully');
      expect(response._idempotent_replay).toBe(false);
    });

    it('should correctly type ListSinceResponse', () => {
      const response: ListSinceResponse = {
        rows: [
          {
            name: 'TEST-001',
            doctype: 'TestDocType',
            owner: 'user@example.com',
            creation: '2025-01-01T10:00:00Z',
            modified: '2025-01-01T10:00:00Z',
            modified_by: 'user@example.com',
            docstatus: 0,
          },
        ],
        checkpoint: 'checkpoint-123',
        deleted: [{ doctype: 'TestDocType', name: 'DELETED-001' }],
      };

      expect(response.rows).toHaveLength(1);
      expect(response.checkpoint).toBe('checkpoint-123');
      expect(response.deleted).toHaveLength(1);
    });
  });

  describe('Realtime Event Types', () => {
    it('should correctly type DocChangedEvent', () => {
      const event: DocChangedEvent = {
        event: 'doc_changed',
        message: {
          doctype: 'TestDocType',
          name: 'TEST-001',
        },
      };

      expect(event.event).toBe('doc_changed');
      expect(event.message.doctype).toBe('TestDocType');
    });

    it('should correctly type DocDeletedEvent', () => {
      const event: DocDeletedEvent = {
        event: 'doc_deleted',
        message: {
          doctype: 'TestDocType',
          name: 'TEST-001',
        },
      };

      expect(event.event).toBe('doc_deleted');
      expect(event.message.name).toBe('TEST-001');
    });

    it('should correctly type PermEpochBumpEvent', () => {
      const event: PermEpochBumpEvent = {
        event: 'perm_epoch_bump',
        message: {
          epoch: 1_234_567_890,
        },
      };

      expect(event.event).toBe('perm_epoch_bump');
      expect(event.message.epoch).toBe(1_234_567_890);
    });

    it('should correctly type ConnectEvent', () => {
      const event: ConnectEvent = {
        event: 'connect',
        sid: 'session-id-123',
      };

      expect(event.event).toBe('connect');
      expect(event.sid).toBe('session-id-123');
    });

    it('should correctly type DisconnectEvent', () => {
      const event: DisconnectEvent = {
        event: 'disconnect',
        reason: 'Client disconnected',
      };

      expect(event.event).toBe('disconnect');
      expect(event.reason).toBe('Client disconnected');
    });
  });

  describe('Wire Contract Types', () => {
    it('should correctly type CreateWireContract', () => {
      const contract: CreateWireContract = {
        request: {
          method: 'POST',
          endpoint: '/api/method/create',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': 'key-123',
          },
          body: {
            doctype: 'TestDocType',
            title: 'Test',
          },
        },
        response: {
          success: {
            name: 'TEST-001',
            doctype: 'TestDocType',
            owner: 'user@example.com',
            creation: '2025-01-01T10:00:00Z',
            modified: '2025-01-01T10:00:00Z',
            modified_by: 'user@example.com',
            docstatus: 0,
          },
        },
      };

      expect(contract.request.method).toBe('POST');
      expect(contract.response.success.name).toBe('TEST-001');
    });

    it('should correctly type UpdateWireContract', () => {
      const contract: UpdateWireContract = {
        request: {
          method: 'POST',
          endpoint: '/api/method/update',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': 'etag-123',
          },
          body: {
            doctype: 'TestDocType',
            name: 'TEST-001',
            values: { title: 'Updated' },
          },
        },
        response: {
          success: {
            name: 'TEST-001',
            doctype: 'TestDocType',
            owner: 'user@example.com',
            creation: '2025-01-01T10:00:00Z',
            modified: '2025-01-02T10:00:00Z',
            modified_by: 'admin@example.com',
            docstatus: 0,
          },
        },
      };

      expect(contract.request.body.values.title).toBe('Updated');
    });
  });

  describe('Utility Types', () => {
    it('should extract success type from wire contract', () => {
      interface TestContract {
        response: {
          success: { data: string };
          error?: { message: string };
        };
      }

      type Success = WireSuccess<TestContract>;
      const successData: Success = { data: 'test' };
      expect(successData.data).toBe('test');
    });

    it('should handle WireEndpoints type', () => {
      const customEndpoints: WireEndpoints = {
        create: 'custom.create',
        update: 'custom.update',
        delete: 'custom.delete',
        backfill: 'custom.backfill',
      };

      expect(customEndpoints.create).toBe('custom.create');
      expect(customEndpoints.update).toBe('custom.update');
    });

    it('should handle MutationRequestHeaders type', () => {
      const headers: MutationRequestHeaders = {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'key-123',
        'If-Match': 'etag-456',
        'X-Frappe-CSRF-Token': 'csrf-789',
        Authorization: 'Bearer token',
      };

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Idempotency-Key']).toBe('key-123');
    });
  });

  describe('Error Response Types', () => {
    it('should correctly type ConflictErrorResponse', () => {
      const error: ConflictErrorResponse = {
        error: 'VERSION_MISMATCH',
        message: 'Version conflict',
        current_version: 'v2',
        current_doc: {
          name: 'TEST-001',
          doctype: 'TestDocType',
          owner: 'user@example.com',
          creation: '2025-01-01T10:00:00Z',
          modified: '2025-01-02T10:00:00Z',
          modified_by: 'admin@example.com',
          docstatus: 0,
        },
      };

      expect(error.error).toBe('VERSION_MISMATCH');
      expect(error.current_doc?.name).toBe('TEST-001');
    });

    it('should correctly type PreconditionFailedResponse', () => {
      const error: PreconditionFailedResponse = {
        error: 'PRECONDITION_FAILED',
        message: 'ETag mismatch',
        current_etag: 'new-etag',
      };

      expect(error.error).toBe('PRECONDITION_FAILED');
      expect(error.current_etag).toBe('new-etag');
    });

    it('should correctly type ValidationErrorResponse', () => {
      const error: ValidationErrorResponse = {
        exc_type: 'ValidationError',
        exception: 'Title is required',
        _server_messages: 'Validation failed',
      };

      expect(error.exc_type).toBe('ValidationError');
      expect(error.exception).toBe('Title is required');
    });

    it('should correctly type PermissionErrorResponse', () => {
      const error: PermissionErrorResponse = {
        exc_type: 'PermissionError',
        exception: "You don't have permission to access this document",
      };

      expect(error.exc_type).toBe('PermissionError');
    });

    it('should correctly type NotFoundErrorResponse', () => {
      const error: NotFoundErrorResponse = {
        exc_type: 'DoesNotExistError',
        exception: 'Document TEST-001 not found',
      };

      expect(error.exc_type).toBe('DoesNotExistError');
    });
  });

  describe('Docstatus Values', () => {
    it('should only allow valid docstatus values', () => {
      const draft: DocumentResponse = {
        name: 'TEST-001',
        doctype: 'TestDocType',
        owner: 'user@example.com',
        creation: '2025-01-01T10:00:00Z',
        modified: '2025-01-01T10:00:00Z',
        modified_by: 'user@example.com',
        docstatus: 0,
      };

      const submitted: DocumentResponse = {
        ...draft,
        docstatus: 1,
      };

      const cancelled: DocumentResponse = {
        ...draft,
        docstatus: 2,
      };

      expect(draft.docstatus).toBe(0);
      expect(submitted.docstatus).toBe(1);
      expect(cancelled.docstatus).toBe(2);
    });
  });
});
