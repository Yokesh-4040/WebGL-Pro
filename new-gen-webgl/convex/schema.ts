import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    // Legacy FTP fields
    buildFolder: v.optional(v.string()),
    ftpHost: v.optional(v.string()),
    ftpUser: v.optional(v.string()),
    ftpPass: v.optional(v.string()),
    ftpDomain: v.optional(v.string()),
    baseDir: v.optional(v.string()),
    injectMode: v.optional(v.string()),
    uploadMode: v.optional(v.string()),
    uploadHtaccess: v.optional(v.boolean()),
    buildZipId: v.optional(v.id("_storage")),
    buildZipUrl: v.optional(v.string()),
  }),
  sessions: defineTable({
    projectName: v.string(),
    startTime: v.number(),
    duration: v.number(), // in seconds
  }),
  bugReports: defineTable({
    projectName: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(), // "Visual", "Audio", "Physics", "Performance", "Script Error", "Other"
    severity: v.string(), // "Low", "Medium", "High", "Critical"
    screenshotId: v.optional(v.id("_storage")),
    videoId: v.optional(v.id("_storage")),
    consoleLogs: v.optional(v.string()), // captured console errors/warning stacks
    timestamp: v.number(),
  }),
});
