/**
 * The comment reproducer of the ONE optimistic pattern (owner items 1+4):
 * adding a comment must render IMMEDIATELY from the local docinfo overlay
 * (apply-locally), visibly pending ("Sending…", Axiom 6 HONEST STATE),
 * reconcile to the server identity on ack (no duplicate row), and roll
 * back with a visible error on failure. The pre-fix behavior was
 * post → wait for ack → refetch docinfo → first reveal ~1.7s after the
 * press (measured against the live bench).
 *
 * The add_comment RPC, the docinfo load and the Comment collection read are
 * stubbed at the fetch layer with a gate on the POST, so the specs can
 * assert what renders DURING the server round-trip. An HTTP-only
 * FrappeProvider gets a live Comment collection since MPO-270, so the
 * stub answers that read as the bench would: seed plus every acked comment.
 */

import { FrappeProvider } from '@repo/frappe-ui';
import { renderWithProviders } from '@repo/test-utils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import React from 'react';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { invalidateDocinfo } from '../shared/use-docinfo';

import { FormTimeline } from './FormTimeline';

const BASE_URL = 'https://formtimeline-optimistic.spec.test';
const USER = 'clay@example.com';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
interface JsonObject {
  [key: string]: Json;
}

/** An acknowledged add_comment carries the Comment doc; a rejected one, the server's message. */
type AddCommentReply =
  | { status: 200; payload: { message: JsonObject } }
  | { status: 417; payload: { message: string } };

const jsonResponse = (payload: Json, status = 200) =>
  Response.json(payload, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface StubOptions {
  docname: string;
  /**
   * Gate the add_comment POST. Resolve with `{ status, payload }` — a 4xx
   * status models a server rejection (no fetch-level rejection, so the
   * HTTP client's transient-error retry never kicks in).
   */
  onAddComment: () => Promise<AddCommentReply>;
}

/**
 * Fetch stub covering exactly what this screen calls: get_docinfo (GET),
 * the Comment collection read, the CSRF bootstrap, and the add_comment POST
 * (delegated to the gate).
 */
const stubFetch = ({ docname, onAddComment }: StubOptions) => {
  const seedComment = {
    name: 'SEED-COMMENT-1',
    comment_type: 'Comment',
    content: '<div>seed comment</div>',
    owner: USER,
    creation: '2026-08-10 09:00:00',
  };
  const serverComments: JsonObject[] = [
    {
      ...seedComment,
      doctype: 'Comment',
      reference_doctype: 'ToDo',
      reference_name: docname,
      comment_email: USER,
      comment_by: 'Clay Risser',
      modified: seedComment.creation,
    },
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes('get_csrf_token')) {
        return jsonResponse({ message: 'test-csrf-token' });
      }
      if (url.includes('frappe.desk.form.load.get_docinfo')) {
        return jsonResponse({
          docinfo: {
            doctype: 'ToDo',
            name: docname,
            user_info: { [USER]: { fullname: 'Clay Risser', name: USER } },
            comments: [seedComment],
            versions: [],
            communications: [],
            automated_messages: [],
            assignment_logs: [],
            attachment_logs: [],
            like_logs: [],
            info_logs: [],
          },
        });
      }
      if (url.includes('/api/resource/Comment')) {
        return jsonResponse({ data: serverComments });
      }
      if (url.includes('frappe.desk.form.utils.add_comment')) {
        const reply = await onAddComment();
        if (reply.status === 200) {
          serverComments.push({ ...reply.payload.message, reference_doctype: 'ToDo', reference_name: docname });
        }
        return jsonResponse(reply.payload, reply.status);
      }
      throw new Error(`Unexpected fetch in FormTimeline optimistic spec: ${url}`);
    }),
  );
};

const renderTimeline = (docname: string) =>
  renderWithProviders(
    <FrappeProvider baseURL={BASE_URL}>
      <FormTimeline
        doctype="ToDo"
        name={docname}
        currentUser={USER}
      />
    </FrappeProvider>,
  );

const submitComment = async (text: string) => {
  const composer = await screen.findByPlaceholderText('Add a comment…');
  fireEvent.change(composer, { target: { value: text } });
  const submit = await screen.findByText('Comment');
  fireEvent.click(submit);
};

describe('FormTimeline optimistic comment (apply-locally-then-reconcile)', () => {
  beforeAll(async () => {
    if (!i18next.isInitialized) {
      // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
      await i18next.use(initReactI18next).init({
        lng: 'en',
        interpolation: { escapeValue: false },
        resources: { en: { translation: {} } },
      });
    }
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders the comment immediately as pending, then reconciles to the server identity on ack', async () => {
    const docname = `OPT-ACK-${Date.now()}`;
    invalidateDocinfo('ToDo', docname);
    const { promise: ackGate, resolve: resolveAck } = Promise.withResolvers<AddCommentReply>();
    stubFetch({ docname, onAddComment: async () => await ackGate });

    renderTimeline(docname);
    await screen.findByText('seed comment');
    await submitComment('optimistic hello');

    // DURING the round-trip: the comment is already on screen, visibly
    // pending — realtime/refetch is NOT the first reveal.
    await screen.findByText('optimistic hello');
    expect(screen.getByText('Sending…')).toBeTruthy();

    // Ack lands with the authoritative Comment doc (server name).
    resolveAck({
      status: 200,
      payload: {
        message: {
          name: 'SRV-COMMENT-9',
          doctype: 'Comment',
          comment_type: 'Comment',
          content: '<div>optimistic hello</div>',
          owner: USER,
          comment_email: USER,
          comment_by: 'Clay Risser',
          creation: '2026-08-13 12:00:00',
        },
      },
    });

    // Reconcile: pending marker gone, EXACTLY ONE row remains (temp-id
    // overlay converged into the server record — no duplicates).
    await waitFor(() => {
      expect(screen.queryByText('Sending…')).toBeNull();
    });
    expect(screen.getAllByText('optimistic hello')).toHaveLength(1);
    expect(screen.getByText('seed comment')).toBeTruthy();
  });

  it('rolls back the pending comment and shows a visible error when the RPC fails', async () => {
    const docname = `OPT-FAIL-${Date.now()}`;
    invalidateDocinfo('ToDo', docname);
    const { promise: ackGate, resolve: resolveAck } = Promise.withResolvers<AddCommentReply>();
    stubFetch({ docname, onAddComment: async () => await ackGate });

    renderTimeline(docname);
    await screen.findByText('seed comment');
    await submitComment('doomed comment');

    // Applied locally first.
    await screen.findByText('doomed comment');
    expect(screen.getByText('Sending…')).toBeTruthy();

    resolveAck({ status: 417, payload: { message: 'server exploded' } });

    // Rollback: the pending row is gone; a visible error remains (the
    // server's own message, surfaced through the inline error slot); the
    // rest of the feed is untouched.
    await waitFor(() => {
      expect(screen.queryByText('doomed comment')).toBeNull();
    });
    expect(screen.queryByText('Sending…')).toBeNull();
    await screen.findByText('server exploded');
    expect(screen.getByText('seed comment')).toBeTruthy();
  });
});
