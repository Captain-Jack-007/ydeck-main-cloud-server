/**
 * Shared Schema options for every model:
 *  - `timestamps: true` → automatic createdAt/updatedAt
 *  - virtual `id` getter that returns _id as a string
 *  - JSON serialization strips _id and __v in favor of `id`
 *
 * Note: not annotated with `SchemaOptions` so that Mongoose can preserve the
 * literal type information used by `InferSchemaType` on each model.
 */
export const baseSchemaOptions = {
  timestamps: true as const,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
  toObject: { virtuals: true, versionKey: false },
};
