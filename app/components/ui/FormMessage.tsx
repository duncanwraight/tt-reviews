interface FormMessageProps {
  type: "error" | "success";
  message: string;
}

export function FormMessage({ type, message }: FormMessageProps) {
  const baseClasses = "mb-4 px-4 py-3 rounded border";
  const typeClasses = {
    error: "bg-red-50 border-red-200 text-red-700",
    success: "bg-green-50 border-green-200 text-green-700",
  };

  return <div className={`${baseClasses} ${typeClasses[type]}`}>{message}</div>;
}
