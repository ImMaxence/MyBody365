import { HttpErrorResponse } from '@angular/common/http';
import { errorCode } from './api.service';

describe('errorCode', () => {
  const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

  it('reads the stable code sent by the API', () => {
    expect(errorCode(http(410, { status: 410, message: 'link_used' }))).toBe('link_used');
    expect(errorCode(http(409, { message: 'email_taken' }))).toBe('email_taken');
  });

  it('maps transport problems', () => {
    expect(errorCode(http(0))).toBe('offline');
    expect(errorCode(http(429, { message: 'rate_limited' }))).toBe('rate_limited');
    expect(errorCode(http(401))).toBe('unauthenticated');
  });

  it('never shows a raw server message', () => {
    expect(errorCode(http(500, { message: 'NullPointerException at line 3' }))).toBe('generic');
    expect(errorCode(new Error('passkey_cancelled'))).toBe('passkey_cancelled');
    expect(errorCode('weird')).toBe('generic');
  });
});
