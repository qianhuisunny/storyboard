import { expect, test } from '@playwright/test';
import { requestChatBrief } from '../src/components/ChatBriefBuilder/chatBriefRequest';

test.describe('Chat brief session ownership', () => {
  test('does not send a caller-claimed owner header', async () => {
      let capturedUrl: string | URL | Request | undefined;
      let capturedInit: RequestInit | undefined;

      const fetchStub: typeof fetch = async (input, init) => {
        capturedUrl = input;
        capturedInit = init;
        return new Response(JSON.stringify({ phase_complete: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      await requestChatBrief(
        'project-owner-regression',
        {
          messages: [],
          fields_so_far: {},
          onboarding: {
            topic: 'Identity regression',
            duration: 60,
            audience: 'Reviewers',
            intent_route: 'educate',
            content_mode: '',
            source_context: '',
          },
        },
        fetchStub,
      );

      expect(capturedUrl).toBe('/api/project/project-owner-regression/chat-brief');
      expect(new Headers(capturedInit?.headers).get('X-User-ID')).toBeNull();
  });
});
