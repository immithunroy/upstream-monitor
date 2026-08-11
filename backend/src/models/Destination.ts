import { Schema, model, InferSchemaType, Types } from 'mongoose';

export type DestinationCategory = 'service' | 'datacenter' | 'ixp' | 'utility' | 'cdn';

const destinationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    host: { type: String, required: true, trim: true, lowercase: true },
    category: {
      type: String,
      enum: ['service', 'datacenter', 'ixp', 'utility', 'cdn'],
      default: 'service',
    },
    location: { type: String, default: '' },
    region: { type: String, default: '' },
    description: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
    createdBy: { type: String, default: 'seed' },

    /* RIR attribution (AS number + company name from registry data) */
    ipAddress: { type: String, default: '' },
    asn: { type: Number, default: null },
    company: { type: String, default: '' },
    registry: { type: String, default: '' },
    country: { type: String, default: '' },
    prefix: { type: String, default: '' },
    enrichedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

destinationSchema.index({ host: 1 }, { unique: true });
destinationSchema.index({ category: 1 });
destinationSchema.index({ enabled: 1 });
destinationSchema.index({ asn: 1 });
destinationSchema.index({ company: 1 });

export type DestinationDoc = InferSchemaType<typeof destinationSchema> & {
  _id: Types.ObjectId;
};

export const Destination = model('Destination', destinationSchema);
