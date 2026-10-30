import { describe, expect, it } from 'vitest';
import { inviteShareText, newCode } from '../../src/domain/auth';

describe('invite sharing', () => {
  it('codes are well-formed and unique across many draws', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => newCode('Priya')));
    expect(codes.size).toBe(2000);
    for (const c of codes) expect(c).toMatch(/^PR-[A-HJ-NP-Z2-9]{8}$/);
  });

  it('share text carries the app link and the personal code', () => {
    const t = inviteShareText({ name: 'Priya', workspace: 'Kadam Family', inviter: 'Kunal', role: 'member', code: 'PR-ABCD2345', url: 'https://app.example' });
    expect(t).toContain('https://app.example');
    expect(t).toContain('PR-ABCD2345');
    expect(t).toContain('Kadam Family');
    expect(`https://wa.me/?text=${encodeURIComponent(t)}`).not.toMatch(/\s/);
  });
});
