import { Schema, model, InferSchemaType, Types } from 'mongoose';

const pingSampleSchema = new Schema(
  {
    destinationId: { type: Schema.Types.ObjectId, ref: 'Destination', required: true },
    destHost: { type: String, required: true },
    destName: { type: String, default: '' },
    success: { type: Boolean, default: false },
    minRtt: { type: Number, default: null },
    maxRtt: { type: Number, default: null },
    avgRtt: { type: Number, default: null },
    lossPercent: { type: Number, default: 100 },
    packetsSent: { type: Number, default: 0 },
    packetsReceived: { type: Number, default: 0 },
    sampledAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

pingSampleSchema.index({ destinationId: 1, sampledAt: -1 });
pingSampleSchema.index({ sampledAt: -1 });

export type PingSampleDoc = InferSchemaType<typeof pingSampleSchema> & {
  _id: Types.ObjectId;
};

export const PingSample = model('PingSample', pingSampleSchema);
