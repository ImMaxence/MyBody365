import { HttpBackend, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { DOCUMENT, inject } from '@angular/core';
import { filter, switchMap, take } from 'rxjs';

const COOKIE = 'XSRF-TOKEN';
const HEADER = 'X-XSRF-TOKEN';
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Spring writes the CSRF token in a cookie on every API response. When a write is the very first
 * request of a visit (an invitation link opened from a message, the access-request form…), there is
 * no cookie yet: fetch one first, through the raw backend so this interceptor is not re-entered.
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (!WRITES.has(req.method) || /^https?:\/\//.test(req.url)) return next(req);
  const doc = inject(DOCUMENT);
  const read = () => {
    const raw = doc.cookie.split('; ').find((c) => c.startsWith(COOKIE + '='));
    return raw ? decodeURIComponent(raw.slice(COOKIE.length + 1)) : null;
  };
  const token = read();
  if (token) return next(req.clone({ setHeaders: { [HEADER]: token } }));
  return inject(HttpBackend)
    .handle(new HttpRequest('GET', '/api/auth/providers'))
    .pipe(
      filter((event) => event.type !== 0),
      take(1),
      switchMap(() => {
        const fresh = read();
        return next(fresh ? req.clone({ setHeaders: { [HEADER]: fresh } }) : req);
      }),
    );
};
