import { z } from "zod";
import { prisma } from "@/lib/db";
import type { CategoryAttribute } from "@prisma/client";

function baseSchemaFor(def: CategoryAttribute): z.ZodTypeAny {
  if (def.type === "TEXT") return z.string().trim().min(1).max(500);
  if (def.type === "NUMBER") return z.number().finite();
  if (def.type === "BOOLEAN") return z.boolean();

  // SELECT
  const options = Array.isArray(def.options)
    ? (def.options as Array<{ value: string }>).map((option) => option.value)
    : [];
  return options.length > 0 ? z.enum(options as [string, ...string[]]) : z.string();
}

function fieldSchemaFor(def: CategoryAttribute): z.ZodTypeAny {
  const base = baseSchemaFor(def);
  return def.required ? base : base.optional().nullable();
}

export interface AttributeValidationResult {
  success: boolean;
  data?: Record<string, unknown>;
  errors?: string[];
}

// The single place category-specific listing fields are ever validated —
// driven entirely by the CategoryAttribute rows, so a frontend never
// hardcodes a category's field set and a client can't smuggle in extra keys
// (the schema is .strict()).
export async function validateListingAttributes(
  categoryId: string,
  rawAttributes: unknown,
): Promise<AttributeValidationResult> {
  const definitions = await prisma.categoryAttribute.findMany({
    where: { categoryId, deletedAt: null },
  });

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const def of definitions) {
    shape[def.key] = fieldSchemaFor(def);
  }

  const schema = z.object(shape).strict();
  const input = typeof rawAttributes === "object" && rawAttributes !== null ? rawAttributes : {};
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  return { success: true, data: parsed.data };
}
