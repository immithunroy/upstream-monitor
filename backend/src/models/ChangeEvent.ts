import { Schema, model, InferSchemaType, Types } from 'mongoose';

export type ChangeSeverity = 'info' | 'warning' | 'critical';

export interface ChangeDetail {
  type: string;
  field?: string;
  hopTtl?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
  message: string;
}

const changeEventSchema = new Schema(
  {
    destinationId: { type: Schema.Types.ObjectId, ref: 'Destination', required: true },
    destHost: { type: String, required: true },
    destName: { type: String, default: '' },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
    },
    summary: { type: String, required: true },
    previousReportId: { type: Schema.Types.ObjectId, ref: 'TraceReport', default: null },
    currentReportId: { type: Schema.Types.ObjectId, ref: 'TraceReport', default: null },
    changes: {
      type: [
        new Schema(
          {
            type: { type: String, required: true },
            field: { type: String, default: '' },
            hopTtl: { type: Number, default: null },
            oldValue: { type: Schema.Types.Mixed, default: null },
            newValue: { type: Schema.Types.Mixed, default: null },
            message: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    acknowledged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

changeEventSchema.index({ destinationId: 1, createdAt: -1 });
changeEventSchema.index({ severity: 1 });
changeEventSchema.index({ createdAt: -1 });

export type ChangeEventDoc = InferSchemaType<typeof changeEventSchema> & {
  _id: Types.ObjectId;
  changes: ChangeDetail[];
};

export const ChangeEvent = model('ChangeEvent', changeEventSchema);
