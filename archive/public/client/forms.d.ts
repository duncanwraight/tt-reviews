export namespace FormHandler {
  function getCSRFToken(): string | null
  function submitFormSecure(
    formElement: any,
    options?: {}
  ): Promise<
    | {
        success: boolean
        data: any
        status: number
        error?: undefined
      }
    | {
        success: boolean
        error: string
        status: number
        data?: undefined
      }
  >
  function showFormError(formElement: any, message: any): void
  function showFormSuccess(formElement: any, message: any): void
  function hideFormMessages(formElement: any): void
}
export namespace SearchHandler {
  function init(): void
  function performSearch(inputElement?: null): void
}
export namespace TabHandler {
  function switchTab(tabName: any): void
}
export namespace PlayerFormHandler {
  function updateRepresentsDefault(): void
}
//# sourceMappingURL=forms.d.ts.map
