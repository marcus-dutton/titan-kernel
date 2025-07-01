import { Schema, model, Document } from 'mongoose';
import { LogLevel } from '../services/titan-logger.service';

export interface ILogDocument extends Document {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: any;
  source?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LogSchema = new Schema({
  timestamp: { type: Date, required: true },
  level: { type: Number, required: true },
  message: { type: String, required: true },
  data: { type: Schema.Types.Mixed },
  source: { type: String },
}, {
  timestamps: true,
  collection: 'titan_logs'
});

// Add indexes for efficient querying
LogSchema.index({ timestamp: -1 });
LogSchema.index({ level: 1 });
LogSchema.index({ source: 1 });

export const LogModel = model<ILogDocument>('TitanLog', LogSchema);
