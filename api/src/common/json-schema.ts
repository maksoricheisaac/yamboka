import { z, type ZodType } from 'zod';

/** JSON Schema d'un schéma Zod, pour la documentation Swagger ; retombe sur un objet libre si non représentable. */
export function jsonSchema(schema: ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
    });
  } catch {
    return { type: 'object' };
  }
}
