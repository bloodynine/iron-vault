import { z } from "zod";

const baseRollSchema = z.object({
  /** numerical roll */
  roll: z.number().int().positive(),

  /** Id of oracle table */
  tableId: z.string(),

  /** Descriptive name of oracle table. */
  tableName: z.string(),

  /** The direct label of the entry, if one exists and is different than the result. */
  raw: z.string().optional(),

  /** Composite results */
  results: z.string().array(),
});

const simpleRollSchema = baseRollSchema.extend({ kind: z.literal("simple") });

type SimpleRollSchema = z.infer<typeof simpleRollSchema>;

export type MultiRollSchema = z.infer<typeof baseRollSchema> & {
  kind: "multi";
  rolls: RollSchema[];
};

export const multiRollSchema = baseRollSchema.extend({
  kind: z.literal("multi"),
  rolls: z.lazy(() => rollSchema.array()),
}) satisfies z.ZodType<MultiRollSchema>;

export const templatedRollSchema = baseRollSchema.extend({
  kind: z.literal("templated"),
  templateString: z.string(),
  templateRolls: z.lazy(() => z.record(rollSchema)),
}) satisfies z.ZodType<TemplatedRollSchema>;

export type TemplatedRollSchema = z.infer<typeof baseRollSchema> & {
  kind: "templated";
  templateString: string;
  templateRolls: Record<string, RollSchema>;
};

export const rollSchema: z.ZodType<RollSchema> = z.discriminatedUnion("kind", [
  simpleRollSchema,
  multiRollSchema,
  templatedRollSchema,
]);

export type RollSchema =
  | SimpleRollSchema
  | MultiRollSchema
  | TemplatedRollSchema;

export const oracleSchema = z.object({
  roll: rollSchema,
  question: z.string().optional(),
});

export type OracleSchema = z.infer<typeof oracleSchema>;
