export namespace AuthManager {
  function isTokenExpired(token: any): any
  function clearLegacyAuth(): void
  function hasValidSession(): Promise<any>
  function getCurrentUser(): Promise<any>
  function signInSecure(
    email: any,
    password: any,
    csrfToken: any
  ): Promise<
    | {
        success: boolean
        data: any
        error?: undefined
      }
    | {
        success: boolean
        error: any
        data?: undefined
      }
  >
  function signOutSecure(csrfToken: any): Promise<boolean>
  function authenticatedFetch(url: any, options?: {}): Promise<Response>
}
export namespace HeaderAuth {
  function updateAuthButton(): Promise<void>
  function handleAuthButtonClick(): boolean
}
export namespace Navigation {
  function navigate(path: any): boolean
  function clearAuthAndRedirect(redirectUrl?: string): void
}
//# sourceMappingURL=auth.d.ts.map
