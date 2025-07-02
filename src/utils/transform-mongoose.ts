import { Schema } from "mongoose";

export interface ToJSONOptions {
  /**
   * An array of additional fields to remove from the JSON output.
   * For example, you might pass ["password"].
   */
  removeFields?: string[];

  /**
   * An optional callback to further transform the JSON output.
   * It receives the document and the transformed plain object.
   */
  additionalTransform?: (doc: any, ret: any) => any;
  
  /**
   * Whether to include virtual properties in the JSON output.
   * Defaults to false.
   */
  virtuals?: boolean;
}

/**
 * Applies a default toJSON transform to the schema that:
 * - Sets ret.id = ret._id
 * - Deletes _id and __v
 * - Optionally includes virtuals
 * 
 * Additional fields can be removed by specifying options.removeFields.
 * A further transform can be applied via options.additionalTransform.
 */
export function TransformMongoose(
  schema: Schema,
  options?: ToJSONOptions
): void {
  schema.set("toJSON", {
    virtuals: options?.virtuals || false, // Include virtuals if specified, default to false
    transform: (_doc, ret) => {
      // Always transform: add 'id' field from _id, remove _id and __v.
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;

      // Remove any additional fields passed in options.
      if (options?.removeFields) {
        options.removeFields.forEach((field) => {
          delete ret[field];
        });
      }

      // Apply any additional transform function provided.
      if (options?.additionalTransform) {
        return options.additionalTransform(_doc, ret);
      }

      return ret;
    },
  });
}
