import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** base64url ⇄ ArrayBuffer, as Spring Security's WebAuthn endpoints use them */
export const b64url = {
  encode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  },
  decode(value: string): ArrayBuffer {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(base64 + '==='.slice((base64.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  },
};

interface DescriptorJson {
  id: string;
  type: PublicKeyCredentialType;
  transports?: AuthenticatorTransport[];
}

/**
 * Passkeys against Spring Security's endpoints (same requests as its spring-security-webauthn.js):
 * POST /webauthn/register/options + /webauthn/register, POST /webauthn/authenticate/options +
 * /login/webauthn. Errors are thrown as codes: passkey_cancelled, passkey_unsupported, passkey_failed.
 */
@Injectable({ providedIn: 'root' })
export class PasskeyService {
  private readonly http = inject(HttpClient);
  private controller: AbortController | null = null;

  supported(): boolean {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
  }

  async register(label: string): Promise<void> {
    if (!this.supported()) throw new Error('passkey_unsupported');
    const options = await this.fetch<Record<string, unknown>>('/webauthn/register/options');
    const user = options['user'] as { id: string; name: string; displayName: string };
    const exclude = (options['excludeCredentials'] as DescriptorJson[] | undefined) ?? [];
    const publicKey = {
      ...options,
      user: { ...user, id: b64url.decode(user.id) },
      challenge: b64url.decode(options['challenge'] as string),
      excludeCredentials: exclude.map((c) => ({ ...c, id: b64url.decode(c.id) })),
    } as unknown as PublicKeyCredentialCreationOptions;

    const credential = (await this.ceremony(() =>
      navigator.credentials.create({ publicKey, signal: this.signal() }),
    )) as PublicKeyCredential;
    const response = credential.response as AuthenticatorAttestationResponse;
    const body = {
      publicKey: {
        credential: {
          id: credential.id,
          rawId: b64url.encode(credential.rawId),
          response: {
            attestationObject: b64url.encode(response.attestationObject),
            clientDataJSON: b64url.encode(response.clientDataJSON),
            transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
          },
          type: credential.type,
          clientExtensionResults: credential.getClientExtensionResults(),
          authenticatorAttachment: credential.authenticatorAttachment,
        },
        label: label.trim().slice(0, 60) || 'Passkey',
      },
    };
    const result = await this.fetch<{ success?: boolean }>('/webauthn/register', body);
    if (!result?.success) throw new Error('passkey_failed');
  }

  async authenticate(): Promise<void> {
    if (!this.supported()) throw new Error('passkey_unsupported');
    const options = await this.fetch<Record<string, unknown>>('/webauthn/authenticate/options');
    const allow = (options['allowCredentials'] as DescriptorJson[] | undefined) ?? [];
    const publicKey = {
      ...options,
      challenge: b64url.decode(options['challenge'] as string),
      allowCredentials: allow.map((c) => ({ ...c, id: b64url.decode(c.id) })),
    } as unknown as PublicKeyCredentialRequestOptions;

    const credential = (await this.ceremony(() =>
      navigator.credentials.get({ publicKey, signal: this.signal() }),
    )) as PublicKeyCredential;
    const response = credential.response as AuthenticatorAssertionResponse;
    const body = {
      id: credential.id,
      rawId: b64url.encode(credential.rawId),
      response: {
        authenticatorData: b64url.encode(response.authenticatorData),
        clientDataJSON: b64url.encode(response.clientDataJSON),
        signature: b64url.encode(response.signature),
        userHandle: response.userHandle ? b64url.encode(response.userHandle) : undefined,
      },
      credType: credential.type,
      clientExtensionResults: credential.getClientExtensionResults(),
      authenticatorAttachment: credential.authenticatorAttachment,
    };
    const result = await this.fetch<{ authenticated?: boolean }>('/login/webauthn', body);
    if (!result?.authenticated) throw new Error('passkey_failed');
  }

  private signal(): AbortSignal {
    this.controller?.abort();
    this.controller = new AbortController();
    return this.controller.signal;
  }

  private async ceremony(run: () => Promise<Credential | null>): Promise<Credential> {
    try {
      const c = await run();
      if (!c) throw new Error('passkey_cancelled');
      return c;
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'AbortError') throw new Error('passkey_cancelled');
      if (name === 'NotSupportedError' || name === 'SecurityError') throw new Error('passkey_unsupported');
      if (e instanceof Error && e.message.startsWith('passkey_')) throw e;
      throw new Error('passkey_failed');
    }
  }

  private async fetch<T>(url: string, body: unknown = null): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(url, body));
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 429) throw new Error('rate_limited');
      if (e instanceof HttpErrorResponse && e.status === 0) throw new Error('offline');
      throw new Error('passkey_failed');
    }
  }
}
