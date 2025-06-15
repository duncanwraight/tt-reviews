import { schemaService } from "~/lib/schema.server";

interface StructuredDataProps {
  schema: any | any[];
}

/**
 * Component for rendering JSON-LD structured data
 * This component should be included in the <head> section of pages
 */
export function StructuredData({ schema }: StructuredDataProps) {
  const jsonLd = Array.isArray(schema) 
    ? schemaService.generateMultipleSchemas(schema)
    : schemaService.toJsonLd(schema);

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
    />
  );
}

/**
 * Hook for generating structured data in route meta functions
 * Returns the script tag as a meta object for React Router
 */
export function useStructuredDataMeta(schema: any | any[]) {
  const jsonLd = Array.isArray(schema) 
    ? schemaService.generateMultipleSchemas(schema)
    : schemaService.toJsonLd(schema);

  return {
    "script:ld+json": jsonLd,
  };
}