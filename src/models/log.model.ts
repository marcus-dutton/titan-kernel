import mongoose, { Schema, Model } from 'mongoose';
import { ILogEntry, ILoggingConfig, LogLevel } from '../interfaces/logging.interface';
import { TransformMongoose } from '../utils/transform-mongoose';

// #region LogEntry Mongoose Schema
export interface LogEntry extends ILogEntry {}

const LogEntrySchema = new mongoose.Schema<LogEntry>({
  timestamp: { type: Date, default: Date.now, required: true },
  level: {
    type: Number,
    enum: Object.values(LogLevel).filter((v) => typeof v === 'number'),
    required: true,
  },
  source: { type: String, required: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: null },
});

LogEntrySchema.index({ source: 'text', message: 'text' });
LogEntrySchema.index({ timestamp: 1 });
LogEntrySchema.index({ level: 1, timestamp: -1 });
LogEntrySchema.index({ source: 1, timestamp: -1 });
LogEntrySchema.index({ "$**": 1 });

// Apply TransformMongoose utility for consistent JSON output
TransformMongoose(LogEntrySchema, { removeFields: [] });

export const LogEntry = mongoose.model<ILogEntry>('Backend_Logging_Logs', LogEntrySchema);
// #endregion

// #region LogConfig Mongoose Schema
export interface LogConfig extends ILoggingConfig {}

const LogConfigSchema = new mongoose.Schema<LogConfig>({
  _id: { type: String, required: true },
  globalLogLevel: { type: Number, enum: Object.values(LogLevel), required: true, default: LogLevel.NONE },
  availableClasses: { type: [String], default: [] },
  enabledClasses: { type: [String], default: [] },
  uiToggleStates: { type: Map, of: Boolean, default: {} },
  lastModified: { type: Date, default: Date.now },
});

// Apply TransformMongoose utility for consistent JSON output
TransformMongoose(LogConfigSchema, { removeFields: [] });

export const LogConfig = mongoose.model<ILoggingConfig>('Backend_Logging_Config', LogConfigSchema);
// #endregion