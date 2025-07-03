import { Document, Schema } from 'mongoose';

export enum LogLevel {
  NONE = 0,
  INFO = 1,
  ERROR = 2,
  WARN = 3,
  DEBUG = 4,
}

// Extend Document for Mongoose compatibility
export interface ILogEntry extends Document {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  data?: unknown; // Optional structured details for extra logging info
}

export interface ILoggingConfig extends Document {
  _id: Schema.Types.ObjectId;  // Mongoose ID
  globalLogLevel: LogLevel; // System-wide logging level
  availableClasses: string[]; // Discovered classes via DI container
  enabledClasses: string[]; // Classes actively logging
  uiToggleStates: Record<string, boolean>; // UI-driven logging toggles
  lastModified: Date;
}