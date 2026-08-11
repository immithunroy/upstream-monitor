import { Schema, model, InferSchemaType, Types } from 'mongoose';

export interface TraceHop {
  ttl: number;
  ip: string | null;
  host: string | null;
  status: 'reachable' | 'unreachable';
  rtts: number[];
  avgRtt: number | null;
  asn: number | null;
  company: string;
}

export interface PingResult {
  success: boolean;
  packetsSent: number;
  packetsReceived: number;
  lossPercent: number;
  minRtt: number | null;
  maxRtt: number | null;
  avgRtt: number | null;
}

const traceReportSchema = new Schema(
  {
    destinationId: { type: Schema.Types.ObjectId, ref: 'Destination', required: true },
    destHost: { type: String, required: true },
    destName: { type: String, default: '' },
    asn: { type: Number, default: null },
    company: { type: String, default: '' },
    triggeredBy: { type: String, enum: ['scheduler', 'manual'], default: 'scheduler' },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: 0 },
    reachable: { type: Boolean, default: false },
    ping: {
      type: new Schema(
        {
          success: { type: Boolean, default: false },
          packetsSent: { type: Number, default: 0 },
          packetsReceived: { type: Number, default: 0 },
          lossPercent: { type: Number, default: 100 },
          minRtt: { type: Number, default: null },
          maxRtt: { type: Number, default: null },
          avgRtt: { type: Number, default: null },
        },
        { _id: false }
      ),
      default: {},
    },
    hops: {
      type: [
        new Schema(
          {
            ttl: { type: Number },
            ip: { type: String, default: null },
            host: { type: String, default: null },
            status: { type: String, enum: ['reachable', 'unreachable'], default: 'unreachable' },
            rtts: { type: [Number], default: [] },
            avgRtt: { type: Number, default: null },
            asn: { type: Number, default: null },
            company: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    pathFingerprint: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

traceReportSchema.index({ destinationId: 1, startedAt: -1 });
traceReportSchema.index({ startedAt: -1 });
traceReportSchema.index({ reachable: 1 });

export type TraceReportDoc = InferSchemaType<typeof traceReportSchema> & {
  _id: Types.ObjectId;
  ping: PingResult;
  hops: TraceHop[];
};

export const TraceReport = model('TraceReport', traceReportSchema);
