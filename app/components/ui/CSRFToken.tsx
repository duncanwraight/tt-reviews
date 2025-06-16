/**
 * CSRF Token Component
 * 
 * Automatically includes CSRF token as hidden input in forms
 */

interface CSRFTokenProps {
  token: string;
}

export function CSRFToken({ token }: CSRFTokenProps) {
  return (
    <input
      type="hidden"
      name="_csrf"
      value={token}
    />
  );
}